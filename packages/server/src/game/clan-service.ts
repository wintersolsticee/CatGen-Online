import {
  CLANS, GAME_CONFIG, RANKS, S2C, canChangeRank, canLeaveClan, countItem, getItem, getPrey, hasPermission, removeItem, addItem, getClan, sanitizeChat, filterChat,
  type ClanId, type ClanInfo, type ClanRelation, type Rank,
} from "@catgen/shared";
import type { ClanRecord } from "../db/clans.ts";
import type { GameContext, PlayerRuntime } from "./context.ts";
import { markDirty } from "./players.ts";

/**
 * Clan state (fresh-kill pile, herb store, relations, announcements) and
 * Clan actions. Records are cached in memory and flushed to the database.
 */
export class ClanService {
  private records = new Map<ClanId, ClanRecord>();
  private announcements = new Map<ClanId, { text: string; author: string; ts: number }[]>();
  private members = new Map<ClanId, { id: string; name: string; rank: Rank }[]>();
  private dirty = new Set<ClanId>();
  private infoDirty = new Set<ClanId>();

  constructor(private ctx: GameContext) {}

  async load() {
    for (const r of await this.ctx.repos.clans.all()) this.records.set(r.id, r);
    for (const c of CLANS) {
      this.announcements.set(c.id, await this.ctx.repos.clans.announcements(c.id));
      this.members.set(c.id, await this.ctx.repos.characters.clanMembers(c.id));
    }
  }

  record(clan: ClanId): ClanRecord {
    let r = this.records.get(clan);
    if (!r) this.records.set(clan, (r = { id: clan, freshKill: {}, herbStore: {}, relations: {} }));
    return r;
  }

  private touch(clan: ClanId) {
    this.dirty.add(clan);
    this.infoDirty.add(clan);
  }

  async flush() {
    const ids = [...this.dirty];
    this.dirty.clear();
    await Promise.all(ids.map((id) => this.ctx.repos.clans.save(this.record(id))));
  }

  /** Effective relation between two Clans: allied only if both agree; rival if either says so. */
  relation(a: ClanId, b: ClanId): ClanRelation {
    const ab = this.record(a).relations[b] ?? "neutral";
    const ba = this.record(b).relations[a] ?? "neutral";
    if (ab === "rival" || ba === "rival") return "rival";
    if (ab === "allied" && ba === "allied") return "allied";
    return "neutral";
  }

  info(clan: ClanId): ClanInfo {
    const r = this.record(clan);
    const online = new Set([...this.ctx.players.values()].map((p) => p.char.id));
    return {
      clan,
      freshKill: r.freshKill,
      herbStore: r.herbStore,
      announcements: this.announcements.get(clan) ?? [],
      relations: Object.fromEntries(CLANS.filter((c) => c.id !== clan).map((c) => [c.id, this.relation(clan, c.id)])),
      members: (this.members.get(clan) ?? []).map((m) => ({ ...m, online: online.has(m.id) })),
    };
  }

  /** Push clan info to members whose Clan changed (call each tick). */
  flushInfo() {
    if (!this.infoDirty.size) return;
    for (const p of this.ctx.players.values()) {
      if (p.char.clan && this.infoDirty.has(p.char.clan)) p.client.send(S2C.clanInfo, this.info(p.char.clan));
    }
    this.infoDirty.clear();
  }

  markInfoDirty(clan: ClanId | null) {
    if (clan) this.infoDirty.add(clan);
  }

  private near(p: PlayerRuntime, kind: "fresh_kill_pile" | "medicine_den", radiusBonus = 0): boolean {
    if (!p.char.clan) return false;
    const loc = this.ctx.map.location(kind, p.char.clan);
    return !!loc && Math.hypot(loc.x - p.state.x, loc.y - p.state.y) <= loc.radius + radiusBonus;
  }

  isNearOwnPile(p: PlayerRuntime) {
    return this.near(p, "fresh_kill_pile");
  }

  /** Drop all carried prey on the Clan's fresh-kill pile. */
  depositPrey(p: PlayerRuntime): boolean {
    if (!p.char.clan || !this.isNearOwnPile(p)) return false;
    const rec = this.record(p.char.clan);
    let n = 0;
    for (const stack of [...p.char.inventory]) {
      if (getItem(stack.itemId)?.category !== "prey") continue;
      rec.freshKill[stack.itemId] = (rec.freshKill[stack.itemId] ?? 0) + stack.qty;
      p.char.inventory = removeItem(p.char.inventory, stack.itemId, stack.qty).inventory;
      n += stack.qty;
      for (let i = 0; i < stack.qty; i++) this.ctx.awardXp(p, "depositPrey");
    }
    if (!n) return false;
    this.touch(p.char.clan);
    markDirty(p);
    this.ctx.notify(p, "success", `You added ${n} piece${n > 1 ? "s" : ""} of prey to the fresh-kill pile. Your Clan will eat well!`);
    return true;
  }

  eatFromPile(p: PlayerRuntime) {
    if (!p.char.clan) return this.ctx.notify(p, "warning", "Loners must hunt for themselves.");
    if (!this.isNearOwnPile(p)) return this.ctx.notify(p, "warning", "You need to be at your Clan's fresh-kill pile.");
    if (!hasPermission(p.char.rank, "eat_from_pile")) return;
    if (p.state.hunger > GAME_CONFIG.stats.maxHunger - 10) return this.ctx.notify(p, "info", "You're not hungry. Leave the prey for your Clanmates.");
    const rec = this.record(p.char.clan);
    const species = Object.entries(rec.freshKill).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!species) return this.ctx.notify(p, "warning", "The fresh-kill pile is empty! Your Clan needs hunters.");
    rec.freshKill[species] -= 1;
    if (rec.freshKill[species] <= 0) delete rec.freshKill[species];
    const food = getPrey(species)?.foodValue ?? 15;
    p.state.hunger = Math.min(GAME_CONFIG.stats.maxHunger, p.state.hunger + food);
    p.state.pose = "eat";
    this.touch(p.char.clan);
    this.ctx.notify(p, "success", `You eat a ${getPrey(species)?.name.toLowerCase() ?? species} from the pile.`);
  }

  depositHerb(p: PlayerRuntime, itemId: string, qty: number) {
    if (!p.char.clan || !this.near(p, "medicine_den", 60)) return this.ctx.notify(p, "warning", "Go to your Clan's medicine den to store herbs.");
    if (getItem(itemId)?.category !== "herb") return;
    const have = countItem(p.char.inventory, itemId);
    const n = Math.min(have, Math.max(1, Math.floor(qty)));
    if (n <= 0) return;
    p.char.inventory = removeItem(p.char.inventory, itemId, n).inventory;
    const rec = this.record(p.char.clan);
    rec.herbStore[itemId] = (rec.herbStore[itemId] ?? 0) + n;
    this.touch(p.char.clan);
    markDirty(p);
    this.ctx.notify(p, "success", `Stored ${n} ${getItem(itemId)!.name} in the medicine den.`);
  }

  withdrawHerb(p: PlayerRuntime, itemId: string, qty: number) {
    if (!p.char.clan || !this.near(p, "medicine_den", 60)) return this.ctx.notify(p, "warning", "You must be in the medicine den.");
    if (!hasPermission(p.char.rank, "access_herb_store")) return this.ctx.notify(p, "warning", "Only medicine cats and the leader may take from the herb store.");
    const rec = this.record(p.char.clan);
    const n = Math.min(rec.herbStore[itemId] ?? 0, Math.max(1, Math.floor(qty)));
    if (n <= 0) return;
    const res = addItem(p.char.inventory, itemId, n);
    if (!res.ok) return this.ctx.notify(p, "warning", res.error ?? "Inventory full.");
    p.char.inventory = res.inventory;
    rec.herbStore[itemId] -= res.moved;
    if (rec.herbStore[itemId] <= 0) delete rec.herbStore[itemId];
    if (!p.char.knownHerbs.includes(itemId)) p.char.knownHerbs = [...p.char.knownHerbs, itemId];
    this.touch(p.char.clan);
    markDirty(p);
  }

  private async clanHasRank(clan: ClanId, rank: Rank): Promise<boolean> {
    if ([...this.ctx.players.values()].some((p) => p.char.clan === clan && p.char.rank === rank)) return true;
    return this.ctx.repos.characters.clanHasRank(clan, rank);
  }

  private async applyRank(targetId: string, clan: ClanId | null, rank: Rank) {
    const online = this.ctx.playerByCharId(targetId);
    if (online) {
      online.char.clan = clan;
      online.char.rank = rank;
      markDirty(online);
    }
    await this.ctx.repos.characters.setClanRank(targetId, clan, rank);
  }

  private async refreshMembers(clan: ClanId | null) {
    if (!clan) return;
    this.members.set(clan, await this.ctx.repos.characters.clanMembers(clan));
    this.infoDirty.add(clan);
  }

  private broadcastClan(clan: ClanId, text: string) {
    for (const p of this.ctx.players.values()) {
      if (p.char.clan === clan) this.ctx.sendChat(p, { channel: "announcement", from: getClan(clan)!.name, fromId: "", clan, text, ts: this.ctx.now() });
    }
  }

  async setRank(p: PlayerRuntime, targetId: string, newRank: Rank) {
    const target = this.ctx.playerByCharId(targetId)?.char ?? (await this.ctx.repos.characters.get(targetId));
    if (!target) return this.ctx.notify(p, "error", "That cat could not be found.");
    const hasDeputy = newRank === "deputy" ? await this.clanHasRank(target.clan!, "deputy") : false;
    const check = canChangeRank({ id: p.char.id, rank: p.char.rank, clan: p.char.clan }, { id: target.id, rank: target.rank, clan: target.clan }, newRank, hasDeputy);
    if (!check.ok) return this.ctx.notify(p, "warning", check.reason);
    await this.applyRank(target.id, target.clan, newRank);
    await this.refreshMembers(target.clan);
    this.broadcastClan(target.clan!, `${p.char.name} has named ${target.name} a ${RANKS[newRank].name}!`);
  }

  async claimLeadership(p: PlayerRuntime) {
    const clan = p.char.clan;
    if (!clan) return;
    if (await this.clanHasRank(clan, "leader")) return this.ctx.notify(p, "warning", "Your Clan already has a leader.");
    const hasDeputy = await this.clanHasRank(clan, "deputy");
    const eligible = p.char.rank === "deputy" || (!hasDeputy && p.char.rank === "warrior");
    if (!eligible) return this.ctx.notify(p, "warning", hasDeputy ? "Only the deputy may take up leadership." : "Only a warrior may claim leadership.");
    await this.applyRank(p.char.id, clan, "leader");
    await this.refreshMembers(clan);
    this.broadcastClan(clan, `${p.char.name} has received their nine lives from StarClan and now leads ${getClan(clan)!.name}!`);
  }

  async transferLeadership(p: PlayerRuntime, targetId: string) {
    if (p.char.rank !== "leader" || !p.char.clan) return this.ctx.notify(p, "warning", "Only the leader can do that.");
    const target = this.ctx.playerByCharId(targetId)?.char ?? (await this.ctx.repos.characters.get(targetId));
    if (!target || target.clan !== p.char.clan || !["deputy", "warrior"].includes(target.rank)) return this.ctx.notify(p, "warning", "Leadership can only pass to a warrior or the deputy of your Clan.");
    await this.applyRank(target.id, p.char.clan, "leader");
    await this.applyRank(p.char.id, p.char.clan, "elder");
    await this.refreshMembers(p.char.clan);
    this.broadcastClan(p.char.clan, `${p.char.name} has stepped down. ${target.name} is the new leader!`);
  }

  async joinClan(p: PlayerRuntime, clan: ClanId) {
    if (p.char.clan) return this.ctx.notify(p, "warning", "You must leave your Clan first.");
    const camp = this.ctx.map.location("camp", clan);
    if (!camp || Math.hypot(camp.x - p.state.x, camp.y - p.state.y) > camp.radius) return this.ctx.notify(p, "warning", `Travel to the ${getClan(clan)!.name} camp to ask to join.`);
    const rank: Rank = p.char.rank === "kit" ? "kit" : "warrior";
    await this.applyRank(p.char.id, clan, rank);
    await this.refreshMembers(clan);
    this.broadcastClan(clan, `${p.char.name} has joined ${getClan(clan)!.name}. Welcome them!`);
  }

  async leaveClan(p: PlayerRuntime) {
    const clan = p.char.clan;
    if (!clan) return;
    const check = canLeaveClan(p.char.rank);
    if (!check.ok) return this.ctx.notify(p, "warning", check.reason);
    const rank: Rank = p.char.rank === "kit" ? "kit" : "warrior";
    await this.applyRank(p.char.id, null, rank);
    await this.refreshMembers(clan);
    this.broadcastClan(clan, `${p.char.name} has left the Clan to live as a loner.`);
  }

  async announce(p: PlayerRuntime, text: string) {
    if (!p.char.clan || !hasPermission(p.char.rank, "announce")) return this.ctx.notify(p, "warning", "Your rank cannot make Clan announcements.");
    const clean = sanitizeChat(text);
    if (!clean) return;
    const final = filterChat(clean);
    await this.ctx.repos.clans.addAnnouncement(p.char.clan, p.char.name, final);
    const list = this.announcements.get(p.char.clan) ?? [];
    list.unshift({ text: final, author: p.char.name, ts: this.ctx.now() });
    this.announcements.set(p.char.clan, list.slice(0, 10));
    this.infoDirty.add(p.char.clan);
    this.broadcastClan(p.char.clan, `${p.char.name}: ${final}`);
  }

  setRelation(p: PlayerRuntime, other: ClanId, relation: ClanRelation) {
    if (!p.char.clan || !hasPermission(p.char.rank, "set_relations")) return this.ctx.notify(p, "warning", "Only the leader decides alliances and rivalries.");
    if (other === p.char.clan) return;
    this.record(p.char.clan).relations[other] = relation;
    this.touch(p.char.clan);
    this.touch(other);
    const verb = relation === "allied" ? "offers an alliance to" : relation === "rival" ? "declares rivalry with" : "is at peace with";
    this.broadcastClan(p.char.clan, `${getClan(p.char.clan)!.name} ${verb} ${getClan(other)!.name}.`);
    this.broadcastClan(other, `${getClan(p.char.clan)!.name} ${verb} ${getClan(other)!.name}.`);
  }
}

import { Room, type Client } from "colyseus";
import {
  C2S, S2C, GAME_CONFIG, getWorldClock, validate, isClanId,
  type ChatEvent, type NoticeEvent, type WorldMap, type CharacterData,
} from "@catgen/shared";
import { WorldState } from "./schema.ts";
import type { Repos } from "../db/index.ts";
import type { Account } from "../db/accounts.ts";
import { verifyToken } from "../services/auth.ts";
import type { GameContext, PlayerRuntime } from "../game/context.ts";
import { createRuntime, privateState, snapshotCharacter, awardXp } from "../game/players.ts";
import { handleInput } from "../game/movement-system.ts";
import { handleAttack, tickCombat } from "../game/combat-system.ts";
import { spawnPrey, tickPrey } from "../game/prey-system.ts";
import { spawnForage, tickForage, nearestForage, collectForage } from "../game/forage-system.ts";
import { tickSurvival } from "../game/survival-system.ts";
import { ClanService } from "../game/clan-service.ts";
import { ChatSystem } from "../game/chat-system.ts";
import { WorldSystem } from "../game/world-system.ts";
import { useItem, equip, dropItem, craftItem } from "../game/items-system.ts";

/** Dependencies injected before the room is defined (see index.ts). */
export interface WorldRoomDeps {
  repos: Repos;
  map: WorldMap;
  worldId?: string;
}

interface JoinAuth {
  account: Account;
  character: CharacterData;
  blocked: string[];
}

/**
 * The shared game world. One room = one map instance (up to maxClients players).
 * Each concern lives in its own system module under src/game; this class only
 * wires Colyseus messages and the simulation loop to those systems.
 */
export class WorldRoom extends Room<WorldState> {
  static deps: WorldRoomDeps;
  override maxClients = 150;

  private ctx!: GameContext;
  private players = new Map<string, PlayerRuntime>();
  private clans!: ClanService;
  private chat!: ChatSystem;
  private world!: WorldSystem;
  private saveTimer = 0;
  private clanFlushTimer = 0;
  private worldId = "world";

  override async onCreate() {
    const { repos, map, worldId } = WorldRoom.deps;
    this.worldId = worldId ?? "world";
    this.setState(new WorldState());
    const saved = await repos.world.load(this.worldId);
    this.state.worldTime = saved.worldTime || GAME_CONFIG.time.dayLengthMs * 0.3; // start in the morning
    this.setPatchRate(1000 / GAME_CONFIG.tickRate);

    const room = this;
    this.ctx = {
      map, repos, state: this.state, players: this.players,
      rng: Math.random,
      now: () => Date.now(),
      clock: () => getWorldClock(room.state.worldTime),
      notify: (p, kind, text) => p.client.send(S2C.notice, { kind, text } satisfies NoticeEvent),
      sendChat: (p, ev: ChatEvent) => p.client.send(S2C.chat, ev),
      broadcastNear: (x, y, radius, type, payload) => {
        for (const p of room.players.values()) if (Math.hypot(p.state.x - x, p.state.y - y) <= radius) p.client.send(type, payload);
      },
      playerByCharId: (id) => [...room.players.values()].find((p) => p.char.id === id),
      playerByName: (name) => [...room.players.values()].find((p) => p.char.name.toLowerCase() === name.toLowerCase()),
      awardXp: (p, reward) => awardXp(room.ctx, p, reward),
    };
    this.clans = new ClanService(this.ctx);
    await this.clans.load();
    this.chat = new ChatSystem(this.ctx);
    this.world = new WorldSystem(this.ctx, this.clans);
    spawnPrey(this.ctx, 40);
    spawnForage(this.ctx, GAME_CONFIG.world.maxHerbNodes);
    this.registerMessages();
    this.setSimulationInterval((dt) => this.safeTick(dt), 1000 / GAME_CONFIG.tickRate);
  }

  /** Validate the JWT and the requested character before the client joins. */
  override async onAuth(_client: Client, options: { token?: string; characterId?: string }): Promise<JoinAuth> {
    const { repos } = WorldRoom.deps;
    const payload = options?.token ? verifyToken(options.token) : null;
    if (!payload) throw new Error("Not logged in");
    const account = await repos.accounts.byId(payload.sub);
    if (!account) throw new Error("Account not found");
    if (account.bannedUntil && account.bannedUntil > new Date()) throw new Error("This account is banned");
    if (typeof options.characterId !== "string") throw new Error("No character selected");
    const character = await repos.characters.getOwned(options.characterId, account.id);
    if (!character) throw new Error("Character not found");
    // One session per character: kick any older session.
    for (const p of this.players.values()) {
      if (p.char.id === character.id) p.client.leave(4002, "Logged in elsewhere");
    }
    const blocked = (await repos.social.blocked(character.id)).map((b) => b.id);
    return { account, character, blocked };
  }

  override onJoin(client: Client, _options: unknown, auth: JoinAuth) {
    const p = createRuntime(this.ctx, client, auth.account, auth.character, auth.blocked);
    this.players.set(client.sessionId, p);
    this.state.players.set(client.sessionId, p.state);
    client.send(S2C.privateState, privateState(p));
    if (p.char.clan) client.send(S2C.clanInfo, this.clans.info(p.char.clan));
    this.clans.markInfoDirty(p.char.clan);
    this.ctx.notify(p, "info", `Welcome to the forest, ${p.char.name}.`);
  }

  override async onLeave(client: Client, consented: boolean) {
    const p = this.players.get(client.sessionId);
    if (p && !consented) {
      // Network blip: hold the cat in the world briefly so the client can resume.
      p.state.moving = false;
      p.state.running = false;
      try {
        const resumed = await this.allowReconnection(client, 20);
        p.client = resumed;
        p.privateDirty = true;
        if (p.char.clan) resumed.send(S2C.clanInfo, this.clans.info(p.char.clan));
        return;
      } catch {
        /* timed out - fall through to a normal leave */
      }
    }
    this.players.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
    if (!p) return;
    this.clans.markInfoDirty(p.char.clan);
    await this.save(p);
  }

  override async onDispose() {
    await Promise.all([...this.players.values()].map((p) => this.save(p)));
    await this.clans.flush().catch((e) => console.error("[room] clan flush failed", e));
    await WorldRoom.deps.repos.world.save(this.worldId, this.state.worldTime, {}).catch((e) => console.error("[room] world save failed", e));
  }

  private async save(p: PlayerRuntime) {
    try {
      await WorldRoom.deps.repos.characters.save(snapshotCharacter(p));
    } catch (e) {
      console.error(`[room] failed to save ${p.char.name}`, e);
    }
  }

  /** A failure in one system must never take the whole world down. */
  private safeTick(dtMs: number) {
    try {
      this.tick(dtMs);
    } catch (e) {
      console.error("[room] tick error", e);
    }
  }

  private tick(dtMs: number) {
    const dt = dtMs / 1000;
    this.world.tick(dtMs);
    tickCombat(this.ctx);
    tickPrey(this.ctx, dt);
    tickForage(this.ctx);
    tickSurvival(this.ctx, dt);
    this.clans.flushInfo();

    for (const p of this.players.values()) {
      if (p.privateDirty) {
        p.privateDirty = false;
        p.client.send(S2C.privateState, privateState(p));
      }
    }

    this.saveTimer += dtMs;
    if (this.saveTimer >= GAME_CONFIG.autosaveIntervalMs) {
      this.saveTimer = 0;
      for (const p of this.players.values()) void this.save(p);
      void WorldRoom.deps.repos.world.save(this.worldId, this.state.worldTime, {}).catch((e) => console.error(e));
    }
    this.clanFlushTimer += dtMs;
    if (this.clanFlushTimer >= 10_000) {
      this.clanFlushTimer = 0;
      void this.clans.flush().catch((e) => console.error("[room] clan flush failed", e));
    }
  }

  /** Register a validated, error-isolated message handler. */
  private on<T>(type: string, guard: (m: unknown) => m is T, fn: (p: PlayerRuntime, msg: T) => unknown) {
    this.onMessage(type, (client, raw) => {
      const p = this.players.get(client.sessionId);
      if (!p || !guard(raw)) return;
      try {
        const r = fn(p, raw);
        if (r instanceof Promise) r.catch((e) => console.error(`[room] ${type} failed`, e));
      } catch (e) {
        console.error(`[room] ${type} failed`, e);
      }
    });
  }

  private registerMessages() {
    const ctx = this.ctx;
    const any = (m: unknown): m is Record<string, unknown> => !!m && typeof m === "object";
    this.on(C2S.input, validate.input, (p, m) => p.state.health > 0 && handleInput(ctx, p, m));
    this.on(C2S.attack, validate.attack, (p, m) => handleAttack(ctx, p, m));
    this.on(C2S.interact, validate.interact, (p) => this.interact(p));
    this.on(C2S.useItem, validate.useItem, (p, m) => useItem(ctx, p, m));
    this.on(C2S.dropItem, validate.itemId, (p, m) => dropItem(ctx, p, m.itemId));
    this.on(C2S.equip, validate.equip, (p, m) => equip(ctx, p, m.slot, m.itemId));
    this.on(C2S.craft, validate.itemId, (p, m) => craftItem(ctx, p, m.itemId));
    this.on(C2S.chat, validate.chat, (p, m) => this.chat.handle(p, m));
    this.on(C2S.emote, validate.emote, (p, m) => this.chat.emote(p, m.emote));
    this.on(C2S.eatFromPile, any, (p) => this.clans.eatFromPile(p));
    this.on(C2S.depositHerb, validate.itemId, (p, m) => this.clans.depositHerb(p, m.itemId, Number((m as { qty?: number }).qty) || 1));
    this.on(C2S.withdrawHerb, validate.itemId, (p, m) => this.clans.withdrawHerb(p, m.itemId, Number((m as { qty?: number }).qty) || 1));
    this.on(C2S.setRank, validate.setRank, (p, m) => this.clans.setRank(p, m.targetId, m.rank));
    this.on(C2S.announce, validate.announce, (p, m) => this.clans.announce(p, m.text));
    this.on(C2S.setRelation, validate.setRelation, (p, m) => this.clans.setRelation(p, m.clan, m.relation));
    this.on(C2S.claimLeadership, any, (p) => this.clans.claimLeadership(p));
    this.on(C2S.transferLeadership, (m): m is { targetId: string } => any(m) && typeof m.targetId === "string", (p, m) => this.clans.transferLeadership(p, m.targetId));
    this.on(C2S.joinClan, (m): m is { clan: string } => any(m) && isClanId(m.clan), (p, m) => isClanId(m.clan) && this.clans.joinClan(p, m.clan));
    this.on(C2S.leaveClan, any, (p) => this.clans.leaveClan(p));
    this.on(C2S.report, validate.report, (p, m) => this.report(p, m.targetName, m.reason));
    this.on(C2S.moderate, validate.moderate, (p, m) => this.moderate(p, m));
  }

  /** Context-sensitive interaction: deposit prey, gather forage. */
  private interact(p: PlayerRuntime) {
    if (p.state.carrying && this.clans.isNearOwnPile(p)) {
      this.clans.depositPrey(p);
      return;
    }
    const node = nearestForage(this.ctx, p);
    if (node) {
      collectForage(this.ctx, p, node);
      p.state.pose = "";
      return;
    }
    if (this.clans.isNearOwnPile(p)) {
      this.clans.eatFromPile(p);
    }
  }

  private async report(p: PlayerRuntime, targetName: string, reason: string) {
    const repos = WorldRoom.deps.repos;
    const target = await repos.characters.byName(targetName);
    await repos.social.report(p.char.id, target?.id ?? null, targetName, reason.slice(0, 500), this.chat.contextFor(targetName));
    this.ctx.notify(p, "success", "Thank you. Your report has been sent to the moderators.");
  }

  private async moderate(p: PlayerRuntime, m: { action: "mute" | "kick" | "ban"; targetName: string; minutes?: number; reason?: string }) {
    if (p.account.role === "player") return this.ctx.notify(p, "error", "You are not a moderator.");
    const repos = WorldRoom.deps.repos;
    const target = await repos.characters.byName(m.targetName);
    if (!target) return this.ctx.notify(p, "warning", "No cat by that name.");
    const minutes = Math.max(1, Math.min(60 * 24 * 365, Math.floor(m.minutes ?? 60)));
    const online = this.ctx.playerByCharId(target.id);
    const until = new Date(Date.now() + minutes * 60_000);
    if (m.action === "mute") {
      await repos.accounts.setMute(target.accountId, until);
      for (const o of this.players.values()) if (o.account.id === target.accountId) o.account.mutedUntil = until;
    } else if (m.action === "ban") {
      await repos.accounts.setBan(target.accountId, until, m.reason ?? null);
    }
    if ((m.action === "kick" || m.action === "ban") && online) {
      online.client.send(S2C.kicked, { reason: m.reason ?? (m.action === "ban" ? "You have been banned." : "You were removed by a moderator.") });
      online.client.leave(4003);
    }
    await repos.accounts.logModeration(p.account.id, target.accountId, m.action, m.action === "kick" ? null : minutes, m.reason ?? null);
    this.ctx.notify(p, "success", `${m.action} applied to ${target.name}.`);
  }
}

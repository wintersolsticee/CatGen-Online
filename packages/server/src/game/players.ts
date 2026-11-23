import { GAME_CONFIG, XP_REWARDS, XP_SKILL, skillLevel, getItem, type CharacterData, type PrivateState } from "@catgen/shared";
import { PlayerState } from "../rooms/schema.ts";
import type { GameContext, PlayerRuntime } from "./context.ts";
import type { Client } from "colyseus";
import type { Account } from "../db/accounts.ts";

export function createRuntime(ctx: GameContext, client: Client, account: Account, char: CharacterData, blocked: string[]): PlayerRuntime {
  const s = new PlayerState();
  s.id = char.id;
  s.name = char.name;
  s.role = account.role;
  const p: PlayerRuntime = {
    sessionId: client.sessionId,
    client,
    account,
    char,
    state: s,
    cooldowns: {},
    blockingUntil: 0,
    dodgingUntil: 0,
    moveBudgetMs: 0,
    lastInputAt: ctx.now(),
    lastRanAt: 0,
    lastChatAt: 0,
    privateDirty: true,
    blocked: new Set(blocked),
    territory: null,
    outsideCampSince: null,
    lastHitBy: null,
  };
  syncPublic(p);
  s.health = char.health;
  s.stamina = char.stamina;
  s.hunger = char.hunger;
  // Spawn: saved position if valid, else the Clan camp (or the loner spawn).
  let pos = { x: char.x, y: char.y };
  const r = GAME_CONFIG.movement.collisionRadius;
  if (!ctx.map.inBounds(pos.x, pos.y) || ctx.map.collides(pos.x, pos.y, r)) {
    pos = spawnPoint(ctx, char);
  }
  s.x = pos.x;
  s.y = pos.y;
  return p;
}

export function spawnPoint(ctx: GameContext, char: Pick<CharacterData, "clan">): { x: number; y: number } {
  const loc = (char.clan && ctx.map.location("spawn", char.clan)) || ctx.map.locations.find((l) => l.kind === "spawn" && !l.clan) || ctx.map.locations[0];
  return ctx.map.findOpenSpot(loc.x, loc.y, GAME_CONFIG.movement.collisionRadius, ctx.rng);
}

/** Copy character fields that other players can see into the synced schema. */
export function syncPublic(p: PlayerRuntime) {
  const c = p.char;
  p.state.clan = c.clan ?? "";
  p.state.rank = c.rank;
  p.state.appearance = JSON.stringify(c.appearance);
  p.state.equipped = JSON.stringify(c.equipped);
  p.state.conditions = c.conditions.map((x) => x.id).join(",");
  p.state.carrying = c.inventory.filter((s) => getItem(s.itemId)?.category === "prey").flatMap((s) => Array(s.qty).fill(s.itemId)).join(",");
}

/** Pull live stats back into the character record before saving. */
export function snapshotCharacter(p: PlayerRuntime): CharacterData {
  const c = p.char;
  c.x = p.state.x;
  c.y = p.state.y;
  c.health = p.state.health;
  c.stamina = p.state.stamina;
  c.hunger = p.state.hunger;
  return c;
}

export function privateState(p: PlayerRuntime): PrivateState {
  const c = p.char;
  return { inventory: c.inventory, equipped: c.equipped, knownHerbs: c.knownHerbs, skills: c.skills, discovered: c.discovered, conditions: c.conditions };
}

export function markDirty(p: PlayerRuntime) {
  p.privateDirty = true;
  syncPublic(p);
}

export function awardXp(ctx: GameContext, p: PlayerRuntime, reward: keyof typeof XP_REWARDS) {
  const skill = XP_SKILL[reward];
  const before = skillLevel(p.char.skills[skill]);
  p.char.skills[skill] += XP_REWARDS[reward];
  const after = skillLevel(p.char.skills[skill]);
  if (after > before) ctx.notify(p, "success", `Your ${skill} skill improved to level ${after}!`);
  p.privateDirty = true;
}

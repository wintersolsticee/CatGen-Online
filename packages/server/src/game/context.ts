import type { Client } from "colyseus";
import type { CharacterData, CombatMoveId, WorldMap, NoticeEvent, ChatEvent, WorldClock } from "@catgen/shared";
import type { Account } from "../db/accounts.ts";
import type { Repos } from "../db/index.ts";
import type { PlayerState, WorldState } from "../rooms/schema.ts";

/** Server-side runtime data for a connected player. */
export interface PlayerRuntime {
  sessionId: string;
  client: Client;
  account: Account;
  /** Canonical character data (inventory, skills...). Public fields are mirrored in `state`. */
  char: CharacterData;
  state: PlayerState;
  cooldowns: Partial<Record<CombatMoveId, number>>;
  blockingUntil: number;
  dodgingUntil: number;
  /** Anti speed-hack movement time budget (ms). */
  moveBudgetMs: number;
  lastInputAt: number;
  lastRanAt: number;
  lastChatAt: number;
  privateDirty: boolean;
  /** Character ids this player has blocked. */
  blocked: Set<string>;
  territory: string | null;
  outsideCampSince: number | null;
  lastHitBy: { id: string; at: number } | null;
}

/**
 * Everything a game system may use. Systems receive the context instead of the
 * room so they stay decoupled from Colyseus and testable on their own.
 */
export interface GameContext {
  map: WorldMap;
  state: WorldState;
  repos: Repos;
  players: Map<string, PlayerRuntime>; // by sessionId
  rng: () => number;
  now: () => number;
  clock: () => WorldClock;
  notify(p: PlayerRuntime, kind: NoticeEvent["kind"], text: string): void;
  sendChat(p: PlayerRuntime, ev: ChatEvent): void;
  broadcastNear(x: number, y: number, radius: number, type: string, payload: unknown): void;
  playerByCharId(id: string): PlayerRuntime | undefined;
  playerByName(name: string): PlayerRuntime | undefined;
  /** Award skill XP and mark private state dirty. */
  awardXp(p: PlayerRuntime, reward: keyof typeof import("@catgen/shared").XP_REWARDS): void;
}

/**
 * Network protocol between client and server.
 * Every client -> server message has a validator; the server drops invalid payloads.
 */
import { isCombatMoveId, type CombatMoveId } from "./data/combat.ts";
import { isRank, type Rank } from "./data/ranks.ts";
import { isClanId, type ClanId, type ClanRelation } from "./data/clans.ts";
import { isItemId } from "./data/items.ts";
import type { AccessorySlot } from "./data/items.ts";
import type { ChatChannel } from "./systems/chat.ts";

export const ROOM_NAME = "world";

export const C2S = {
  input: "input",
  attack: "attack",
  interact: "interact",
  useItem: "useItem",
  dropItem: "dropItem",
  equip: "equip",
  craft: "craft",
  chat: "chat",
  emote: "emote",
  eatFromPile: "eatFromPile",
  depositHerb: "depositHerb",
  withdrawHerb: "withdrawHerb",
  setRank: "setRank",
  announce: "announce",
  setRelation: "setRelation",
  claimLeadership: "claimLeadership",
  transferLeadership: "transferLeadership",
  joinClan: "joinClan",
  leaveClan: "leaveClan",
  report: "report",
  moderate: "moderate",
} as const;

export const S2C = {
  chat: "chat",
  combat: "combat",
  notice: "notice",
  inventory: "inventory",
  privateState: "privateState",
  clanInfo: "clanInfo",
  preyCaught: "preyCaught",
  discovered: "discovered",
  kicked: "kicked",
} as const;

export interface InputMsg {
  seq: number;
  /** Normalised movement direction. */
  dx: number;
  dy: number;
  run: boolean;
  stalk: boolean;
  /** Milliseconds of movement this input covers (clamped by the server). */
  dt: number;
}

export interface AttackMsg {
  move: CombatMoveId;
  facing: number;
}

export interface InteractMsg {
  /** Optional explicit target (entity id). */
  targetId?: string;
}

export interface UseItemMsg {
  itemId: string;
  /** Use on another cat (e.g. treat with a herb). */
  targetId?: string;
}

export interface ChatMsg {
  channel: Extract<ChatChannel, "local" | "global" | "clan" | "whisper">;
  text: string;
  /** Whisper recipient: character name. */
  to?: string;
}

export interface SetRankMsg {
  targetId: string;
  rank: Rank;
}

export interface SetRelationMsg {
  clan: ClanId;
  relation: ClanRelation;
}

export interface ModerateMsg {
  action: "mute" | "kick" | "ban";
  targetName: string;
  minutes?: number;
  reason?: string;
}

export interface ChatEvent {
  channel: ChatChannel;
  from: string;
  fromId: string;
  clan: string | null;
  text: string;
  ts: number;
}

export interface CombatEvent {
  attackerId: string;
  targetId: string | null;
  move: CombatMoveId;
  hit: boolean;
  blocked: boolean;
  dodged: boolean;
  damage: number;
  injury: string | null;
}

export interface NoticeEvent {
  kind: "info" | "success" | "warning" | "error";
  text: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown, max = 64): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

export const validate = {
  input(m: unknown): m is InputMsg {
    return isObj(m) && isNum(m.seq) && isNum(m.dx) && isNum(m.dy) && Math.abs(m.dx) <= 1.01 && Math.abs(m.dy) <= 1.01 && typeof m.run === "boolean" && typeof m.stalk === "boolean" && isNum(m.dt) && m.dt >= 0 && m.dt <= 250;
  },
  attack(m: unknown): m is AttackMsg {
    return isObj(m) && isCombatMoveId(m.move) && isNum(m.facing);
  },
  interact(m: unknown): m is InteractMsg {
    return isObj(m) && (m.targetId === undefined || isStr(m.targetId));
  },
  useItem(m: unknown): m is UseItemMsg {
    return isObj(m) && isItemId(m.itemId) && (m.targetId === undefined || isStr(m.targetId));
  },
  itemId(m: unknown): m is { itemId: string } {
    return isObj(m) && isItemId(m.itemId);
  },
  equip(m: unknown): m is { slot: AccessorySlot; itemId: string | null } {
    return isObj(m) && ["head", "neck", "back", "tail"].includes(m.slot as string) && (m.itemId === null || isItemId(m.itemId));
  },
  chat(m: unknown): m is ChatMsg {
    return isObj(m) && ["local", "global", "clan", "whisper"].includes(m.channel as string) && isStr(m.text, 1000) && (m.to === undefined || isStr(m.to, 32));
  },
  emote(m: unknown): m is { emote: string } {
    return isObj(m) && isStr(m.emote, 24);
  },
  setRank(m: unknown): m is SetRankMsg {
    return isObj(m) && isStr(m.targetId) && isRank(m.rank);
  },
  announce(m: unknown): m is { text: string } {
    return isObj(m) && isStr(m.text, 1000);
  },
  setRelation(m: unknown): m is SetRelationMsg {
    return isObj(m) && isClanId(m.clan) && ["neutral", "allied", "rival"].includes(m.relation as string);
  },
  report(m: unknown): m is { targetName: string; reason: string } {
    return isObj(m) && isStr(m.targetName, 32) && isStr(m.reason, 500);
  },
  moderate(m: unknown): m is ModerateMsg {
    return isObj(m) && ["mute", "kick", "ban"].includes(m.action as string) && isStr(m.targetName, 32) && (m.minutes === undefined || isNum(m.minutes));
  },
};

/** Fields of a player's own character that only they receive (not broadcast). */
export interface PrivateState {
  inventory: { itemId: string; qty: number }[];
  equipped: Partial<Record<AccessorySlot, string>>;
  knownHerbs: string[];
  skills: Record<string, number>;
  discovered: string[];
  conditions: { id: string; elapsedSec: number }[];
}

export interface ClanInfo {
  clan: ClanId;
  freshKill: Record<string, number>;
  herbStore: Record<string, number>;
  announcements: { text: string; author: string; ts: number }[];
  relations: Partial<Record<ClanId, ClanRelation>>;
  members: { id: string; name: string; rank: Rank; online: boolean }[];
}

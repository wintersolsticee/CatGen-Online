import { normalizeAppearance, type Appearance } from "./appearance.ts";
import { isClanId, type ClanId } from "./data/clans.ts";
import { isRank, type Rank } from "./data/ranks.ts";
import { isConditionId, type ConditionId } from "./data/conditions.ts";
import { getItem, type AccessorySlot } from "./data/items.ts";
import { HERB_IDS } from "./data/herbs.ts";
import { GAME_CONFIG } from "./config.ts";
import type { InventoryStack } from "./systems/inventory.ts";

/** A condition currently affecting a cat. `elapsedSec` counts time since it began. */
export interface ActiveCondition {
  id: ConditionId;
  elapsedSec: number;
}

export type SkillId = "hunting" | "fighting" | "medicine" | "exploration";
export const SKILL_IDS: SkillId[] = ["hunting", "fighting", "medicine", "exploration"];

/** Persistent character record (server-side canonical shape; stored as columns + JSON). */
export interface CharacterData {
  id: string;
  accountId: string;
  name: string;
  description: string;
  clan: ClanId | null;
  rank: Rank;
  appearance: Appearance;
  health: number;
  stamina: number;
  hunger: number;
  conditions: ActiveCondition[];
  inventory: InventoryStack[];
  equipped: Partial<Record<AccessorySlot, string>>;
  knownHerbs: string[];
  skills: Record<SkillId, number>;
  discovered: string[];
  x: number;
  y: number;
}

export const NAME_PATTERN = /^[A-Za-z][A-Za-z' -]{1,22}[A-Za-z]$/;

export function validateCharacterName(name: unknown): string | null {
  if (typeof name !== "string") return "Name is required.";
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!NAME_PATTERN.test(trimmed)) return "Names must be 3-24 letters (spaces, hyphens and apostrophes allowed).";
  return null;
}

export function defaultSkills(): Record<SkillId, number> {
  return { hunting: 0, fighting: 0, medicine: 0, exploration: 0 };
}

/**
 * Normalise a character's mutable game-state JSON loaded from storage.
 * Used to keep old saves loadable when new fields are added.
 */
export function normalizeCharacterState(raw: Partial<CharacterData> & Record<string, unknown>): Omit<CharacterData, "id" | "accountId"> {
  const cfg = GAME_CONFIG.stats;
  const num = (v: unknown, min: number, max: number, d: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
  const skills = defaultSkills();
  if (raw.skills && typeof raw.skills === "object") {
    for (const k of Object.keys(skills) as SkillId[]) skills[k] = num((raw.skills as Record<string, unknown>)[k], 0, 1e9, 0);
  }
  const conditions: ActiveCondition[] = Array.isArray(raw.conditions)
    ? raw.conditions
        .filter((c): c is ActiveCondition => !!c && isConditionId((c as ActiveCondition).id))
        .map((c) => ({ id: c.id, elapsedSec: num(c.elapsedSec, 0, 1e9, 0) }))
    : [];
  const inventory: InventoryStack[] = Array.isArray(raw.inventory)
    ? raw.inventory
        .filter((s): s is InventoryStack => !!s && typeof s.itemId === "string" && !!getItem(s.itemId))
        .map((s) => ({ itemId: s.itemId, qty: Math.max(1, Math.floor(num(s.qty, 1, 999, 1))) }))
    : [];
  const equipped: Partial<Record<AccessorySlot, string>> = {};
  if (raw.equipped && typeof raw.equipped === "object") {
    for (const [slot, itemId] of Object.entries(raw.equipped)) {
      const item = typeof itemId === "string" ? getItem(itemId) : undefined;
      if (item && item.slot === slot) equipped[slot as AccessorySlot] = item.id;
    }
  }
  return {
    name: typeof raw.name === "string" ? raw.name : "Nameless",
    description: typeof raw.description === "string" ? raw.description.slice(0, 500) : "",
    clan: isClanId(raw.clan) ? raw.clan : null,
    rank: isRank(raw.rank) ? raw.rank : "warrior",
    appearance: normalizeAppearance(raw.appearance),
    health: num(raw.health, 1, cfg.maxHealth, cfg.maxHealth),
    stamina: num(raw.stamina, 0, cfg.maxStamina, cfg.maxStamina),
    hunger: num(raw.hunger, 0, cfg.maxHunger, cfg.maxHunger),
    conditions,
    inventory,
    equipped,
    knownHerbs: Array.isArray(raw.knownHerbs) ? raw.knownHerbs.filter((h): h is string => typeof h === "string" && HERB_IDS.includes(h)) : [],
    skills,
    discovered: Array.isArray(raw.discovered) ? raw.discovered.filter((d): d is string => typeof d === "string").slice(0, 500) : [],
    x: num(raw.x, -1, 1e7, -1),
    y: num(raw.y, -1, 1e7, -1),
  };
}

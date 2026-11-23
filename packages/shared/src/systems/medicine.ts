import { getHerb } from "../data/herbs.ts";
import { RANKS, type Rank } from "../data/ranks.ts";
import type { ConditionId } from "../data/conditions.ts";
import type { ActiveCondition } from "../character.ts";
import { addCondition, removeConditions } from "./conditions.ts";
import { skillLevel } from "./progression.ts";

export interface HerbApplication {
  ok: boolean;
  error?: string;
  conditions: ActiveCondition[];
  cured: ConditionId[];
  heal: number;
  sideEffect: ConditionId | null;
  /** Did the herb do anything useful? Used for XP & feedback. */
  effective: boolean;
}

/**
 * Apply a herb to a cat. Herbs only cure the conditions they treat; using a herb
 * with a side effect when it isn't needed causes the side effect.
 */
export function applyHerb(conditions: readonly ActiveCondition[], herbId: string, healerMedicineXp: number): HerbApplication {
  const herb = getHerb(herbId);
  if (!herb) return { ok: false, error: "That is not a herb.", conditions: [...conditions], cured: [], heal: 0, sideEffect: null, effective: false };
  const cured = conditions.filter((c) => herb.treats.includes(c.id)).map((c) => c.id);
  let next = removeConditions(conditions, cured);
  let sideEffect: ConditionId | null = null;
  if (cured.length === 0 && herb.sideEffect) {
    sideEffect = herb.sideEffect;
    next = addCondition(next, herb.sideEffect);
  }
  const heal = herb.heal * (1 + skillLevel(healerMedicineXp) * 0.08);
  return { ok: true, conditions: next, cured, heal, sideEffect, effective: cured.length > 0 || herb.heal >= 10 };
}

/** Can this cat see what a herb really is? */
export function knowsHerb(rank: Rank, knownHerbs: readonly string[], herbId: string): boolean {
  return RANKS[rank].permissions.includes("identify_all_herbs") || knownHerbs.includes(herbId);
}

/** Display name a particular cat sees for a herb. */
export function herbDisplayName(rank: Rank, knownHerbs: readonly string[], herbId: string): string {
  const herb = getHerb(herbId);
  if (!herb) return herbId;
  return knowsHerb(rank, knownHerbs, herbId) ? herb.name : `Unknown ${herb.look.kind === "berries" ? "berries" : herb.look.kind === "flower" ? "flower" : "plant"}`;
}

/** Chance to identify a herb when collecting/using it, based on medicine skill. */
export function identifyChance(medicineXp: number, isMedicineRank: boolean): number {
  if (isMedicineRank) return 1;
  return Math.min(0.9, 0.25 + skillLevel(medicineXp) * 0.1);
}

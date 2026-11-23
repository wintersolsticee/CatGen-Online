import type { SkillId } from "../character.ts";

/** XP awarded per activity. Tune here. */
export const XP_REWARDS = {
  catchPrey: 12,
  depositPrey: 6,
  hitInCombat: 3,
  winFight: 20,
  collectHerb: 4,
  treatCondition: 15,
  discoverLocation: 25,
} as const satisfies Record<string, number>;

export const XP_SKILL: Record<keyof typeof XP_REWARDS, SkillId> = {
  catchPrey: "hunting",
  depositPrey: "hunting",
  hitInCombat: "fighting",
  winFight: "fighting",
  collectHerb: "medicine",
  treatCondition: "medicine",
  discoverLocation: "exploration",
};

/** Level curve: level n requires 50 * n^2 XP. */
export function skillLevel(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 50));
}

export function xpForLevel(level: number): number {
  return 50 * level * level;
}

/** Fraction (0..1) of progress toward the next level. */
export function levelProgress(xp: number): number {
  const lvl = skillLevel(xp);
  const a = xpForLevel(lvl);
  const b = xpForLevel(lvl + 1);
  return (xp - a) / (b - a);
}

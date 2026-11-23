import type { ConditionId } from "./conditions.ts";

/**
 * Combat moves. New moves can be added here and bound to a key in the client's
 * keybinding table; the server validates range, stamina and cooldown generically.
 */
export type CombatMoveId = "swipe" | "bite" | "pounce" | "block" | "dodge";

export interface CombatMoveDefinition {
  id: CombatMoveId;
  name: string;
  kind: "attack" | "defend" | "evade";
  damage: number;
  staminaCost: number;
  cooldownMs: number;
  /** Reach in pixels from the attacker's centre. */
  range: number;
  /** Half-angle in degrees of the attack cone in front of the attacker. */
  arcDeg: number;
  /** Duration of the effect (block/dodge window or attack animation). */
  durationMs: number;
  /** Chance and type of inflicting an injury on hit. */
  injury?: { chance: number; condition: ConditionId };
  /** For pounce/dodge: the dash distance. */
  dash?: number;
  description: string;
}

export const COMBAT_MOVES: Record<CombatMoveId, CombatMoveDefinition> = {
  swipe: {
    id: "swipe", name: "Claw Swipe", kind: "attack", damage: 8, staminaCost: 8, cooldownMs: 450, range: 125, arcDeg: 70, durationMs: 250,
    injury: { chance: 0.12, condition: "bleeding" }, description: "A quick raking swipe with unsheathed claws.",
  },
  bite: {
    id: "bite", name: "Bite", kind: "attack", damage: 15, staminaCost: 15, cooldownMs: 1100, range: 105, arcDeg: 45, durationMs: 380,
    injury: { chance: 0.25, condition: "bleeding" }, description: "A slower, powerful bite.",
  },
  pounce: {
    id: "pounce", name: "Pounce", kind: "attack", damage: 12, staminaCost: 22, cooldownMs: 2200, range: 150, arcDeg: 50, durationMs: 420, dash: 170,
    injury: { chance: 0.2, condition: "sprained_leg" }, description: "Leap at a foe, knocking them off balance. Also used to catch prey.",
  },
  block: {
    id: "block", name: "Block", kind: "defend", damage: 0, staminaCost: 10, cooldownMs: 900, range: 0, arcDeg: 90, durationMs: 700,
    description: "Brace and deflect attacks from the front, reducing damage by 70%.",
  },
  dodge: {
    id: "dodge", name: "Dodge", kind: "evade", damage: 0, staminaCost: 14, cooldownMs: 1300, range: 0, arcDeg: 0, durationMs: 300, dash: 160,
    description: "Spring aside, avoiding all damage for a moment.",
  },
};

export const COMBAT_MOVE_IDS = Object.keys(COMBAT_MOVES) as CombatMoveId[];

export function isCombatMoveId(v: unknown): v is CombatMoveId {
  return typeof v === "string" && v in COMBAT_MOVES;
}

export const BLOCK_DAMAGE_REDUCTION = 0.7;

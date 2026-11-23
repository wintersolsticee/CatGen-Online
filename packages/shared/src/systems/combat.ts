import { COMBAT_MOVES, BLOCK_DAMAGE_REDUCTION, type CombatMoveId, type CombatMoveDefinition } from "../data/combat.ts";
import { RANKS, type Rank } from "../data/ranks.ts";
import type { ConditionId } from "../data/conditions.ts";
import { getConditionModifiers } from "./conditions.ts";
import type { ActiveCondition } from "../character.ts";
import { skillLevel } from "./progression.ts";

/** Minimal combat view of a cat; the server maps its room state to this. */
export interface Combatant {
  x: number;
  y: number;
  /** Facing angle in radians. */
  facing: number;
  stamina: number;
  rank: Rank;
  conditions: readonly ActiveCondition[];
  fightingXp: number;
  /** Timestamps (ms) until which block / dodge are active. */
  blockingUntil: number;
  dodgingUntil: number;
  /** Map of move -> timestamp the move becomes available again. */
  cooldowns: Partial<Record<CombatMoveId, number>>;
}

export type MoveCheck = { ok: true } | { ok: false; reason: "cooldown" | "stamina" | "rank" };

export function canUseMove(c: Combatant, moveId: CombatMoveId, now: number): MoveCheck {
  const move = COMBAT_MOVES[moveId];
  if (move.kind === "attack" && moveId !== "pounce" && !RANKS[c.rank].permissions.includes("fight") && c.rank !== "kit") {
    return { ok: false, reason: "rank" };
  }
  if ((c.cooldowns[moveId] ?? 0) > now) return { ok: false, reason: "cooldown" };
  if (c.stamina < move.staminaCost) return { ok: false, reason: "stamina" };
  return { ok: true };
}

function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

/** Is `target` within the attack cone of `attacker` for this move? */
export function inAttackArc(attacker: { x: number; y: number; facing: number }, target: { x: number; y: number }, move: CombatMoveDefinition, targetRadius = 30): boolean {
  const dx = target.x - attacker.x;
  const dy = target.y - attacker.y;
  const dist = Math.hypot(dx, dy);
  if (dist > move.range + targetRadius) return false;
  if (dist < 1) return true;
  const ang = Math.atan2(dy, dx);
  return angleDiff(ang, attacker.facing) <= (move.arcDeg * Math.PI) / 180;
}

export interface AttackOutcome {
  hit: boolean;
  dodged: boolean;
  blocked: boolean;
  damage: number;
  injury: ConditionId | null;
}

/**
 * Resolve one attack. Pure: randomness is injected so tests are deterministic.
 * Damage scales with the attacker's rank, injuries and fighting skill.
 */
export function resolveAttack(attacker: Combatant, defender: Combatant, moveId: CombatMoveId, now: number, rng: () => number): AttackOutcome {
  const move = COMBAT_MOVES[moveId];
  const miss: AttackOutcome = { hit: false, dodged: false, blocked: false, damage: 0, injury: null };
  if (move.kind !== "attack") return miss;
  // Pounce dashes forward before checking reach, so use extended reach.
  const reachMove = move.dash ? { ...move, range: move.range + move.dash * 0.5 } : move;
  if (!inAttackArc(attacker, defender, reachMove)) return miss;
  if (defender.dodgingUntil > now) return { ...miss, dodged: true };

  const mods = getConditionModifiers(attacker.conditions);
  const skillBonus = 1 + skillLevel(attacker.fightingXp) * 0.03;
  let damage = move.damage * RANKS[attacker.rank].combatMultiplier * mods.attackMul * skillBonus;
  // +-10% variance
  damage *= 0.9 + rng() * 0.2;

  let blocked = false;
  if (defender.blockingUntil > now) {
    // Block only works against attacks coming from the front.
    const incoming = Math.atan2(attacker.y - defender.y, attacker.x - defender.x);
    if (angleDiff(incoming, defender.facing) <= (COMBAT_MOVES.block.arcDeg * Math.PI) / 180) {
      blocked = true;
      damage *= 1 - BLOCK_DAMAGE_REDUCTION;
    }
  }
  let injury: ConditionId | null = null;
  if (!blocked && move.injury && rng() < move.injury.chance) injury = move.injury.condition;
  return { hit: true, dodged: false, blocked, damage: Math.round(damage * 10) / 10, injury };
}

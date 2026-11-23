import { GAME_CONFIG } from "../config.ts";
import type { WorldMap } from "../world/world-map.ts";
import type { ActiveCondition } from "../character.ts";
import type { Rank } from "../data/ranks.ts";
import { getConditionModifiers } from "./conditions.ts";

export interface MoverState {
  x: number;
  y: number;
  stamina: number;
}

export interface MoveInput {
  dx: number;
  dy: number;
  run: boolean;
  stalk: boolean;
  /** Seconds this input covers. */
  dt: number;
}

export interface MoverTraits {
  rank: Rank;
  conditions: readonly ActiveCondition[];
}

/** Effective speed for a cat given input, terrain and conditions. */
export function moveSpeed(map: WorldMap, s: MoverState, input: MoveInput, traits: MoverTraits): number {
  const m = GAME_CONFIG.movement;
  const running = input.run && !input.stalk && s.stamina > 1;
  let speed = input.stalk ? m.stalkSpeed : running ? m.runSpeed : m.walkSpeed;
  speed *= map.terrainAt(s.x, s.y).speedMul || 0.5;
  speed *= getConditionModifiers(traits.conditions).speedMul;
  if (traits.rank === "kit") speed *= 0.75;
  if (traits.rank === "elder") speed *= 0.85;
  return speed;
}

/**
 * Advance one movement input. Deterministic: the client runs exactly this for
 * prediction and the server runs it authoritatively, so replays agree.
 * Stamina drain for running is applied here; regeneration happens in the server's survival tick.
 */
export function stepMovement(map: WorldMap, s: MoverState, input: MoveInput, traits: MoverTraits): MoverState & { moving: boolean; running: boolean } {
  const len = Math.hypot(input.dx, input.dy);
  if (len < 0.01 || input.dt <= 0) return { ...s, moving: false, running: false };
  const nx = input.dx / len;
  const ny = input.dy / len;
  const speed = moveSpeed(map, s, input, traits);
  const running = input.run && !input.stalk && s.stamina > 1;
  const next = map.moveWithCollision(s.x, s.y, nx * speed * input.dt, ny * speed * input.dt, GAME_CONFIG.movement.collisionRadius);
  const stamina = running ? Math.max(0, s.stamina - GAME_CONFIG.stats.runStaminaCostPerSec * input.dt) : s.stamina;
  return { x: next.x, y: next.y, stamina, moving: true, running };
}

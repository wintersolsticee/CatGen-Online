import { CONDITIONS, type ConditionId } from "../data/conditions.ts";
import type { ActiveCondition } from "../character.ts";

/** Aggregate gameplay modifiers from a set of active conditions. */
export interface ConditionModifiers {
  speedMul: number;
  staminaRegenMul: number;
  attackMul: number;
  healthDrainPerSec: number;
}

export function getConditionModifiers(conditions: readonly ActiveCondition[]): ConditionModifiers {
  const m: ConditionModifiers = { speedMul: 1, staminaRegenMul: 1, attackMul: 1, healthDrainPerSec: 0 };
  for (const c of conditions) {
    const def = CONDITIONS[c.id];
    if (!def) continue;
    m.speedMul *= def.speedMul;
    m.staminaRegenMul *= def.staminaRegenMul;
    m.attackMul *= def.attackMul;
    m.healthDrainPerSec += def.healthDrainPerSec;
  }
  return m;
}

export function hasCondition(conditions: readonly ActiveCondition[], id: ConditionId): boolean {
  return conditions.some((c) => c.id === id);
}

/** Add a condition unless the cat already has it (or a worse form of it). */
export function addCondition(conditions: readonly ActiveCondition[], id: ConditionId): ActiveCondition[] {
  if (hasCondition(conditions, id)) return [...conditions];
  // Don't regress: a cat with greencough shouldn't also catch whitecough.
  for (const c of conditions) {
    if (CONDITIONS[id].worsensTo?.condition === c.id) return [...conditions];
  }
  return [...conditions, { id, elapsedSec: 0 }];
}

export interface ConditionTickResult {
  conditions: ActiveCondition[];
  /** Conditions that ended by natural recovery this tick. */
  recovered: ConditionId[];
  /** Conditions that worsened: [from, to]. */
  worsened: [ConditionId, ConditionId][];
}

/** Advance condition timers: natural recovery and worsening. Pure. */
export function tickConditions(conditions: readonly ActiveCondition[], dtSec: number): ConditionTickResult {
  const recovered: ConditionId[] = [];
  const worsened: [ConditionId, ConditionId][] = [];
  let out: ActiveCondition[] = [];
  for (const c of conditions) {
    const def = CONDITIONS[c.id];
    const elapsedSec = c.elapsedSec + dtSec;
    if (def.worsensTo && elapsedSec >= def.worsensTo.afterSec) {
      worsened.push([c.id, def.worsensTo.condition]);
      continue;
    }
    if (def.naturalRecoverySec !== undefined && elapsedSec >= def.naturalRecoverySec) {
      recovered.push(c.id);
      continue;
    }
    out.push({ id: c.id, elapsedSec });
  }
  for (const [, to] of worsened) out = addCondition(out, to);
  return { conditions: out, recovered, worsened };
}

export function removeConditions(conditions: readonly ActiveCondition[], ids: readonly ConditionId[]): ActiveCondition[] {
  return conditions.filter((c) => !ids.includes(c.id));
}

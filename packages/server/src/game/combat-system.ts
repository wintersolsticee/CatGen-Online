import {
  COMBAT_MOVES, GAME_CONFIG, S2C, canUseMove, resolveAttack, addCondition, hasPermission, getPrey, inAttackArc, skillLevel,
  type AttackMsg, type Combatant, type CombatEvent,
} from "@catgen/shared";
import type { GameContext, PlayerRuntime } from "./context.ts";
import { markDirty } from "./players.ts";
import { tryCatchPrey } from "./prey-system.ts";
import { defeat } from "./survival-system.ts";

const COMBAT_BROADCAST_RADIUS = 2200;

function combatant(p: PlayerRuntime): Combatant {
  return {
    x: p.state.x, y: p.state.y, facing: p.state.facing, stamina: p.state.stamina, rank: p.char.rank,
    conditions: p.char.conditions, fightingXp: p.char.skills.fighting, blockingUntil: p.blockingUntil, dodgingUntil: p.dodgingUntil, cooldowns: p.cooldowns,
  };
}

/** Are combat attacks allowed at this spot right now (Gathering truce)? */
export function truceActive(ctx: GameContext, x: number, y: number): boolean {
  if (!ctx.clock().isGathering) return false;
  const g = ctx.map.location("gathering");
  return !!g && Math.hypot(g.x - x, g.y - y) < g.radius;
}

export function handleAttack(ctx: GameContext, p: PlayerRuntime, msg: AttackMsg) {
  const now = ctx.now();
  const move = COMBAT_MOVES[msg.move];
  const s = p.state;
  s.facing = msg.facing;
  s.pose = "";

  const check = canUseMove(combatant(p), msg.move, now);
  if (!check.ok) {
    if (check.reason === "rank") ctx.notify(p, "warning", "Your rank does not allow fighting.");
    return;
  }
  if (move.kind === "attack" && truceActive(ctx, s.x, s.y) && msg.move !== "pounce") {
    ctx.notify(p, "warning", "StarClan forbids fighting during the Gathering truce!");
    return;
  }
  s.stamina -= move.staminaCost;
  p.cooldowns[msg.move] = now + move.cooldownMs;

  if (move.id === "block") {
    p.blockingUntil = now + move.durationMs;
    s.blocking = true;
  } else if (move.id === "dodge") {
    p.dodgingUntil = now + move.durationMs;
    dash(ctx, p, move.dash ?? 0);
  } else if (move.dash) {
    dash(ctx, p, move.dash);
  }

  const events: CombatEvent[] = [];
  if (move.kind === "attack") {
    // Hunting: an attack aimed at prey can catch it.
    if (msg.move === "pounce" || msg.move === "swipe") {
      if (hasPermission(p.char.rank, "hunt") || p.char.clan === null) {
        if (tryCatchPrey(ctx, p, msg.move)) {
          ctx.broadcastNear(s.x, s.y, COMBAT_BROADCAST_RADIUS, S2C.combat, { attackerId: s.id, targetId: null, move: msg.move, hit: true, blocked: false, dodged: false, damage: 0, injury: null } satisfies CombatEvent);
          return;
        }
      }
    }
    if (!truceActive(ctx, s.x, s.y)) {
      for (const target of ctx.players.values()) {
        if (target === p || target.state.health <= 0) continue;
        if (target.char.rank === "kit" && target.char.clan !== p.char.clan) continue; // warriors never harm kits
        const outcome = resolveAttack(combatant(p), combatant(target), msg.move, now, ctx.rng);
        if (!outcome.hit && !outcome.dodged) continue;
        const sparring = !!p.char.clan && p.char.clan === target.char.clan;
        let damage = outcome.damage;
        if (sparring) damage = Math.min(damage, Math.max(0, target.state.health - 10));
        target.state.health = Math.max(0, target.state.health - damage);
        target.lastHitBy = { id: s.id, at: now };
        if (outcome.injury && !sparring) {
          target.char.conditions = addCondition(target.char.conditions, outcome.injury);
          markDirty(target);
        }
        if (outcome.hit) ctx.awardXp(p, "hitInCombat");
        events.push({ attackerId: s.id, targetId: target.state.id, move: msg.move, hit: outcome.hit, blocked: outcome.blocked, dodged: outcome.dodged, damage, injury: sparring ? null : outcome.injury });
        if (target.state.health <= 0) defeat(ctx, target, p);
      }
    }
  }
  if (events.length === 0) events.push({ attackerId: s.id, targetId: null, move: msg.move, hit: false, blocked: false, dodged: false, damage: 0, injury: null });
  for (const ev of events) ctx.broadcastNear(s.x, s.y, COMBAT_BROADCAST_RADIUS, S2C.combat, ev);
}

function dash(ctx: GameContext, p: PlayerRuntime, distance: number) {
  const s = p.state;
  const next = ctx.map.moveWithCollision(s.x, s.y, Math.cos(s.facing) * distance, Math.sin(s.facing) * distance, GAME_CONFIG.movement.collisionRadius);
  s.x = next.x;
  s.y = next.y;
}

/** Update transient combat flags each tick. */
export function tickCombat(ctx: GameContext) {
  const now = ctx.now();
  for (const p of ctx.players.values()) {
    if (p.state.blocking && p.blockingUntil <= now) p.state.blocking = false;
  }
}

/** Helper for prey catching: does the cat's attack reach this point? */
export function attackReaches(p: PlayerRuntime, moveId: "pounce" | "swipe", x: number, y: number): boolean {
  const move = COMBAT_MOVES[moveId];
  const reach = moveId === "pounce" ? GAME_CONFIG.interaction.preyCatchRange : move.range;
  return inAttackArc(p.state, { x, y }, { ...move, range: reach, arcDeg: move.arcDeg + 15 }, 18);
}

export function catchChance(p: PlayerRuntime, moveId: "pounce" | "swipe", speciesId: string): number {
  const prey = getPrey(speciesId);
  const base = moveId === "pounce" ? 0.8 : 0.45;
  const fleeing = prey?.behaviour === "runner" ? 0.15 : 0;
  return Math.min(0.97, base - fleeing + skillLevel(p.char.skills.hunting) * 0.04 + (p.state.stalking ? 0.1 : 0));
}

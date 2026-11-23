import { GAME_CONFIG, CONDITIONS, getConditionModifiers, tickConditions, addCondition, removeItem, getItem } from "@catgen/shared";
import type { GameContext, PlayerRuntime } from "./context.ts";
import { markDirty, spawnPoint } from "./players.ts";

const conditionAccum = new WeakMap<GameContext, number>();

/** Stamina/health regeneration, hunger, condition progression. */
export function tickSurvival(ctx: GameContext, dtSec: number) {
  const cfg = GAME_CONFIG.stats;
  const now = ctx.now();
  const acc = (conditionAccum.get(ctx) ?? 0) + dtSec;
  const doConditions = acc >= 1;
  const condDt = acc;
  conditionAccum.set(ctx, doConditions ? 0 : acc);

  for (const p of ctx.players.values()) {
    const s = p.state;
    if (s.health <= 0) continue;
    const mods = getConditionModifiers(p.char.conditions);
    if (now - p.lastRanAt > 600 && !s.blocking) {
      const resting = s.pose === "lie" || s.pose === "sit" ? 1.6 : 1;
      s.stamina = Math.min(cfg.maxStamina, s.stamina + cfg.staminaRegenPerSec * mods.staminaRegenMul * resting * dtSec);
    }
    const hungerRate = cfg.hungerDecayPerSec * (s.running ? 2 : 1);
    s.hunger = Math.max(0, s.hunger - hungerRate * dtSec);

    let dh = -mods.healthDrainPerSec * dtSec;
    if (s.hunger <= 0) dh -= cfg.starvingDamagePerSec * dtSec;
    else if (s.hunger > 30 && mods.healthDrainPerSec === 0) dh += cfg.healthRegenPerSec * (s.pose === "lie" ? 2.5 : 1) * dtSec;
    s.health = Math.max(0, Math.min(cfg.maxHealth, s.health + dh));

    if (doConditions && p.char.conditions.length) {
      const res = tickConditions(p.char.conditions, condDt);
      p.char.conditions = res.conditions;
      for (const id of res.recovered) ctx.notify(p, "success", `Your ${CONDITIONS[id].name.toLowerCase()} has healed on its own.`);
      for (const [from, to] of res.worsened) ctx.notify(p, "error", `Your ${CONDITIONS[from].name.toLowerCase()} has worsened into ${CONDITIONS[to].name.toLowerCase()}! Find a medicine cat.`);
      if (res.recovered.length || res.worsened.length) markDirty(p);
    }
    if (s.health <= 0) defeat(ctx, p, null);
  }
}

/**
 * A cat reaching 0 health is not killed: they collapse, drop carried prey and
 * wake up in their camp's medicine den in shock. (No permadeath.)
 */
export function defeat(ctx: GameContext, p: PlayerRuntime, by: PlayerRuntime | null) {
  for (const stack of [...p.char.inventory]) {
    if (getItem(stack.itemId)?.category === "prey") p.char.inventory = removeItem(p.char.inventory, stack.itemId, stack.qty).inventory;
  }
  p.char.conditions = addCondition(p.char.conditions, "shock");
  const den = p.char.clan ? ctx.map.location("medicine_den", p.char.clan) : null;
  const pos = den ? ctx.map.findOpenSpot(den.x, den.y, GAME_CONFIG.movement.collisionRadius, ctx.rng) : spawnPoint(ctx, p.char);
  p.state.x = pos.x;
  p.state.y = pos.y;
  p.state.health = 25;
  p.state.stamina = 30;
  p.state.pose = "lie";
  markDirty(p);
  if (by) {
    ctx.notify(p, "error", `You were defeated by ${by.char.name} and limped home to recover.`);
    ctx.notify(by, "success", `You drove off ${p.char.name}!`);
    ctx.awardXp(by, "winFight");
  } else {
    ctx.notify(p, "error", "You collapsed! Your Clanmates carried you home. Rest, eat and see a medicine cat.");
  }
}

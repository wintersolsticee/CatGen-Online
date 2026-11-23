import { PREY, GAME_CONFIG, S2C, addItem, getPrey, type PreyDefinition, type Biome } from "@catgen/shared";
import { PreyState } from "../rooms/schema.ts";
import type { GameContext, PlayerRuntime } from "./context.ts";
import { attackReaches, catchChance } from "./combat-system.ts";
import { markDirty } from "./players.ts";

/** Server-only AI data per prey animal. */
interface PreyBrain {
  def: PreyDefinition;
  vx: number;
  vy: number;
  modeUntil: number;
  /** Removed when this time passes (fliers flying away, climbers escaping up trees). */
  despawnAt: number;
}

const brains = new WeakMap<PreyState, PreyBrain>();
let nextPreyId = 1;
/** Per-room spawn timer (rooms are independent). */
const lastSpawnAt = new WeakMap<GameContext, number>();

function seasonalMax(ctx: GameContext): number {
  const season = ctx.clock().season;
  const mul = season === "leafbare" ? 0.55 : season === "greenleaf" ? 1.15 : 1;
  return Math.floor(GAME_CONFIG.world.maxPrey * mul);
}

function pickSpecies(ctx: GameContext, available: Set<Biome>): PreyDefinition | null {
  const options = PREY.filter((p) => p.biomes.some((b) => available.has(b)));
  const total = options.reduce((s, p) => s + p.weight, 0);
  let r = ctx.rng() * total;
  for (const p of options) {
    r -= p.weight;
    if (r <= 0) return p;
  }
  return options[0] ?? null;
}

function validSpot(ctx: GameContext, def: PreyDefinition, x: number, y: number): boolean {
  if (!ctx.map.inBounds(x, y) || ctx.map.collides(x, y, 10)) return false;
  const isWater = ctx.map.terrainAt(x, y).biome === "water";
  return def.behaviour === "swimmer" ? isWater : !isWater;
}

export function spawnPrey(ctx: GameContext, count = 1) {
  const available = new Set(ctx.map.biomes());
  for (let i = 0; i < count; i++) {
    const def = pickSpecies(ctx, available);
    if (!def) return;
    const biome = def.biomes.filter((b) => available.has(b))[Math.floor(ctx.rng() * def.biomes.filter((b) => available.has(b)).length)];
    const pt = ctx.map.randomPointInBiome(biome, ctx.rng);
    if (!pt || !validSpot(ctx, def, pt.x, pt.y)) continue;
    // Don't spawn right next to a cat.
    if ([...ctx.players.values()].some((p) => Math.hypot(p.state.x - pt.x, p.state.y - pt.y) < 500)) continue;
    const s = new PreyState();
    s.id = `p${nextPreyId++}`;
    s.species = def.id;
    s.x = pt.x;
    s.y = pt.y;
    s.mode = "idle";
    brains.set(s, { def, vx: 0, vy: 0, modeUntil: 0, despawnAt: 0 });
    ctx.state.prey.set(s.id, s);
  }
}

export function tickPrey(ctx: GameContext, dtSec: number) {
  const now = ctx.now();
  if (ctx.state.prey.size < seasonalMax(ctx) && now - (lastSpawnAt.get(ctx) ?? 0) > GAME_CONFIG.world.preyRespawnMs / 4) {
    lastSpawnAt.set(ctx, now);
    spawnPrey(ctx, 2);
  }
  const players = [...ctx.players.values()];
  for (const [id, s] of ctx.state.prey) {
    const b = brains.get(s);
    if (!b) {
      ctx.state.prey.delete(id);
      continue;
    }
    if (b.despawnAt && now >= b.despawnAt) {
      ctx.state.prey.delete(id);
      continue;
    }
    if (s.mode === "fly") continue;

    // Perception: nearest cat within alert radius (stalking cats are much harder to notice).
    let threat: PlayerRuntime | null = null;
    let threatD = Infinity;
    for (const p of players) {
      const d = Math.hypot(p.state.x - s.x, p.state.y - s.y);
      const radius = b.def.alertRadius * (p.state.stalking ? 0.4 : p.state.running ? 1.3 : p.state.moving ? 1 : 0.6);
      if (d < radius && d < threatD) {
        threat = p;
        threatD = d;
      }
    }

    if (threat && s.mode !== "flee" && s.mode !== "freeze") {
      if (b.def.behaviour === "flier") {
        s.mode = "fly";
        b.despawnAt = now + 1200;
        continue;
      }
      if (b.def.behaviour === "skittish" && ctx.rng() < 0.3) {
        s.mode = "freeze";
        b.modeUntil = now + 700;
        b.vx = b.vy = 0;
      } else {
        startFlee(ctx, s, b, threat, now);
      }
    } else if (s.mode === "freeze" && now >= b.modeUntil) {
      if (threat) startFlee(ctx, s, b, threat, now);
      else s.mode = "idle";
    } else if (now >= b.modeUntil) {
      if (s.mode === "flee" && b.def.behaviour === "climber") {
        b.despawnAt = now + 300; // escaped up a tree
      }
      // Wander or idle.
      if (ctx.rng() < 0.55) {
        s.mode = "wander";
        const a = ctx.rng() * Math.PI * 2;
        b.vx = Math.cos(a) * b.def.speed;
        b.vy = Math.sin(a) * b.def.speed;
        b.modeUntil = now + 800 + ctx.rng() * 2200;
      } else {
        s.mode = "idle";
        b.vx = b.vy = 0;
        b.modeUntil = now + 600 + ctx.rng() * 2400;
      }
    }

    if (b.vx || b.vy) {
      const nx = s.x + b.vx * dtSec;
      const ny = s.y + b.vy * dtSec;
      if (validSpot(ctx, b.def, nx, ny)) {
        s.x = nx;
        s.y = ny;
        s.facing = Math.atan2(b.vy, b.vx);
      } else {
        // Blocked: turn away.
        const a = Math.atan2(b.vy, b.vx) + Math.PI / 2 + (ctx.rng() - 0.5);
        const sp = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(a) * sp;
        b.vy = Math.sin(a) * sp;
      }
    }
  }
}

function startFlee(ctx: GameContext, s: PreyState, b: PreyBrain, threat: PlayerRuntime, now: number) {
  const a = Math.atan2(s.y - threat.state.y, s.x - threat.state.x) + (ctx.rng() - 0.5) * 0.8;
  s.mode = "flee";
  b.vx = Math.cos(a) * b.def.fleeSpeed;
  b.vy = Math.sin(a) * b.def.fleeSpeed;
  b.modeUntil = now + (b.def.behaviour === "runner" ? 2600 : 1400) + ctx.rng() * 800;
}

/** Called from an attack: try to catch prey in front of the cat. Returns true if something was caught. */
export function tryCatchPrey(ctx: GameContext, p: PlayerRuntime, moveId: "pounce" | "swipe"): boolean {
  let best: PreyState | null = null;
  let bestD = Infinity;
  for (const s of ctx.state.prey.values()) {
    if (s.mode === "fly") continue;
    const d = Math.hypot(s.x - p.state.x, s.y - p.state.y);
    if (d < bestD && attackReaches(p, moveId, s.x, s.y)) {
      best = s;
      bestD = d;
    }
  }
  if (!best) return false;
  const def = getPrey(best.species);
  if (!def) return false;
  if (ctx.rng() > catchChance(p, moveId, best.species)) {
    const b = brains.get(best);
    if (b) startFlee(ctx, best, b, p, ctx.now());
    ctx.notify(p, "info", `The ${def.name.toLowerCase()} slipped away!`);
    return true;
  }
  const res = addItem(p.char.inventory, def.id, 1);
  if (!res.ok) {
    ctx.notify(p, "warning", res.error ?? "You can't carry any more.");
    return true;
  }
  p.char.inventory = res.inventory;
  ctx.state.prey.delete(best.id);
  markDirty(p);
  ctx.awardXp(p, "catchPrey");
  p.client.send(S2C.preyCaught, { species: def.id });
  ctx.notify(p, "success", `You caught a ${def.name.toLowerCase()}! Bring it back to the fresh-kill pile.`);
  return true;
}

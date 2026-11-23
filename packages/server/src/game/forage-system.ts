import { HERBS, ITEMS, GAME_CONFIG, addItem, getItem, knowsHerb, identifyChance, getHerb, herbDisplayName, type Biome } from "@catgen/shared";
import { ForageState } from "../rooms/schema.ts";
import type { GameContext, PlayerRuntime } from "./context.ts";
import { markDirty } from "./players.ts";

/** Forageable things: herbs and collectibles, each with spawn weights and biomes. */
const FORAGEABLES = [
  ...HERBS.map((h) => ({ itemId: h.id, biomes: h.biomes, weight: h.rarity })),
  ...ITEMS.filter((i) => i.category === "collectible").map((i) => ({ itemId: i.id, biomes: i.biomes ?? [], weight: 1.2 })),
];

let nextForageId = 1;
/** Per-room queue of respawn timestamps. */
const queues = new WeakMap<GameContext, number[]>();
const queue = (ctx: GameContext) => {
  let q = queues.get(ctx);
  if (!q) queues.set(ctx, (q = []));
  return q;
};

function maxNodes(ctx: GameContext): number {
  return Math.floor(GAME_CONFIG.world.maxHerbNodes * (ctx.clock().season === "leafbare" ? 0.5 : 1));
}

export function spawnForage(ctx: GameContext, count: number) {
  const available = new Set<Biome>(ctx.map.biomes());
  const options = FORAGEABLES.filter((f) => f.biomes.some((b) => available.has(b)));
  const total = options.reduce((s, f) => s + f.weight, 0);
  for (let i = 0; i < count; i++) {
    let r = ctx.rng() * total;
    const pick = options.find((f) => (r -= f.weight) <= 0) ?? options[0];
    const biomes = pick.biomes.filter((b) => available.has(b));
    const pt = ctx.map.randomPointInBiome(biomes[Math.floor(ctx.rng() * biomes.length)], ctx.rng);
    if (!pt || ctx.map.collides(pt.x, pt.y, 16)) continue;
    const s = new ForageState();
    s.id = `f${nextForageId++}`;
    s.itemId = pick.itemId;
    s.x = pt.x;
    s.y = pt.y;
    ctx.state.forage.set(s.id, s);
  }
}

export function tickForage(ctx: GameContext) {
  const now = ctx.now();
  const respawnQueue = queue(ctx);
  while (respawnQueue.length && respawnQueue[0] <= now) {
    respawnQueue.shift();
    if (ctx.state.forage.size < maxNodes(ctx)) spawnForage(ctx, 1);
  }
  if (ctx.state.forage.size + respawnQueue.length < maxNodes(ctx)) spawnForage(ctx, 1);
}

export function nearestForage(ctx: GameContext, p: PlayerRuntime): ForageState | null {
  let best: ForageState | null = null;
  let bestD: number = GAME_CONFIG.interaction.range;
  for (const f of ctx.state.forage.values()) {
    const d = Math.hypot(f.x - p.state.x, f.y - p.state.y);
    if (d < bestD) {
      best = f;
      bestD = d;
    }
  }
  return best;
}

export function collectForage(ctx: GameContext, p: PlayerRuntime, node: ForageState): boolean {
  const item = getItem(node.itemId);
  if (!item) return false;
  const res = addItem(p.char.inventory, node.itemId, 1);
  if (!res.ok) {
    ctx.notify(p, "warning", res.error ?? "Inventory full.");
    return false;
  }
  p.char.inventory = res.inventory;
  ctx.state.forage.delete(node.id);
  const respawnQueue = queue(ctx);
  respawnQueue.push(ctx.now() + GAME_CONFIG.world.herbRespawnMs * (0.6 + ctx.rng() * 0.8));
  respawnQueue.sort((a, b) => a - b);

  if (item.category === "herb") {
    const herb = getHerb(item.id)!;
    let learned = false;
    if (!knowsHerb(p.char.rank, p.char.knownHerbs, herb.id)) {
      const isMed = p.char.rank === "medicine_cat" || p.char.rank === "medicine_apprentice";
      if (ctx.rng() < identifyChance(p.char.skills.medicine, isMed)) {
        p.char.knownHerbs = [...p.char.knownHerbs, herb.id];
        learned = true;
      }
    }
    ctx.awardXp(p, "collectHerb");
    const name = herbDisplayName(p.char.rank, p.char.knownHerbs, herb.id);
    ctx.notify(p, "success", learned ? `You recognise this herb: ${herb.name}!` : `You gathered: ${name}.`);
  } else {
    ctx.notify(p, "success", `You found: ${item.name}.`);
  }
  markDirty(p);
  return true;
}

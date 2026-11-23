/**
 * World objects built from licensed pixel-art sprites (see ASSET_CREDITS.md).
 * Each art piece is returned at art resolution; the game draws it at
 * WORLD_PIXEL world units per art pixel with nearest-neighbour filtering.
 * Composite objects (dens, camp rocks, bramble walls) are arranged from the
 * same sprites so everything shares one style.
 */
import type { Season } from "@catgen/shared";
import { WORLD_PIXEL, compose, seasonFn, spriteCanvas, type HslFn, type SpriteRect } from "./env-assets.ts";

export interface ObjectArt {
  canvas: HTMLCanvasElement;
  anchorX: number;
  anchorY: number;
  /** World units per canvas pixel. */
  scale: number;
  /** For trees: canopy region relative to the anchor, in world units (for see-through fading). */
  canopy?: { x: number; y: number; w: number; h: number };
}

const R = (sheet: SpriteRect["sheet"], x: number, y: number, w: number, h: number): SpriteRect => ({ sheet, x, y, w, h });

/** Sprite catalogue (art-pixel rectangles in each sheet). */
export const SPRITES = {
  oak: R("trees", 3, 1, 58, 62),
  pine: R("trees", 6, 66, 52, 61),
  pineTall: R("vom", 138, 54, 41, 72),
  stoneTall: R("stones", 7, 1, 22, 30),
  stoneSmallA: R("stones", 33, 5, 15, 9),
  stoneSmallB: R("stones", 32, 19, 16, 11),
  bushSmallA: R("bushes", 1, 4, 14, 11),
  bushSmallB: R("bushes", 17, 4, 14, 11),
  bushWide: R("bushes", 1, 17, 30, 14),
  log: R("vom", 219, 254, 31, 16),
  logB: R("vom", 254, 254, 31, 16),
  stump: R("vom", 216, 272, 18, 16),
  rockGreySmall: R("vom", 289, 254, 16, 15),
  rockBrownSmall: R("vom", 217, 290, 16, 15),
  rocksBrown: R("vom", 235, 271, 34, 16),
  rocksBrownB: R("vom", 271, 271, 34, 16),
  rocksGrey: R("vom", 235, 289, 34, 16),
  rocksGreyB: R("vom", 271, 289, 34, 16),
  berryBushWide: R("vom", 343, 253, 34, 17),
  berryBushWideB: R("vom", 307, 253, 34, 17),
  bushWideB: R("vom", 343, 271, 34, 17),
  bushWideC: R("vom", 343, 289, 34, 17),
  bushRound: R("vom", 308, 270, 15, 18),
  bushRoundB: R("vom", 308, 288, 15, 18),
  berryBushRound: R("vom", 326, 270, 15, 18),
  mushrooms: R("vom", 109, 128, 17, 15),
  mushroomsB: R("vom", 127, 128, 17, 15),
  flowersRed: R("vom", 112, 91, 20, 22),
  flowerA: R("vom", 133, 92, 10, 9),
  flowerB: R("vom", 125, 108, 10, 10),
  flowerC: R("vom", 115, 116, 10, 9),
  crystals: R("vom", 144, 36, 36, 18),
} as const;
export type SpriteId = keyof typeof SPRITES;

/** Vomdrache's greens are a touch brighter than inkBubi's; harmonise them. */
const harmonise: HslFn = (h, s, l) => (h > 0.15 && h < 0.5 ? [h + 0.02, s * 0.78, l * 0.92] : [h, s, l]);
const CONIFERS = new Set<SpriteId>(["pine", "pineTall"]);

function sprite(id: SpriteId, season: Season, extra?: HslFn): HTMLCanvasElement {
  const r = SPRITES[id];
  const fn = compose(r.sheet === "vom" ? harmonise : undefined, extra, seasonFn(season, CONIFERS.has(id)));
  return spriteCanvas(r, fn);
}

interface Placement { id: SpriteId; x: number; y: number; flip?: boolean; fn?: HslFn }

/** Arrange sprites on a canvas; (x, y) is each sprite's bottom-centre. Adds a soft ground shadow. */
function composite(w: number, h: number, baseY: number, parts: Placement[], season: Season, shadow: { rx: number; ry: number } | null): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  if (shadow) {
    ctx.fillStyle = "rgba(20,30,10,0.28)";
    // Pixel-stepped ellipse.
    for (let yy = -shadow.ry; yy <= shadow.ry; yy++) {
      const half = Math.round(shadow.rx * Math.sqrt(1 - (yy / (shadow.ry + 0.5)) ** 2));
      ctx.fillRect(Math.round(w / 2 - half), baseY + yy, half * 2, 1);
    }
  }
  for (const p of parts) {
    const s = sprite(p.id, season, p.fn);
    ctx.save();
    ctx.translate(Math.round(p.x), Math.round(p.y));
    if (p.flip) ctx.scale(-1, 1);
    ctx.drawImage(s, -Math.round(s.width / 2), -s.height);
    ctx.restore();
  }
  return c;
}

function single(id: SpriteId, season: Season, opts: { shadow?: number; fn?: HslFn; flip?: boolean; scale?: number } = {}): ObjectArt {
  const r = SPRITES[id];
  const pad = 4;
  const w = r.w + pad * 2, h = r.h + 3;
  const c = composite(w, h, r.h - 1, [{ id, x: w / 2, y: r.h, flip: opts.flip, fn: opts.fn }], season, opts.shadow ? { rx: Math.round(r.w * opts.shadow), ry: 2 } : null);
  return { canvas: c, anchorX: 0.5, anchorY: (r.h - 1) / h, scale: WORLD_PIXEL * (opts.scale ?? 1) };
}

function treeArt(id: SpriteId, season: Season, flip: boolean, fn?: HslFn, scale = 1): ObjectArt {
  const art = single(id, season, { shadow: 0.38, flip, fn, scale });
  const r = SPRITES[id];
  const s = art.scale;
  art.canopy = { x: -r.w * 0.5 * s, y: -r.h * s, w: r.w * s, h: r.h * 0.72 * s };
  return art;
}

const DARK_ENTRANCE = "rgba(18,14,10,0.92)";

/** Pixel arch used as a den entrance. */
function entrance(ctx: CanvasRenderingContext2D, cx: number, by: number, w: number, h: number) {
  ctx.fillStyle = DARK_ENTRANCE;
  for (let y = 0; y < h; y++) {
    const k = y / h;
    const half = Math.round((w / 2) * Math.sqrt(Math.max(0, 1 - (1 - k) ** 2)));
    ctx.fillRect(cx - half, by - h + y, half * 2, 1);
  }
}

const cache = new Map<string, ObjectArt>();

export function objectArt(kind: string, variant: number, season: Season): ObjectArt {
  const key = `${kind}:${variant}:${season}`;
  let art = cache.get(key);
  if (!art) {
    art = build(kind, variant, season);
    cache.set(key, art);
  }
  return art;
}

export function clearObjectArt() {
  cache.clear();
}

const birch: HslFn = (h, s, l) => (h > 0.15 && h < 0.5 ? [h - 0.05, s * 0.9, Math.min(1, l * 1.12)] : [h, s * 0.4, Math.min(1, l * 1.3)]);
const willow: HslFn = (h, s, l) => (h > 0.15 && h < 0.5 ? [h + 0.05, s * 0.7, l * 1.02] : [h, s, l]);
const darkStone: HslFn = (h, s, l) => [h, s * 0.5, l * 0.62];

function build(kind: string, variant: number, season: Season): ObjectArt {
  const flip = variant % 2 === 1;
  switch (kind) {
    case "tree_oak": return treeArt("oak", season, flip);
    case "tree_birch": return treeArt("oak", season, flip, birch);
    case "tree_willow": return treeArt("oak", season, flip, willow);
    case "tree_great_oak": return treeArt("oak", season, flip, (h, s, l) => [h, s, l * 0.92], 1.5);
    case "tree_pine": return treeArt(variant % 3 === 2 ? "pineTall" : "pine", season, flip);
    case "bush": return single((["bushSmallA", "bushSmallB", "bushWide", "bushRound"] as SpriteId[])[variant % 4], season, { shadow: 0.4, flip });
    case "gorse": return single(variant % 2 ? "berryBushWide" : "berryBushRound", season, { shadow: 0.4, flip, fn: (h, s, l) => [h + 0.03, s * 0.9, l] });
    case "fern": return single(variant % 2 ? "bushSmallA" : "bushSmallB", season, { shadow: 0.3, flip, fn: (h, s, l) => [h + 0.04, s, l * 0.92] });
    case "heather": return single(variant % 2 ? "flowerC" : "flowerA", season, { flip });
    case "flowers": return single((["flowerA", "flowerB", "flowerC", "flowersRed", "mushrooms", "mushroomsB"] as SpriteId[])[variant % 6], season, { flip });
    case "tall_grass": return single(variant % 2 ? "bushSmallB" : "bushSmallA", season, { shadow: 0.25, flip, fn: (h, s, l) => [h - 0.02, s * 0.85, l * 1.05] });
    case "reeds": return single("bushRoundB", season, { flip, fn: (h, s, l) => [h + 0.06, s * 0.6, l * 0.85] });
    case "rock_small": return single((["stoneSmallA", "stoneSmallB", "rockGreySmall", "rockBrownSmall"] as SpriteId[])[variant % 4], season, { shadow: 0.4, flip });
    case "pebbles": return single("stoneSmallA", season, { flip });
    case "stepping_stone": return single("stoneSmallB", season, { flip });
    case "boulder": return single((["rocksGrey", "rocksBrown", "rocksGreyB", "rocksBrownB"] as SpriteId[])[variant % 4], season, { shadow: 0.45, flip });
    case "log": return single(variant % 2 ? "logB" : "log", season, { shadow: 0.45, flip });
    case "pine_stump": return single("stump", season, { shadow: 0.5, flip, scale: 1.5 });
    case "stalagmite": return single("stoneTall", season, { shadow: 0.45, flip, fn: darkStone });
    case "crystal": return single("crystals", season, { flip });
    case "lilypad": {
      // Small original pixel lily pad (no suitable licensed sprite exists).
      const c = document.createElement("canvas");
      c.width = 10; c.height = 7;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = season === "leafbare" ? "#7f9a8f" : "#3f7a3a";
      ctx.fillRect(1, 1, 8, 5); ctx.fillRect(0, 2, 10, 3);
      ctx.fillStyle = season === "leafbare" ? "#9ab0a6" : "#5c9a48";
      ctx.fillRect(2, 2, 3, 2);
      ctx.fillStyle = "rgba(0,0,0,0)";
      ctx.clearRect(5, 1, 1, 3);
      if (season === "greenleaf" && variant % 2 === 0) { ctx.fillStyle = "#f2c0d8"; ctx.fillRect(6, 2, 2, 2); }
      return { canvas: c, anchorX: 0.5, anchorY: 0.6, scale: WORLD_PIXEL };
    }
    case "highrock":
    case "tallrock":
    case "sky_rock":
    case "great_rock": {
      // Leader's rock: a tall stone flanked by boulders.
      const big = kind === "great_rock" ? 1.6 : 1.35;
      const c = composite(60, 40, 36, [
        { id: "rocksGrey", x: 17, y: 38 },
        { id: "rocksGreyB", x: 43, y: 39, flip: true },
        { id: "stoneTall", x: 30, y: 37, fn: kind === "sky_rock" ? (h, s, l) => [h, s, Math.min(1, l * 1.1)] : undefined },
      ], season, { rx: 28, ry: 3 });
      return { canvas: c, anchorX: 0.5, anchorY: 36 / 40, scale: WORLD_PIXEL * big };
    }
    case "reed_mound": {
      const c = composite(44, 26, 23, [
        { id: "bushWideB", x: 22, y: 24, fn: (h, s, l) => [h + 0.06, s * 0.6, l * 0.85] },
        { id: "bushRound", x: 10, y: 22, fn: (h, s, l) => [h + 0.06, s * 0.6, l * 0.85] },
        { id: "bushRoundB", x: 34, y: 23, flip: true, fn: (h, s, l) => [h + 0.06, s * 0.6, l * 0.85] },
      ], season, { rx: 20, ry: 2 });
      return { canvas: c, anchorX: 0.5, anchorY: 23 / 26, scale: WORLD_PIXEL * 1.25 };
    }
    case "bramble_wall": {
      const ids: SpriteId[] = ["bushWideB", "berryBushWide", "bushWideC", "berryBushWideB"];
      return single(ids[variant % 4], season, { shadow: 0.45, flip, fn: (h, s, l) => [h + 0.02, s * 0.85, l * 0.82] });
    }
    case "den": {
      // 0 warriors, 1 apprentices, 2 nursery, 3 elders, 4 medicine den.
      if (variant === 4) {
        const c = composite(56, 40, 37, [
          { id: "rocksGrey", x: 14, y: 38 },
          { id: "rocksGreyB", x: 42, y: 38, flip: true },
          { id: "stoneTall", x: 28, y: 31 },
          { id: "bushSmallA", x: 9, y: 39 },
          { id: "flowerB", x: 47, y: 39 },
        ], season, { rx: 26, ry: 3 });
        entrance(c.getContext("2d")!, 28, 38, 12, 9);
        return { canvas: c, anchorX: 0.5, anchorY: 37 / 40, scale: WORLD_PIXEL * 1.1 };
      }
      if (variant === 3) {
        const c = composite(56, 34, 31, [
          { id: "bushWide", x: 36, y: 26 },
          { id: "log", x: 24, y: 32 },
          { id: "bushRound", x: 8, y: 31 },
        ], season, { rx: 26, ry: 3 });
        entrance(c.getContext("2d")!, 30, 30, 9, 6);
        return { canvas: c, anchorX: 0.5, anchorY: 31 / 34, scale: WORLD_PIXEL * 1.1 };
      }
      const set: SpriteId[][] = [
        ["bushWideB", "bushRound", "bushRoundB"],
        ["bushWide", "bushSmallA", "bushSmallB"],
        ["bushWideC", "berryBushRound", "bushRound"],
      ];
      const [mid, l, r] = set[variant % 3];
      const c = composite(52, 34, 31, [
        { id: l, x: 11, y: 30 },
        { id: r, x: 41, y: 30, flip: true },
        { id: mid, x: 26, y: 24 },
        { id: "bushWideC", x: 26, y: 32 },
      ], season, { rx: 25, ry: 3 });
      entrance(c.getContext("2d")!, 26, 31, 12, 9);
      return { canvas: c, anchorX: 0.5, anchorY: 31 / 34, scale: WORLD_PIXEL * 1.2 };
    }
    case "fresh_kill_pile": {
      const c = document.createElement("canvas");
      c.width = 18; c.height = 7;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#5e4a30";
      ctx.fillRect(2, 1, 14, 5); ctx.fillRect(0, 2, 18, 3);
      ctx.fillStyle = "#77603e";
      ctx.fillRect(3, 2, 10, 2);
      return { canvas: c, anchorX: 0.5, anchorY: 0.6, scale: WORLD_PIXEL };
    }
    default:
      return single("stoneSmallA", season, {});
  }
}

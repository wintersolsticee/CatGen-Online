/**
 * Licensed environment artwork (see ASSET_CREDITS.md):
 *  - inkBubi "Seasons of Forest" free sample (CC0): grass, dirt, water, oak/pine, stones, bushes
 *  - Vomdrache "Forest Tilemap" (CC0): pines, logs, stumps, rocks, berry bushes, flowers, mushrooms
 * All art is 16px-grid pixel art, drawn in the world at WORLD_PIXEL world units per art pixel.
 */
import type { Season } from "@catgen/shared";
import { rgbToHsl, hslToRgb } from "./color.ts";

/** World units per source pixel (tiles are 16px art -> 128 world units). */
export const WORLD_PIXEL = 8;

const BASE = (import.meta.env.BASE_URL ?? "/") + "assets/environment/";
export const ENV_SHEETS = {
  grass: "terrain/inkbubi_grass.png",
  grassDirt: "terrain/inkbubi_grass_dirt.png",
  water: "water/inkbubi_grass_deep_water.png",
  trees: "forest/inkbubi_trees.png",
  stones: "rocks/inkbubi_stones.png",
  bushes: "plants/inkbubi_bushes.png",
  vom: "forest/vomdrache_forest_tilemap.png",
} as const;
export type SheetId = keyof typeof ENV_SHEETS;

const images = new Map<SheetId, HTMLImageElement>();
const pixels = new Map<SheetId, ImageData>();

let loading: Promise<void> | null = null;
export function preloadEnvironment(): Promise<void> {
  loading ??= Promise.all(
    (Object.keys(ENV_SHEETS) as SheetId[]).map(
      (id) =>
        new Promise<void>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            images.set(id, img);
            const c = document.createElement("canvas");
            c.width = img.width;
            c.height = img.height;
            const ctx = c.getContext("2d", { willReadFrequently: true })!;
            ctx.drawImage(img, 0, 0);
            pixels.set(id, ctx.getImageData(0, 0, img.width, img.height));
            resolve();
          };
          img.onerror = () => reject(new Error(`Could not load ${ENV_SHEETS[id]}`));
          img.src = BASE + ENV_SHEETS[id];
        }),
    ),
  ).then(() => undefined);
  return loading;
}

export function sheetPixels(id: SheetId): ImageData {
  const p = pixels.get(id);
  if (!p) throw new Error("Environment art not loaded - call preloadEnvironment() first");
  return p;
}

export function sheetImage(id: SheetId): HTMLImageElement {
  const p = images.get(id);
  if (!p) throw new Error("Environment art not loaded - call preloadEnvironment() first");
  return p;
}

/** A rectangle of a sheet, in source pixels. */
export interface SpriteRect {
  sheet: SheetId;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type HslFn = (h: number, s: number, l: number) => [number, number, number];
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const isFoliage = (h: number, s: number) => h > 0.15 && h < 0.5 && s > 0.12;

/**
 * Seasonal recolour for vegetation pixels (greens). `conifer` keeps pines
 * green through leaf-fall and leaf-bare (with frost instead of snow cover).
 */
export function seasonFn(season: Season, conifer = false): HslFn {
  switch (season) {
    case "newleaf":
      return (h, s, l) => (isFoliage(h, s) ? [h - 0.015, clamp01(s * 1.08), clamp01(l * 1.06)] : [h, s, l]);
    case "greenleaf":
      return (h, s, l) => [h, s, l];
    case "leaffall":
      return (h, s, l) => (isFoliage(h, s) && !conifer ? [0.07 + (h - 0.3) * 0.25, clamp01(s * 1.05), l * 0.95] : isFoliage(h, s) ? [h - 0.03, s * 0.85, l * 0.92] : [h, s, l]);
    case "leafbare":
      return (h, s, l) => (isFoliage(h, s) ? (conifer ? [h + 0.04, s * 0.45, clamp01(l * 0.8 + 0.12)] : [0.58, s * 0.12, clamp01(l * 0.35 + 0.62)]) : [h, s, l]);
  }
}

/** Apply an HSL transform to every pixel of an ImageData in place. */
export function recolor(data: ImageData, fn: HslFn) {
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
    const [h2, s2, l2] = fn(h, s, l);
    const [r, g, b] = hslToRgb(((h2 % 1) + 1) % 1, clamp01(s2), clamp01(l2));
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
}

/** Copy a sprite rect onto a new canvas, optionally recoloured. */
export function spriteCanvas(r: SpriteRect, fn?: HslFn): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = r.w;
  c.height = r.h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(sheetImage(r.sheet), r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  if (fn) {
    const data = ctx.getImageData(0, 0, r.w, r.h);
    recolor(data, fn);
    ctx.putImageData(data, 0, 0);
  }
  return c;
}

export function compose(...fns: (HslFn | undefined)[]): HslFn {
  return (h, s, l) => fns.reduce<[number, number, number]>((acc, f) => (f ? f(...acc) : acc), [h, s, l]);
}

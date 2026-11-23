/**
 * Hand-drawn cat sprites ("Pet Cats Pack" by LuizMelo, CC0).
 *
 * Every sheet is a row of 50x50 frames; the cat's feet sit on row 32 and its
 * body is centred around x=25. Coat shades are produced by recolouring the
 * sheet once (HSL transform) and caching the result.
 */
import { CAT_SPRITE_IDS, type Appearance, type CatSpriteId, type CoatShade } from "@catgen/shared";
import { makeCanvas, rgbToHsl, hslToRgb } from "./color.ts";

export const FRAME = 50;
export const FEET_X = 25;
export const FEET_Y = 32;
/** World units per sprite pixel at size 1.0 (adult); matches the environment's WORLD_PIXEL. */
export const CAT_PIXEL_SCALE = 8;

export type CatAnim = "idle" | "walk" | "run" | "sit" | "lie" | "sleep" | "groom" | "meow" | "stretch" | "itch";

export const ANIMS: Record<CatAnim, { files: string[]; fps: number; loop: boolean }> = {
  idle: { files: ["idle"], fps: 7, loop: true },
  walk: { files: ["walk"], fps: 10, loop: true },
  run: { files: ["run"], fps: 15, loop: true },
  sit: { files: ["sit"], fps: 1, loop: true },
  lie: { files: ["lie"], fps: 10, loop: false },
  sleep: { files: ["sleep1", "sleep2"], fps: 1.2, loop: true },
  groom: { files: ["groom"], fps: 7, loop: true },
  meow: { files: ["meow"], fps: 8, loop: false },
  stretch: { files: ["stretch"], fps: 10, loop: false },
  itch: { files: ["itch"], fps: 8, loop: true },
};
export const ANIM_NAMES = Object.keys(ANIMS) as CatAnim[];

const BASE = (import.meta.env.BASE_URL ?? "/") + "assets/cats/";
const images = new Map<string, HTMLImageElement>();

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

let preloadPromise: Promise<void> | null = null;
/** Load every cat sheet once (small: ~300 KB in total). Call before drawing. */
export function preloadCatSprites(): Promise<void> {
  preloadPromise ??= Promise.all(
    CAT_SPRITE_IDS.flatMap((id) =>
      [...new Set(Object.values(ANIMS).flatMap((a) => a.files))].map(async (file) => {
        images.set(`${id}/${file}`, await loadImage(`${BASE}${id}/${file}.png`));
      }),
    ),
  ).then(() => undefined);
  return preloadPromise;
}

// ---------------------------------------------------------------------------
// Coat recolouring

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Colour transform for each coat shade. Hue in 0..1. */
const COATS: Record<CoatShade, (h: number, s: number, l: number) => [number, number, number]> = {
  natural: (h, s, l) => [h, s, l],
  light: (h, s, l) => [h, s * 0.85, clamp01(l + (1 - l) * 0.35)],
  dark: (h, s, l) => [h, s, l * 0.62],
  warm: (h, s, l) => [0.07, clamp01(Math.max(s, 0.25) * 1.2), l],
  cool: (h, s, l) => [0.6, clamp01(s * 0.5 + 0.08), l],
  golden: (h, s, l) => [0.11, clamp01(Math.max(s, 0.45)), clamp01(l * 1.05 + 0.04)],
  silver: (h, s, l) => [h, s * 0.12, clamp01(l * 0.85 + 0.2)],
  smoky: (h, s, l) => [0.62, s * 0.15, l * 0.7],
  rusty: (h, s, l) => [0.03, clamp01(Math.max(s, 0.4) * 1.1), l * 0.9],
};

/** Saturated, light pixels in a mostly-dark/grey cat are eyes: leave them alone so they stay readable. */
function isEye(s: number, l: number): boolean {
  return s > 0.55 && l > 0.35 && l < 0.85;
}

const sheetCache = new Map<string, HTMLCanvasElement>();

/** A recoloured sheet (all frames in a row) for a sprite, coat and animation. */
export function catSheet(sprite: CatSpriteId, coat: CoatShade, anim: CatAnim): HTMLCanvasElement {
  const key = `${sprite}/${coat}/${anim}`;
  const hit = sheetCache.get(key);
  if (hit) return hit;
  const parts = ANIMS[anim].files.map((f) => images.get(`${sprite}/${f}`));
  if (parts.some((p) => !p)) throw new Error("Cat sprites not loaded yet - call preloadCatSprites() first");
  const width = parts.reduce((w, p) => w + p!.width, 0);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = FRAME;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  let x = 0;
  for (const p of parts) {
    ctx.drawImage(p!, x, 0);
    x += p!.width;
  }
  if (coat !== "natural") {
    const data = ctx.getImageData(0, 0, width, FRAME);
    const d = data.data;
    const tf = COATS[coat];
    const eyeSafe = sprite !== "cat-1"; // the ginger cat's fur is itself saturated
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
      if (eyeSafe && isEye(s, l)) continue;
      const [h2, s2, l2] = tf(h, s, l);
      const [r, g, b] = hslToRgb(h2, s2, l2);
      d[i] = r; d[i + 1] = g; d[i + 2] = b;
    }
    ctx.putImageData(data, 0, 0);
  }
  sheetCache.set(key, canvas);
  return canvas;
}

export function frameCount(sheet: HTMLCanvasElement): number {
  return Math.max(1, Math.floor(sheet.width / FRAME));
}

/**
 * Draw one animation frame with crisp pixels, feet at (x, y).
 * `scale` is the on-screen size of one sprite pixel.
 */
export function drawCatFrame(ctx: CanvasRenderingContext2D, a: Pick<Appearance, "sprite" | "coat">, anim: CatAnim, frame: number, x: number, y: number, scale: number, flip = false) {
  const sheet = catSheet(a.sprite, a.coat, anim);
  const n = frameCount(sheet);
  const f = ANIMS[anim].loop ? ((Math.floor(frame) % n) + n) % n : Math.min(n - 1, Math.max(0, Math.floor(frame)));
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(Math.round(x), Math.round(y));
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(sheet, f * FRAME, 0, FRAME, FRAME, -FEET_X * scale, -FEET_Y * scale, FRAME * scale, FRAME * scale);
  ctx.restore();
}

/** Draw an animation playing at its natural speed for elapsed time `t` (seconds). */
export function drawCatAnimated(ctx: CanvasRenderingContext2D, a: Pick<Appearance, "sprite" | "coat">, anim: CatAnim, t: number, x: number, y: number, scale: number, flip = false) {
  drawCatFrame(ctx, a, anim, t * ANIMS[anim].fps, x, y, scale, flip);
}

/** Head-and-shoulders portrait for the HUD and cards. */
export function renderPortrait(a: Pick<Appearance, "sprite" | "coat">, size = 96): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size, size);
  const sheet = catSheet(a.sprite, a.coat, "idle");
  ctx.imageSmoothingEnabled = false;
  // The head occupies roughly x 26..40, y 14..28 in the first idle frame.
  const sx = 25, sy = 13, sw = 16;
  ctx.drawImage(sheet, sx, sy, sw, sw, 0, 0, size, size);
  return canvas;
}

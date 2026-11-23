/** Illustrated scenes for the website (landing hero, previews) using the game's own renderers. */
import { normalizeAppearance, type Appearance } from "@catgen/shared";
import { drawCatAnimated, CAT_PIXEL_SCALE, type CatAnim } from "../render/cat-sprites.ts";
import { objectArt } from "../render/env-objects.ts";
import { sheetImage } from "../render/env-assets.ts";

export const HERO_CATS: Appearance[] = [
  normalizeAppearance({ sprite: "cat-1" }),
  normalizeAppearance({ sprite: "cat-6" }),
  normalizeAppearance({ sprite: "cat-2" }),
  normalizeAppearance({ sprite: "cat-3" }),
  normalizeAppearance({ sprite: "cat-5" }),
];

/** Animated hero scene: cats gathered around the leader's rock at dusk. Returns a stop() function. */
export function runHeroScene(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d")!;
  let raf = 0;
  const start = performance.now();
  const draw = (img: HTMLCanvasElement, x: number, y: number, ax: number, ay: number, px: number) =>
    ctx.drawImage(img, Math.round(x - img.width * ax * px), Math.round(y - img.height * ay * px), img.width * px, img.height * px);
  const frame = (now: number) => {
    const t = (now - start) / 1000;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = canvas.clientWidth * dpr, H = canvas.clientHeight * dpr;
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);
    const px = Math.max(2, Math.floor(W / 190)); // one art pixel, in canvas pixels
    // Moon glow.
    const mg = ctx.createRadialGradient(W * 0.8, H * 0.15, 0, W * 0.8, H * 0.15, W * 0.22);
    mg.addColorStop(0, "rgba(255,246,220,0.95)");
    mg.addColorStop(0.11, "rgba(255,240,200,0.9)");
    mg.addColorStop(0.12, "rgba(255,230,170,0.22)");
    mg.addColorStop(1, "rgba(255,230,170,0)");
    ctx.fillStyle = mg;
    ctx.fillRect(0, 0, W, H);
    // Ground: an oval of real grass tiles.
    const cx = W / 2, cy = H * 0.76, rx = W * 0.47, ry = H * 0.2;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();
    const grass = sheetImage("grass");
    const tile = 16 * px;
    for (let y = cy - ry - tile; y < cy + ry + tile; y += tile)
      for (let x = cx - rx - tile; x < cx + rx + tile; x += tile) {
        const v = (Math.floor(x / tile) * 7 + Math.floor(y / tile) * 13) % 12;
        const [sx, sy] = v < 4 ? [v, 0] : v < 8 ? [v - 4, 1] : v < 11 ? [v - 8, 3] : [1, 2];
        ctx.drawImage(grass, sx * 16, sy * 16, 16, 16, Math.round(x), Math.round(y), tile, tile);
      }
    const fade = ctx.createRadialGradient(cx, cy, rx * 0.5, cx, cy, rx);
    fade.addColorStop(0, "rgba(0,0,0,0)");
    fade.addColorStop(1, "rgba(10,16,10,0.7)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    // Scenery from the licensed environment art.
    const pine = objectArt("tree_pine", 0, "greenleaf");
    const oak = objectArt("tree_oak", 1, "greenleaf");
    const rock = objectArt("highrock", 0, "greenleaf");
    const bush = objectArt("bush", 3, "greenleaf");
    const flowers = objectArt("flowers", 3, "greenleaf");
    draw(pine.canvas, W * 0.13, cy - ry * 0.1, pine.anchorX, pine.anchorY, px);
    draw(oak.canvas, W * 0.86, cy - ry * 0.05, oak.anchorX, oak.anchorY, px);
    const rockPx = Math.round(px * 1.3);
    draw(rock.canvas, cx, cy + ry * 0.05, rock.anchorX, rock.anchorY, rockPx);
    draw(bush.canvas, W * 0.3, cy + ry * 0.55, bush.anchorX, bush.anchorY, px);
    draw(flowers.canvas, W * 0.68, cy + ry * 0.7, flowers.anchorX, flowers.anchorY, px);
    // Cats (rock top is ~30 art pixels above its base).
    const spots: [number, number, CatAnim, boolean][] = [
      [cx, cy + ry * 0.05 - 29 * rockPx, "sit", false],
      [W * 0.26, cy + ry * 0.28, "idle", false],
      [W * 0.75, cy + ry * 0.34, "sleep", true],
      [W * 0.4, cy + ry * 0.75, "groom", false],
      [W * 0.6, cy + ry * 0.82, "idle", true],
    ];
    spots.forEach(([x, y, anim, flip], i) => drawCatAnimated(ctx, HERO_CATS[i], anim, t + i * 0.7, x, y, px, flip));
    // Fireflies.
    for (let i = 0; i < 14; i++) {
      const fx = W * (0.1 + ((i * 0.137 + t * 0.01 * ((i % 3) + 1)) % 0.8));
      const fy = H * (0.3 + 0.35 * Math.abs(Math.sin(t * 0.3 + i)));
      const a = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + i * 1.7));
      ctx.fillStyle = `rgba(230,255,150,${a})`;
      ctx.fillRect(Math.round(fx / px) * px, Math.round(fy / px) * px, px, px);
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

/** Draw a single cat preview into a canvas element (sized by CSS). */
export function drawCatCard(canvas: HTMLCanvasElement, a: Appearance, anim: CatAnim = "sit", t = 0) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = (canvas.clientWidth || 260) * dpr, H = (canvas.clientHeight || 170) * dpr;
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);
  const scale = Math.floor(Math.min(W / 30, H / 22));
  drawCatAnimated(ctx, a, anim, t, W / 2, H * 0.86, scale);
}

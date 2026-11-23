/** Illustrated scenes for the website (landing hero, previews) using the game's own renderers. */
import { normalizeAppearance, type Appearance } from "@catgen/shared";
import { drawCatAnimated, CAT_PIXEL_SCALE, type CatAnim } from "../render/cat-sprites.ts";
import { objectArt } from "../render/object-textures.ts";
import { makeTerrainTexture } from "../render/terrain-textures.ts";

export const HERO_CATS: Appearance[] = [
  normalizeAppearance({ sprite: "cat-1" }),
  normalizeAppearance({ sprite: "cat-6" }),
  normalizeAppearance({ sprite: "cat-2" }),
  normalizeAppearance({ sprite: "cat-3" }),
  normalizeAppearance({ sprite: "cat-5" }),
];

/** Animated hero scene: cats gathered on a rock at dusk. Returns a stop() function. */
export function runHeroScene(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d")!;
  const grass = makeTerrainTexture("grass", "greenleaf");
  let raf = 0;
  const start = performance.now();
  const frame = (now: number) => {
    const t = (now - start) / 1000;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = canvas.clientWidth * dpr, H = canvas.clientHeight * dpr;
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    const s = W / 700;
    ctx.clearRect(0, 0, W, H);
    // Ground disc.
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(W / 2, H * 0.78, W * 0.48, H * 0.2, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = ctx.createPattern(grass, "repeat")!;
    ctx.fillRect(0, 0, W, H);
    const fadeG = ctx.createRadialGradient(W / 2, H * 0.78, 0, W / 2, H * 0.78, W * 0.5);
    fadeG.addColorStop(0.6, "rgba(0,0,0,0)");
    fadeG.addColorStop(1, "rgba(10,16,10,0.85)");
    ctx.fillStyle = fadeG;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    // Moon glow.
    const mg = ctx.createRadialGradient(W * 0.78, H * 0.16, 0, W * 0.78, H * 0.16, W * 0.2);
    mg.addColorStop(0, "rgba(255,246,220,0.95)");
    mg.addColorStop(0.12, "rgba(255,240,200,0.9)");
    mg.addColorStop(0.13, "rgba(255,230,170,0.25)");
    mg.addColorStop(1, "rgba(255,230,170,0)");
    ctx.fillStyle = mg;
    ctx.fillRect(0, 0, W, H);
    // Trees.
    const tree = objectArt("tree_oak", 1, "greenleaf");
    const pine = objectArt("tree_pine", 2, "greenleaf");
    ctx.drawImage(pine.canvas, W * 0.02, H * 0.78 - pine.canvas.height * 0.62 * s * 0.98, pine.canvas.width * 0.62 * s, pine.canvas.height * 0.62 * s);
    ctx.drawImage(tree.canvas, W * 0.62, H * 0.74 - tree.canvas.height * 0.62 * s * 0.93, tree.canvas.width * 0.62 * s, tree.canvas.height * 0.62 * s);
    const rock = objectArt("highrock", 0, "greenleaf");
    const rw = rock.canvas.width * 0.75 * s, rh = rock.canvas.height * 0.75 * s;
    ctx.drawImage(rock.canvas, W * 0.5 - rw / 2, H * 0.8 - rh * rock.anchorY, rw, rh);
    // Cats.
    const spots: [number, number, number, CatAnim, boolean][] = [
      [0.5, 0.8 - (rh * 0.7) / H, 1.15, "sit", false],
      [0.24, 0.84, 1.1, "idle", false],
      [0.76, 0.86, 1.05, "sleep", true],
      [0.38, 0.92, 1.0, "groom", false],
      [0.63, 0.95, 1.05, "idle", true],
    ];
    spots.forEach(([x, y, sc, anim, flip], i) => {
      drawCatAnimated(ctx, HERO_CATS[i], anim, t + i * 0.7, W * x, H * y, CAT_PIXEL_SCALE * 0.75 * sc * s, flip);
    });
    // Fireflies.
    for (let i = 0; i < 14; i++) {
      const fx = W * (0.1 + ((i * 0.137 + t * 0.01 * (i % 3 + 1)) % 0.8));
      const fy = H * (0.3 + 0.35 * Math.abs(Math.sin(t * 0.3 + i)));
      const a = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + i * 1.7));
      const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, 8 * dpr);
      g.addColorStop(0, `rgba(230,255,150,${a})`);
      g.addColorStop(1, "rgba(230,255,150,0)");
      ctx.fillStyle = g;
      ctx.fillRect(fx - 10 * dpr, fy - 10 * dpr, 20 * dpr, 20 * dpr);
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

/**
 * Prey and herb artwork (original CatGen art). It is drawn smooth, then
 * pixelated to the world's art-pixel grid so it matches the licensed
 * pixel-art environment (see pixelate()).
 */
import type { PreyDefinition, HerbDefinition } from "@catgen/shared";
import { makeCanvas, seeded, shade, rgba, hashString } from "./color.ts";

export interface ObjectArt {
  canvas: HTMLCanvasElement;
  anchorX: number;
  anchorY: number;
}

type Ctx = CanvasRenderingContext2D;
const cache = new Map<string, ObjectArt>();

function shadowEllipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, a = 0.28) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, `rgba(10,15,5,${a})`);
  g.addColorStop(1, "rgba(10,15,5,0)");
  ctx.fillStyle = g;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  ctx.translate(-x, -y);
  ctx.beginPath();
  ctx.arc(x, y, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Prey

export function preyArt(def: PreyDefinition): ObjectArt {
  const key = "prey:" + def.id;
  const hit = cache.get(key);
  if (hit) return hit;
  const s = def.look.size;
  const W = s * 2.4, H = s * 1.8;
  const { canvas, ctx } = makeCanvas(W * 2, H * 2);
  ctx.scale(2, 2);
  const cx = W / 2, by = H * 0.8;
  shadowEllipse(ctx, cx, by, s * 0.6, s * 0.14, 0.3);
  const body = def.look.body, belly = def.look.belly;
  const outline = shade(body, -0.5);
  const fillBody = (path: Path2D) => {
    const g = ctx.createLinearGradient(0, by - s, 0, by);
    g.addColorStop(0, shade(body, 0.15));
    g.addColorStop(0.7, body);
    g.addColorStop(1, belly);
    ctx.fillStyle = g;
    ctx.fill(path);
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1;
    ctx.stroke(path);
  };
  const eye = (x: number, y: number) => {
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.2, s * 0.04), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x + 0.5, y - 0.5, 0.5, 0, Math.PI * 2);
    ctx.fill();
  };
  const p = new Path2D();
  switch (def.look.shape) {
    case "mouse":
    case "vole": {
      ctx.strokeStyle = shade(body, 0.2);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.3, by - s * 0.15);
      ctx.quadraticCurveTo(cx - s * 0.7, by - s * 0.05, cx - s * (def.look.shape === "mouse" ? 0.95 : 0.6), by - s * 0.3);
      ctx.stroke();
      p.ellipse(cx, by - s * 0.22, s * 0.38, s * 0.22, 0, 0, Math.PI * 2);
      p.ellipse(cx + s * 0.32, by - s * 0.26, s * 0.17, s * 0.13, 0.3, 0, Math.PI * 2);
      fillBody(p);
      ctx.fillStyle = "#e8b0b0";
      ctx.beginPath();
      ctx.arc(cx + s * 0.26, by - s * 0.42, s * 0.09, 0, Math.PI * 2);
      ctx.fill();
      eye(cx + s * 0.38, by - s * 0.3);
      break;
    }
    case "rabbit": {
      p.ellipse(cx - s * 0.05, by - s * 0.3, s * 0.4, s * 0.3, 0, 0, Math.PI * 2);
      p.ellipse(cx + s * 0.33, by - s * 0.48, s * 0.18, s * 0.16, 0, 0, Math.PI * 2);
      p.ellipse(cx + s * 0.27, by - s * 0.78, s * 0.06, s * 0.2, -0.2, 0, Math.PI * 2);
      p.ellipse(cx + s * 0.35, by - s * 0.78, s * 0.06, s * 0.2, 0.15, 0, Math.PI * 2);
      fillBody(p);
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(cx - s * 0.45, by - s * 0.32, s * 0.1, 0, Math.PI * 2);
      ctx.fill();
      eye(cx + s * 0.38, by - s * 0.52);
      break;
    }
    case "squirrel": {
      const tail = new Path2D();
      tail.ellipse(cx - s * 0.35, by - s * 0.55, s * 0.2, s * 0.38, -0.3, 0, Math.PI * 2);
      fillBody(tail);
      p.ellipse(cx, by - s * 0.3, s * 0.3, s * 0.24, -0.3, 0, Math.PI * 2);
      p.ellipse(cx + s * 0.25, by - s * 0.5, s * 0.15, s * 0.13, 0, 0, Math.PI * 2);
      fillBody(p);
      eye(cx + s * 0.3, by - s * 0.53);
      break;
    }
    case "bird": {
      p.ellipse(cx, by - s * 0.35, s * 0.33, s * 0.24, -0.2, 0, Math.PI * 2);
      p.ellipse(cx + s * 0.27, by - s * 0.52, s * 0.15, s * 0.14, 0, 0, Math.PI * 2);
      p.moveTo(cx - s * 0.25, by - s * 0.38);
      p.lineTo(cx - s * 0.6, by - s * 0.5);
      p.lineTo(cx - s * 0.55, by - s * 0.3);
      fillBody(p);
      ctx.fillStyle = "#c9a040";
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.4, by - s * 0.55);
      ctx.lineTo(cx + s * 0.52, by - s * 0.5);
      ctx.lineTo(cx + s * 0.4, by - s * 0.47);
      ctx.fill();
      ctx.fillStyle = rgba(shade(body, -0.3), 0.8);
      ctx.beginPath();
      ctx.ellipse(cx - s * 0.05, by - s * 0.4, s * 0.2, s * 0.1, -0.3, 0, Math.PI * 2);
      ctx.fill();
      // speckled breast
      ctx.fillStyle = rgba("#3a2a1a", 0.6);
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(cx + s * 0.1 + (i % 3) * 3, by - s * 0.32 + Math.floor(i / 3) * 3, 1, 0, Math.PI * 2); ctx.fill(); }
      eye(cx + s * 0.31, by - s * 0.56);
      ctx.strokeStyle = "#8a6a3a";
      ctx.beginPath();
      ctx.moveTo(cx, by - s * 0.12);
      ctx.lineTo(cx, by);
      ctx.stroke();
      break;
    }
    case "fish": {
      p.ellipse(cx, by - s * 0.25, s * 0.45, s * 0.16, 0, 0, Math.PI * 2);
      p.moveTo(cx - s * 0.4, by - s * 0.25);
      p.lineTo(cx - s * 0.7, by - s * 0.42);
      p.lineTo(cx - s * 0.7, by - s * 0.08);
      p.closePath();
      ctx.globalAlpha = 0.85;
      fillBody(p);
      ctx.globalAlpha = 1;
      ctx.fillStyle = rgba("#ffffff", 0.35);
      ctx.beginPath();
      ctx.ellipse(cx, by - s * 0.3, s * 0.3, s * 0.04, 0, 0, Math.PI * 2);
      ctx.fill();
      eye(cx + s * 0.3, by - s * 0.28);
      break;
    }
    case "frog": {
      p.ellipse(cx, by - s * 0.22, s * 0.34, s * 0.22, 0, 0, Math.PI * 2);
      p.ellipse(cx + s * 0.12, by - s * 0.42, s * 0.1, s * 0.1, 0, 0, Math.PI * 2);
      p.ellipse(cx - s * 0.12, by - s * 0.42, s * 0.1, s * 0.1, 0, 0, Math.PI * 2);
      fillBody(p);
      eye(cx + s * 0.13, by - s * 0.44);
      eye(cx - s * 0.11, by - s * 0.44);
      break;
    }
    case "lizard": {
      ctx.strokeStyle = body;
      ctx.lineWidth = s * 0.08;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.2, by - s * 0.15);
      ctx.quadraticCurveTo(cx - s * 0.6, by - s * 0.05, cx - s * 0.9, by - s * 0.25);
      ctx.stroke();
      p.ellipse(cx, by - s * 0.15, s * 0.32, s * 0.1, 0, 0, Math.PI * 2);
      p.ellipse(cx + s * 0.33, by - s * 0.17, s * 0.1, s * 0.07, 0, 0, Math.PI * 2);
      fillBody(p);
      eye(cx + s * 0.36, by - s * 0.2);
      break;
    }
  }
  const art: ObjectArt = { canvas, anchorX: 0.5, anchorY: 0.8 };
  cache.set(key, art);
  return art;
}

// ---------------------------------------------------------------------------
// Herbs & collectibles on the ground

export function forageArt(herb: HerbDefinition | null, itemId: string, color: string): ObjectArt {
  const key = "forage:" + itemId;
  const hit = cache.get(key);
  if (hit) return hit;
  const W = 72, H = 64;
  const { canvas, ctx } = makeCanvas(W * 2, H * 2);
  ctx.scale(2, 2);
  const rnd = seeded(hashString(itemId));
  const cx = W / 2, by = H - 10;
  shadowEllipse(ctx, cx, by, 22, 6, 0.3);
  const kind = herb?.look.kind ?? "collectible";
  const main = herb?.look.color ?? color;
  const accent = herb?.look.accent ?? shade(color, -0.3);
  ctx.lineCap = "round";
  if (kind === "web") {
    ctx.strokeStyle = "rgba(240,245,250,0.9)";
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, by - 18);
      ctx.lineTo(cx + Math.cos(a) * 18, by - 18 + Math.sin(a) * 14);
      ctx.stroke();
    }
    for (let r = 5; r < 18; r += 4) {
      ctx.beginPath();
      ctx.ellipse(cx, by - 18, r, r * 0.78, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (kind === "collectible") {
    if (itemId === "feather") {
      ctx.fillStyle = main;
      ctx.beginPath();
      ctx.ellipse(cx, by - 10, 18, 5, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = shade(main, -0.4);
      ctx.beginPath();
      ctx.moveTo(cx - 18, by - 2);
      ctx.lineTo(cx + 16, by - 17);
      ctx.stroke();
    } else if (itemId === "moss") {
      for (let i = 0; i < 7; i++) {
        ctx.fillStyle = shade(main, (rnd() - 0.5) * 0.3);
        ctx.beginPath();
        ctx.arc(cx + (rnd() - 0.5) * 24, by - 6 - rnd() * 8, 6 + rnd() * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      const g = ctx.createRadialGradient(cx - 4, by - 12, 1, cx, by - 8, 12);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(1, main);
      ctx.fillStyle = g;
      ctx.beginPath();
      if (itemId === "river_shell") {
        ctx.moveTo(cx - 10, by - 4);
        ctx.quadraticCurveTo(cx, by - 26, cx + 10, by - 4);
        ctx.closePath();
      } else ctx.ellipse(cx, by - 8, 10, 7, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // plant: stems + leaves, with flowers/berries/seeds/stalks on top
    const stems = kind === "stalk" ? 7 : 5;
    for (let i = 0; i < stems; i++) {
      const x = cx + (rnd() - 0.5) * 22, h = 18 + rnd() * 22;
      ctx.strokeStyle = kind === "stalk" ? main : accent;
      ctx.lineWidth = kind === "stalk" ? 3 : 1.6;
      ctx.beginPath();
      ctx.moveTo(x, by);
      ctx.quadraticCurveTo(x + (rnd() - 0.5) * 8, by - h / 2, x + (rnd() - 0.5) * 6, by - h);
      ctx.stroke();
      if (kind === "stalk") {
        for (let k = 1; k < 4; k++) {
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, by - (h * k) / 4);
          ctx.lineTo(x - 5, by - (h * k) / 4 - 4);
          ctx.moveTo(x, by - (h * k) / 4);
          ctx.lineTo(x + 5, by - (h * k) / 4 - 4);
          ctx.stroke();
        }
      }
    }
    const leafCol = kind === "leafy" ? main : accent;
    for (let i = 0; i < (kind === "leafy" ? 9 : 5); i++) {
      const a = -Math.PI / 2 + (rnd() - 0.5) * 2.6;
      const x = cx + Math.cos(a) * 10, y = by - 8 + Math.sin(a) * 8;
      ctx.fillStyle = shade(leafCol, (rnd() - 0.5) * 0.25);
      ctx.beginPath();
      ctx.ellipse(x, y, kind === "leafy" ? 10 : 7, kind === "leafy" ? 5 : 3, a, 0, Math.PI * 2);
      ctx.fill();
    }
    if (kind === "flower" || kind === "leafy" && herb?.look.accent && herb.id === "catmint") {
      for (let i = 0; i < 4; i++) {
        const x = cx + (rnd() - 0.5) * 24, y = by - 22 - rnd() * 14;
        const c = kind === "flower" ? main : accent;
        for (let k = 0; k < 6; k++) {
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.arc(x + Math.cos((k / 6) * 6.28) * 3.2, y + Math.sin((k / 6) * 6.28) * 3.2, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = kind === "flower" ? (herb?.id === "feverfew" ? "#f2c230" : shade(c, -0.3)) : "#fff";
        ctx.beginPath();
        ctx.arc(x, y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (kind === "berries") {
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = shade(main, (rnd() - 0.5) * 0.3);
        ctx.beginPath();
        ctx.arc(cx + (rnd() - 0.5) * 20, by - 16 - rnd() * 12, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (kind === "seeds") {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.ellipse(cx, by - 30, 7, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#4a5a3a";
      ctx.beginPath();
      ctx.ellipse(cx, by - 22, 5, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const art: ObjectArt = { canvas, anchorX: 0.5, anchorY: by / H };
  cache.set(key, art);
  return art;
}

/**
 * Reduce smooth art to a pixel grid: downsample so one output pixel covers
 * `worldPx / displayScale` canvas pixels, and harden alpha for crisp edges.
 * Returns a canvas meant to be displayed at `worldPx` world units per pixel.
 */
export function pixelate(src: HTMLCanvasElement, displayScale: number, worldPx: number): HTMLCanvasElement {
  const factor = worldPx / displayScale; // source canvas pixels per art pixel
  const w = Math.max(1, Math.round(src.width / factor)), h = Math.max(1, Math.round(src.height / factor));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  for (let i = 3; i < data.data.length; i += 4) {
    const a = data.data[i];
    if (a < 110) data.data[i] = 0;
    else {
      // Un-premultiply the darkened edge colour, then make opaque.
      const k = 255 / a;
      data.data[i - 3] = Math.min(255, data.data[i - 3] * (a < 250 ? Math.min(k, 1.25) : 1));
      data.data[i - 2] = Math.min(255, data.data[i - 2] * (a < 250 ? Math.min(k, 1.25) : 1));
      data.data[i - 1] = Math.min(255, data.data[i - 1] * (a < 250 ? Math.min(k, 1.25) : 1));
      data.data[i] = 255;
    }
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

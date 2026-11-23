/**
 * Procedural illustrated art for world objects, prey and forage.
 * Every texture is returned with an anchor (fraction of width/height) that sits
 * on the object's world position, so depth-sorting by y works naturally.
 * To add an object kind, add a case in drawObject() and reference it from the map.
 */
import type { Season, PreyDefinition, HerbDefinition } from "@catgen/shared";
import { makeCanvas, seeded, shade, mix, rgba, hashString } from "./color.ts";

export interface ObjectArt {
  canvas: HTMLCanvasElement;
  anchorX: number;
  anchorY: number;
  /** For trees: canopy region (relative to anchor, px) used for see-through fading. */
  canopy?: { x: number; y: number; w: number; h: number };
}

type Ctx = CanvasRenderingContext2D;

/** Smooth organic closed shape (Catmull-Rom through jittered radial points). */
function blob(ctx: Ctx, x: number, y: number, r: number, rnd: () => number, points = 9, jag = 0.25) {
  const pts: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const rr = r * (1 - jag / 2 + rnd() * jag);
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.9]);
  }
  ctx.beginPath();
  for (let i = 0; i < points; i++) {
    const p0 = pts[(i - 1 + points) % points], p1 = pts[i], p2 = pts[(i + 1) % points], p3 = pts[(i + 2) % points];
    if (i === 0) ctx.moveTo(p1[0], p1[1]);
    ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  ctx.closePath();
}

/** A natural-looking stone: smooth blob, gradient, speckles, cracks, moss/snow. */
function stone(ctx: Ctx, cx: number, by: number, w: number, h: number, base: string, rnd: () => number, snow: boolean, moss: boolean) {
  ctx.save();
  ctx.translate(cx, by - h / 2);
  ctx.scale(1, h / w);
  blob(ctx, 0, 0, w / 2, rnd, 8, 0.22);
  ctx.restore();
  ctx.save();
  const g = ctx.createLinearGradient(cx - w / 2, by - h, cx + w / 3, by);
  g.addColorStop(0, shade(base, 0.32));
  g.addColorStop(0.45, base);
  g.addColorStop(1, shade(base, -0.5));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  // speckles
  for (let i = 0; i < (w * h) / 40; i++) {
    ctx.fillStyle = rgba(rnd() < 0.5 ? "#ffffff" : "#000000", 0.06 + rnd() * 0.06);
    ctx.fillRect(cx - w / 2 + rnd() * w, by - h + rnd() * h, 2, 2);
  }
  // facets
  ctx.fillStyle = rgba("#ffffff", 0.08);
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.4, by - h * 0.55);
  ctx.lineTo(cx - w * 0.05, by - h * 0.95);
  ctx.lineTo(cx + w * 0.15, by - h * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgba("#1a1510", 0.35);
  ctx.lineWidth = Math.max(1.5, w / 90);
  for (let i = 0; i < 3; i++) {
    const x = cx + (rnd() - 0.5) * w * 0.7, y = by - h * (0.3 + rnd() * 0.6);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rnd() - 0.5) * w * 0.15, y + h * 0.15);
    ctx.lineTo(x + (rnd() - 0.5) * w * 0.2, y + h * 0.3);
    ctx.stroke();
  }
  if (snow || moss) {
    ctx.fillStyle = snow ? "rgba(246,249,252,0.95)" : rgba("#6a8a3a", 0.6);
    ctx.save();
    ctx.translate(cx - w * 0.05, by - h * 0.92);
    ctx.scale(1, 0.3);
    blob(ctx, 0, 0, w * 0.32, rnd, 7, 0.4);
    ctx.restore();
    ctx.fill();
  }
  ctx.restore();
}

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

function leafColors(season: Season, kind: "oak" | "birch" | "willow"): string[] | null {
  if (season === "leafbare") return null;
  if (season === "leaffall") return kind === "birch" ? ["#d9a62b", "#e8c050", "#b5822a"] : ["#c9632c", "#d98a2b", "#a8402a", "#8a5a2a"];
  if (season === "newleaf") return ["#7fbf4a", "#9ad15a", "#5f9a3a", "#b0dc7a"];
  return kind === "willow" ? ["#6f9a3a", "#86ad4a", "#5a7f30"] : ["#4f7f2d", "#5f9a3a", "#3d6b24", "#76ab45"];
}

function canopy(ctx: Ctx, cx: number, cy: number, r: number, colors: string[], rnd: () => number, snow: boolean) {
  // Dark under-layer, then lit clumps, then highlights.
  ctx.fillStyle = shade(colors[2] ?? colors[0], -0.35);
  blob(ctx, cx, cy + r * 0.12, r, rnd, 11, 0.3);
  ctx.fill();
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * r * 0.62;
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.85 - r * 0.06;
    const rr = r * (0.3 + rnd() * 0.25);
    const col = colors[Math.floor(rnd() * colors.length)];
    const g = ctx.createRadialGradient(x - rr * 0.35, y - rr * 0.4, rr * 0.1, x, y, rr);
    g.addColorStop(0, shade(col, 0.22));
    g.addColorStop(0.7, col);
    g.addColorStop(1, shade(col, -0.25));
    ctx.fillStyle = g;
    blob(ctx, x, y, rr, rnd, 8, 0.35);
    ctx.fill();
  }
  // leaf flecks
  for (let i = 0; i < 90; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * r * 0.9;
    ctx.fillStyle = rgba(rnd() < 0.6 ? "#ffffff" : "#000000", 0.08 + rnd() * 0.08);
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.85, 3, 1.8, rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  if (snow) {
    for (let i = 0; i < 9; i++) {
      const x = cx + (rnd() - 0.5) * r * 1.3, y = cy - r * 0.4 + rnd() * r * 0.5;
      ctx.fillStyle = "rgba(245,248,252,0.9)";
      blob(ctx, x, y, r * (0.12 + rnd() * 0.1), rnd, 7, 0.3);
      ctx.fill();
    }
  }
}

function trunk(ctx: Ctx, x: number, baseY: number, w: number, h: number, col: string, rnd: () => number, birch = false) {
  const g = ctx.createLinearGradient(x - w, 0, x + w, 0);
  g.addColorStop(0, shade(col, 0.15));
  g.addColorStop(0.6, col);
  g.addColorStop(1, shade(col, -0.4));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - w * 1.5, baseY);
  ctx.quadraticCurveTo(x - w * 0.8, baseY - h * 0.15, x - w * 0.55, baseY - h);
  ctx.lineTo(x + w * 0.55, baseY - h);
  ctx.quadraticCurveTo(x + w * 0.8, baseY - h * 0.15, x + w * 1.5, baseY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = birch ? "rgba(30,30,30,0.7)" : rgba(shade(col, -0.5), 0.6);
  ctx.lineWidth = birch ? 2 : 1.4;
  for (let i = 0; i < (birch ? 10 : 7); i++) {
    const yy = baseY - rnd() * h;
    const xx = x + (rnd() - 0.5) * w;
    ctx.beginPath();
    if (birch) { ctx.moveTo(xx - 4, yy); ctx.lineTo(xx + 5, yy + 1); }
    else { ctx.moveTo(xx, yy); ctx.lineTo(xx + (rnd() - 0.5) * 3, yy - 10 - rnd() * 14); }
    ctx.stroke();
  }
}

function bareBranches(ctx: Ctx, x: number, y: number, len: number, angle: number, depth: number, col: string, rnd: () => number, snow: boolean) {
  if (depth <= 0) return;
  const x2 = x + Math.cos(angle) * len, y2 = y + Math.sin(angle) * len;
  ctx.strokeStyle = col;
  ctx.lineWidth = depth * 1.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  if (snow && depth > 1) {
    ctx.strokeStyle = "rgba(245,248,252,0.85)";
    ctx.lineWidth = depth * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y - depth * 0.6);
    ctx.lineTo(x2, y2 - depth * 0.6);
    ctx.stroke();
  }
  for (let i = 0; i < 2; i++) bareBranches(ctx, x2, y2, len * (0.62 + rnd() * 0.15), angle + (i ? 0.45 : -0.45) + (rnd() - 0.5) * 0.4, depth - 1, col, rnd, snow);
}

const cache = new Map<string, ObjectArt>();

export function objectArt(kind: string, variant: number, season: Season): ObjectArt {
  const key = `${kind}:${variant}:${season}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const art = drawObject(kind, variant, season);
  cache.set(key, art);
  return art;
}

export function clearObjectArt() {
  cache.clear();
}

function drawObject(kind: string, variant: number, season: Season): ObjectArt {
  const rnd = seeded(hashString(kind + variant + season));
  const snow = season === "leafbare";
  const mk = (w: number, h: number, ax: number, ay: number) => {
    const { canvas, ctx } = makeCanvas(w, h);
    return { canvas, ctx, art: { canvas, anchorX: ax / w, anchorY: ay / h } as ObjectArt };
  };
  switch (kind) {
    case "tree_oak":
    case "tree_great_oak":
    case "tree_birch":
    case "tree_willow": {
      const great = kind === "tree_great_oak";
      const W = great ? 520 : 340, H = great ? 600 : 420;
      const { ctx, art } = mk(W, H, W / 2, H - 30);
      const bx = W / 2, by = H - 30;
      shadowEllipse(ctx, bx + 10, by, W * 0.34, 34, 0.35);
      const tk = kind === "tree_birch" ? "#e8e4da" : great ? "#5a4530" : "#6b5038";
      const tw = great ? 34 : kind === "tree_birch" ? 13 : 20;
      const th = great ? H * 0.55 : H * 0.5;
      trunk(ctx, bx, by, tw, th, tk, rnd, kind === "tree_birch");
      // roots
      ctx.strokeStyle = shade(tk, -0.15);
      ctx.lineWidth = great ? 12 : 7;
      ctx.lineCap = "round";
      for (const d of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(bx + d * tw * 0.8, by - 6);
        ctx.quadraticCurveTo(bx + d * tw * 1.8, by - 2, bx + d * tw * 2.6, by + 4);
        ctx.stroke();
      }
      const colors = leafColors(season, kind === "tree_birch" ? "birch" : kind === "tree_willow" ? "willow" : "oak");
      const r = great ? 220 : kind === "tree_birch" ? 105 : 140;
      const cy = by - th - r * 0.35;
      if (colors) {
        if (kind === "tree_willow") {
          canopy(ctx, bx, cy, r * 0.9, colors, rnd, false);
          ctx.strokeStyle = colors[0];
          ctx.lineWidth = 3;
          for (let i = 0; i < 46; i++) {
            const x = bx + (rnd() - 0.5) * r * 1.7;
            ctx.strokeStyle = colors[Math.floor(rnd() * colors.length)];
            ctx.beginPath();
            ctx.moveTo(x, cy);
            ctx.quadraticCurveTo(x + 6, cy + r * 0.6, x + (rnd() - 0.5) * 10, cy + r * (0.8 + rnd() * 0.5));
            ctx.stroke();
          }
        } else canopy(ctx, bx, cy, r, colors, rnd, false);
      } else {
        for (let i = 0; i < 5; i++) bareBranches(ctx, bx, by - th, r * 0.45, -Math.PI / 2 + (i - 2) * 0.42, 5, shade(tk, kind === "tree_birch" ? -0.1 : 0), rnd, true);
      }
      art.canopy = { x: -r, y: cy - by - r, w: r * 2, h: r * 2 };
      return art;
    }
    case "tree_pine": {
      const W = 260, H = 480;
      const { ctx, art } = mk(W, H, W / 2, H - 24);
      const bx = W / 2, by = H - 24;
      shadowEllipse(ctx, bx + 8, by, 90, 26, 0.35);
      trunk(ctx, bx, by, 13, 120, "#5a4030", rnd);
      const green = season === "newleaf" ? "#3f7a45" : season === "leaffall" ? "#3a6640" : "#2f5f3a";
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const y = by - 70 - t * 330;
        const w = 115 * (1 - t * 0.78);
        const g = ctx.createLinearGradient(bx - w, 0, bx + w, 0);
        g.addColorStop(0, shade(green, 0.18));
        g.addColorStop(0.55, green);
        g.addColorStop(1, shade(green, -0.4));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(bx - w, y);
        for (let k = 0; k <= 8; k++) {
          const xx = bx - w + (k / 8) * w * 2;
          ctx.lineTo(xx, y + (k % 2 ? 6 : -2) + rnd() * 4);
        }
        ctx.lineTo(bx + w * 0.1, y - 95);
        ctx.lineTo(bx - w * 0.1, y - 95);
        ctx.closePath();
        ctx.fill();
        if (snow) {
          ctx.fillStyle = "rgba(245,248,252,0.88)";
          ctx.beginPath();
          ctx.moveTo(bx - w * 0.75, y - 10);
          ctx.quadraticCurveTo(bx, y - 35, bx + w * 0.55, y - 12);
          ctx.quadraticCurveTo(bx, y - 22, bx - w * 0.75, y - 10);
          ctx.fill();
        }
      }
      art.canopy = { x: -115, y: -440, w: 230, h: 400 };
      return art;
    }
    case "bush":
    case "gorse":
    case "bramble_wall": {
      const W = kind === "bramble_wall" ? 190 : 150, H = kind === "bramble_wall" ? 170 : 120;
      const { ctx, art } = mk(W, H, W / 2, H - 14);
      shadowEllipse(ctx, W / 2, H - 14, W * 0.42, 16);
      const base = kind === "gorse" ? "#4f6a2a" : kind === "bramble_wall" ? "#3f5a2a" : "#4a7a30";
      const cols = season === "leafbare" ? ["#5a5040", "#6a6050", "#4a4535"] : season === "leaffall" && kind === "bush" ? ["#a8602a", "#8a6a2a", "#6a7a30"] : [base, shade(base, 0.15), shade(base, -0.15)];
      canopy(ctx, W / 2, H * 0.52, W * 0.4, cols, rnd, snow);
      if (kind === "gorse" && !snow) for (let i = 0; i < 26; i++) {
        ctx.fillStyle = "#f2c230";
        ctx.beginPath();
        ctx.arc(W / 2 + (rnd() - 0.5) * W * 0.6, H * 0.5 + (rnd() - 0.5) * H * 0.5, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      if (kind === "bramble_wall") {
        ctx.strokeStyle = "#5a3a2a";
        ctx.lineWidth = 2;
        for (let i = 0; i < 10; i++) {
          ctx.beginPath();
          const x = W * 0.2 + rnd() * W * 0.6, y = H * 0.3 + rnd() * H * 0.4;
          ctx.moveTo(x, y);
          ctx.bezierCurveTo(x + 20, y - 25, x + 40, y + 10, x + 30 + rnd() * 20, y + 20);
          ctx.stroke();
        }
        if (season !== "leafbare") for (let i = 0; i < 8; i++) {
          ctx.fillStyle = season === "greenleaf" || season === "leaffall" ? "#3a1a3a" : "#f5f0e6";
          ctx.beginPath();
          ctx.arc(W * 0.2 + rnd() * W * 0.6, H * 0.3 + rnd() * H * 0.4, 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      return art;
    }
    case "fern":
    case "tall_grass":
    case "reeds":
    case "heather": {
      const W = 120, H = kind === "reeds" ? 160 : 110;
      const { ctx, art } = mk(W, H, W / 2, H - 8);
      const col = kind === "fern" ? (season === "leaffall" ? "#a8702a" : season === "leafbare" ? "#7a6a4a" : "#4f8a35")
        : kind === "heather" ? (snow ? "#7a7068" : "#7a5a7a") : kind === "reeds" ? (snow ? "#a89a7a" : "#7a8a45") : (snow ? "#b5ab8a" : season === "leaffall" ? "#b0a050" : "#7aa045");
      ctx.lineCap = "round";
      const n = kind === "fern" ? 9 : kind === "heather" ? 26 : 22;
      for (let i = 0; i < n; i++) {
        const x = W / 2 + (rnd() - 0.5) * (kind === "fern" ? 10 : 50);
        const len = (kind === "reeds" ? 120 : kind === "fern" ? 70 : 55) * (0.6 + rnd() * 0.5);
        const ang = -Math.PI / 2 + (rnd() - 0.5) * (kind === "fern" ? 2.4 : 0.8);
        const ex = x + Math.cos(ang) * len, ey = H - 8 + Math.sin(ang) * len;
        ctx.strokeStyle = shade(col, (rnd() - 0.5) * 0.35);
        ctx.lineWidth = kind === "fern" ? 2.5 : kind === "reeds" ? 3 : 2;
        ctx.beginPath();
        ctx.moveTo(x, H - 8);
        ctx.quadraticCurveTo(x + (ex - x) * 0.3, ey + (H - 8 - ey) * 0.2, ex, ey);
        ctx.stroke();
        if (kind === "fern") {
          for (let k = 1; k < 10; k++) {
            const t = k / 10;
            const px = x + (ex - x) * t, py = H - 8 + (ey - (H - 8)) * t;
            const l = 14 * (1 - t * 0.8);
            ctx.lineWidth = 3.2;
            for (const d of [-1, 1]) {
              ctx.beginPath();
              ctx.moveTo(px, py);
              ctx.lineTo(px + Math.cos(ang + d * 1.2) * l, py + Math.sin(ang + d * 1.2) * l);
              ctx.stroke();
            }
          }
        }
        if (kind === "reeds" && rnd() < 0.4) {
          ctx.strokeStyle = "#6b4a2a";
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.moveTo(ex, ey + 4);
          ctx.lineTo(ex, ey + 18);
          ctx.stroke();
        }
        if (kind === "heather" && !snow) {
          ctx.fillStyle = "#b07ac0";
          ctx.beginPath();
          ctx.arc(ex, ey, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      return art;
    }
    case "flowers": {
      const W = 90, H = 60;
      const { ctx, art } = mk(W, H, W / 2, H - 10);
      if (snow) return art;
      const palette = season === "leaffall" ? ["#e0a030", "#c9632c"] : ["#f5f0d8", "#f2d13a", "#c9a6d9", "#e88aa0", "#7fa0e0"];
      for (let i = 0; i < 9; i++) {
        const x = 12 + rnd() * (W - 24), y = 14 + rnd() * (H - 26);
        ctx.strokeStyle = "#5a8a3a";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 10);
        ctx.stroke();
        const c = palette[Math.floor(rnd() * palette.length)];
        for (let k = 0; k < 5; k++) {
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.arc(x + Math.cos((k / 5) * 6.28) * 3, y + Math.sin((k / 5) * 6.28) * 3, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "#f2c230";
        ctx.beginPath();
        ctx.arc(x, y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      return art;
    }
    case "lilypad": {
      const { ctx, art } = mk(80, 50, 40, 25);
      for (let i = 0; i < 3; i++) {
        const x = 20 + rnd() * 40, y = 14 + rnd() * 22;
        ctx.fillStyle = snow ? "#9ab0a8" : "#4f8a3a";
        ctx.beginPath();
        ctx.ellipse(x, y, 12, 7, 0, 0.3, Math.PI * 2);
        ctx.lineTo(x, y);
        ctx.fill();
        if (season === "greenleaf" && i === 0) {
          ctx.fillStyle = "#f2c0d8";
          ctx.beginPath();
          ctx.arc(x + 3, y - 2, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      return art;
    }
    case "rock_small":
    case "pebbles":
    case "stepping_stone":
    case "boulder":
    case "great_rock":
    case "highrock":
    case "tallrock":
    case "sky_rock":
    case "stalagmite":
    case "crystal": {
      const size = { rock_small: 60, pebbles: 70, stepping_stone: 70, boulder: 150, great_rock: 300, highrock: 260, tallrock: 230, sky_rock: 240, stalagmite: 90, crystal: 70 }[kind]!;
      const tall = kind === "highrock" || kind === "tallrock" || kind === "sky_rock" || kind === "stalagmite";
      const W = size * 1.4, H = tall ? size * 1.5 : size;
      const { ctx, art } = mk(W, H, W / 2, H - size * 0.12);
      const by = H - size * 0.12;
      shadowEllipse(ctx, W / 2 + 6, by, size * 0.62, size * 0.16, 0.4);
      if (kind === "crystal") {
        for (let i = 0; i < 5; i++) {
          const x = W / 2 + (i - 2) * 9, h = 25 + rnd() * 30;
          const g = ctx.createLinearGradient(x - 6, 0, x + 6, 0);
          g.addColorStop(0, "#d8e8ff");
          g.addColorStop(1, "#6a8acc");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(x - 6, by);
          ctx.lineTo(x - 4, by - h);
          ctx.lineTo(x, by - h - 8);
          ctx.lineTo(x + 4, by - h);
          ctx.lineTo(x + 6, by);
          ctx.fill();
        }
        return art;
      }
      if (kind === "pebbles") {
        for (let i = 0; i < 9; i++) {
          const x = 14 + rnd() * (W - 28), y = by - rnd() * 24, r = 4 + rnd() * 6;
          ctx.fillStyle = mix("#8a8378", "#b5ab9a", rnd());
          ctx.beginPath();
          ctx.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        return art;
      }
      const base = kind === "great_rock" || kind === "highrock" ? "#8a8278" : kind === "sky_rock" ? "#9a9488" : "#8f8a80";
      const w = size * 1.05, h = tall ? size * 1.05 : size * 0.6;
      if (kind === "great_rock" || kind === "highrock" || kind === "sky_rock" || kind === "tallrock") {
        // Clustered boulders for big landmark rocks.
        stone(ctx, W / 2 - w * 0.28, by + 2, w * 0.55, h * 0.55, shade(base, -0.05), rnd, snow, true);
        stone(ctx, W / 2 + w * 0.3, by + 4, w * 0.45, h * 0.45, shade(base, 0.04), rnd, snow, false);
        stone(ctx, W / 2, by, w * 0.7, h, base, rnd, snow, true);
      } else {
        stone(ctx, W / 2, by, w, h, base, rnd, snow, kind === "boulder");
      }
      return art;
    }
    case "log": {
      const { ctx, art } = mk(220, 90, 110, 70);
      shadowEllipse(ctx, 112, 72, 100, 14, 0.35);
      const g = ctx.createLinearGradient(0, 20, 0, 70);
      g.addColorStop(0, "#8a6a4a");
      g.addColorStop(1, "#4a3525");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(15, 26, 185, 42, 20);
      ctx.fill();
      ctx.fillStyle = "#c9a878";
      ctx.beginPath();
      ctx.ellipse(196, 47, 12, 21, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#8a6a4a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(196, 47, 6, 12, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = snow ? "rgba(245,248,252,0.9)" : rgba("#5f8a3a", 0.7);
      ctx.beginPath();
      ctx.ellipse(90, 28, 60, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      return art;
    }
    case "den": {
      // variant: 0 warriors, 1 apprentices, 2 nursery, 3 elders, 4 medicine
      const W = 260, H = 200;
      const { ctx, art } = mk(W, H, W / 2, H - 30);
      const by = H - 30;
      shadowEllipse(ctx, W / 2, by, 120, 28, 0.4);
      if (variant === 4) {
        // Rock cave with a fern curtain.
        const g = ctx.createLinearGradient(0, by - 150, 0, by);
        g.addColorStop(0, "#9a9488");
        g.addColorStop(1, "#5a554d");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(20, by);
        ctx.quadraticCurveTo(20, by - 160, W / 2, by - 160);
        ctx.quadraticCurveTo(W - 20, by - 160, W - 20, by);
        ctx.fill();
        ctx.fillStyle = "#2a2420";
        ctx.beginPath();
        ctx.ellipse(W / 2, by - 10, 50, 60, 0, Math.PI, 0);
        ctx.fill();
        for (let i = 0; i < 6; i++) {
          ctx.strokeStyle = snow ? "#9a9a8a" : "#4f8a35";
          ctx.lineWidth = 3;
          ctx.beginPath();
          const x = W / 2 - 45 + i * 18;
          ctx.moveTo(x, by - 70);
          ctx.quadraticCurveTo(x + 8, by - 35, x + 2, by - 5);
          ctx.stroke();
        }
        // herb bundles
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = ["#8fbf8a", "#f2c230", "#e8eef2"][i];
          ctx.beginPath();
          ctx.ellipse(W / 2 + 70 + i * 12, by - 8, 8, 5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        return art;
      }
      const cols = variant === 3 ? ["#6b5038", "#7a5a40"] : ["#3f5a2a", "#4f6a35", "#5a7a3a"];
      if (variant === 3) {
        // fallen tree
        ctx.fillStyle = "#6b5038";
        ctx.beginPath();
        ctx.roundRect(10, by - 70, 240, 55, 25);
        ctx.fill();
        canopy(ctx, W / 2 + 40, by - 70, 55, season === "leafbare" ? ["#5a5040", "#6a6050"] : ["#4f7a2d", "#5f9a3a"], rnd, snow);
      } else {
        canopy(ctx, W / 2, by - 70, variant === 2 ? 110 : 100, season === "leafbare" ? ["#5a5040", "#6a6050", "#4a4535"] : cols, rnd, snow);
      }
      ctx.fillStyle = "rgba(25,20,15,0.85)";
      ctx.beginPath();
      ctx.ellipse(W / 2 + 5, by - 18, 38, 34, 0, Math.PI, 0);
      ctx.fill();
      return art;
    }
    case "pine_stump":
    case "reed_mound": {
      const { ctx, art } = mk(220, 200, 110, 170);
      shadowEllipse(ctx, 112, 172, 95, 22, 0.4);
      if (kind === "pine_stump") {
        const g = ctx.createLinearGradient(40, 0, 180, 0);
        g.addColorStop(0, "#8a6a4a");
        g.addColorStop(1, "#4a3525");
        ctx.fillStyle = g;
        ctx.fillRect(45, 70, 130, 100);
        ctx.fillStyle = "#c9a878";
        ctx.beginPath();
        ctx.ellipse(110, 70, 65, 22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#8a6a4a";
        for (let r = 10; r < 60; r += 12) {
          ctx.beginPath();
          ctx.ellipse(110, 70, r, r * 0.33, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = "#6a6a3a";
        ctx.beginPath();
        ctx.ellipse(110, 150, 90, 40, 0, 0, Math.PI * 2);
        ctx.fill();
        for (let i = 0; i < 40; i++) {
          ctx.strokeStyle = shade(snow ? "#a89a7a" : "#8a9a4a", (rnd() - 0.5) * 0.4);
          ctx.lineWidth = 3;
          const x = 30 + rnd() * 160;
          ctx.beginPath();
          ctx.moveTo(x, 160);
          ctx.lineTo(x + (rnd() - 0.5) * 20, 50 + rnd() * 50);
          ctx.stroke();
        }
      }
      return art;
    }
    case "fresh_kill_pile": {
      const { ctx, art } = mk(120, 70, 60, 52);
      shadowEllipse(ctx, 60, 54, 50, 12, 0.3);
      ctx.fillStyle = "#6b5a3a";
      ctx.beginPath();
      ctx.ellipse(60, 50, 48, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      return art;
    }
    default: {
      const { ctx, art } = mk(60, 60, 30, 50);
      ctx.fillStyle = "#888";
      ctx.beginPath();
      ctx.arc(30, 35, 15, 0, Math.PI * 2);
      ctx.fill();
      return art;
    }
  }
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

/**
 * Procedural, seamless, painterly terrain textures (512x512) and the chunk
 * painter that blends neighbouring terrain types with soft, noisy edges.
 */
import { TERRAIN, TERRAIN_ORDER, type TerrainId, type Season, type WorldMap } from "@catgen/shared";
import { makeCanvas, seeded, shade, mix, rgba, hashString } from "./color.ts";

export const TEX_SIZE = 512;

/** Draw order priority: higher terrain paints over lower at borders. */
const PRIORITY: Record<TerrainId, number> = {
  deep_water: 0, shallow_water: 1, sand: 2, marsh: 3, grass: 4, moor: 5, forest_floor: 6, pine_floor: 7, camp_ground: 8, rock: 9, cave_floor: 10, cliff: 11,
};

function seasonal(color: string, season: Season, terrain: TerrainId): string {
  const greenish = ["grass", "forest_floor", "moor", "marsh", "pine_floor"].includes(terrain);
  if (!greenish) return color;
  switch (season) {
    case "newleaf": return mix(color, "#8fd16a", 0.12);
    case "greenleaf": return color;
    case "leaffall": return mix(color, terrain === "pine_floor" ? "#7a5a3a" : "#b5823a", 0.35);
    case "leafbare": return mix(color, "#9aa39a", 0.45);
  }
}

/** Draw something with wrap-around so the texture tiles seamlessly. */
function wrapDraw(size: number, x: number, y: number, r: number, fn: (x: number, y: number) => void) {
  for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
    const px = x + ox, py = y + oy;
    if (px + r < 0 || py + r < 0 || px - r > size || py - r > size) continue;
    fn(px, py);
  }
}

/** Periodic value noise so the base layer tiles seamlessly. */
function periodicNoise(seed: number, period: number) {
  const rnd = seeded(seed);
  const grid = Array.from({ length: period * period }, () => rnd());
  const at = (x: number, y: number) => grid[((y % period) + period) % period * period + (((x % period) + period) % period)];
  return (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

export function makeTerrainTexture(id: TerrainId, season: Season): HTMLCanvasElement {
  const S = TEX_SIZE;
  const { canvas, ctx } = makeCanvas(S, S);
  const def = TERRAIN[id];
  const pal = def.palette.map((c) => seasonal(c, season, id));
  const rnd = seeded(hashString(id + season));

  // 1. Mottled base from layered periodic noise.
  const n1 = periodicNoise(hashString(id) + 1, 8);
  const n2 = periodicNoise(hashString(id) + 2, 32);
  const img = ctx.createImageData(S, S);
  const c0 = hex(pal[0]), c1 = hex(pal[1]), c2 = hex(pal[2]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const a = n1((x / S) * 8, (y / S) * 8);
    const b = n2((x / S) * 32, (y / S) * 32);
    const t = a * 0.7 + b * 0.3;
    const lo = t < 0.5 ? c2 : c0;
    const hi = t < 0.5 ? c0 : c1;
    const k = t < 0.5 ? t * 2 : (t - 0.5) * 2;
    const i = (y * S + x) * 4;
    img.data[i] = lo[0] + (hi[0] - lo[0]) * k;
    img.data[i + 1] = lo[1] + (hi[1] - lo[1]) * k;
    img.data[i + 2] = lo[2] + (hi[2] - lo[2]) * k;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  // 2. Detail strokes per terrain type.
  const strokes = (n: number, draw: (x: number, y: number, i: number) => void) => {
    for (let i = 0; i < n; i++) {
      const x = rnd() * S, y = rnd() * S;
      draw(x, y, i);
    }
  };
  ctx.lineCap = "round";
  switch (id) {
    case "grass":
    case "moor":
    case "marsh": {
      const blade = id === "moor" ? 9 : id === "marsh" ? 13 : 10;
      strokes(id === "marsh" ? 2600 : 4200, (x, y) => {
        const col = pal[Math.floor(rnd() * pal.length)];
        const len = blade * (0.5 + rnd());
        const lean = (rnd() - 0.5) * 6;
        ctx.strokeStyle = rnd() < 0.3 ? shade(col, 0.15) : shade(col, -0.1);
        ctx.lineWidth = 1.2 + rnd() * 1.2;
        wrapDraw(S, x, y, 20, (px, py) => {
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.quadraticCurveTo(px + lean * 0.3, py - len * 0.6, px + lean, py - len);
          ctx.stroke();
        });
      });
      if (id === "moor") strokes(220, (x, y) => { // heather dots
        ctx.fillStyle = rgba(season === "leafbare" ? "#8a8a8a" : "#9a6aa8", 0.6);
        wrapDraw(S, x, y, 4, (px, py) => { ctx.beginPath(); ctx.arc(px, py, 1.6 + rnd() * 1.5, 0, Math.PI * 2); ctx.fill(); });
      });
      if (id === "marsh") strokes(30, (x, y) => { // small puddles
        ctx.fillStyle = rgba("#3f6a7a", 0.45);
        wrapDraw(S, x, y, 30, (px, py) => { ctx.beginPath(); ctx.ellipse(px, py, 10 + rnd() * 18, 5 + rnd() * 8, rnd(), 0, Math.PI * 2); ctx.fill(); });
      });
      if (id === "grass" && season !== "leafbare") strokes(90, (x, y) => { // tiny flowers
        ctx.fillStyle = ["#f5f0d8", "#f2d13a", "#c9a6d9"][Math.floor(rnd() * 3)];
        wrapDraw(S, x, y, 4, (px, py) => { ctx.beginPath(); ctx.arc(px, py, 1.8, 0, Math.PI * 2); ctx.fill(); });
      });
      break;
    }
    case "forest_floor":
    case "pine_floor": {
      // Leaf litter / needles + moss.
      strokes(id === "pine_floor" ? 3800 : 1500, (x, y) => {
        const col = id === "pine_floor" ? mix(pal[1], "#3a2c1f", rnd() * 0.5) : seasonal(["#6b5a2e", "#8a6a35", "#5d6b30", "#7a4a25"][Math.floor(rnd() * 4)], season, "grass");
        ctx.fillStyle = col;
        ctx.strokeStyle = col;
        wrapDraw(S, x, y, 10, (px, py) => {
          if (id === "pine_floor") {
            ctx.lineWidth = 1;
            const a = rnd() * Math.PI;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px + Math.cos(a) * 7, py + Math.sin(a) * 7);
            ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.ellipse(px, py, 3 + rnd() * 3, 1.8 + rnd() * 1.5, rnd() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
          }
        });
      });
      strokes(40, (x, y) => {
        ctx.fillStyle = rgba(seasonal("#5d8a3a", season, "grass"), 0.5);
        wrapDraw(S, x, y, 30, (px, py) => { ctx.beginPath(); ctx.ellipse(px, py, 8 + rnd() * 20, 6 + rnd() * 12, rnd(), 0, Math.PI * 2); ctx.fill(); });
      });
      break;
    }
    case "sand":
    case "camp_ground": {
      strokes(id === "sand" ? 3000 : 1800, (x, y) => {
        ctx.fillStyle = rgba(rnd() < 0.5 ? "#ffffff" : "#000000", 0.08);
        wrapDraw(S, x, y, 3, (px, py) => ctx.fillRect(px, py, 1.5, 1.5));
      });
      strokes(id === "sand" ? 60 : 120, (x, y) => {
        const col = mix(pal[Math.floor(rnd() * pal.length)], "#777777", 0.3);
        wrapDraw(S, x, y, 8, (px, py) => pebble(ctx, px, py, 2 + rnd() * 4, col));
      });
      if (id === "camp_ground") strokes(500, (x, y) => {
        ctx.strokeStyle = rgba("#5d5a30", 0.4);
        ctx.lineWidth = 1;
        wrapDraw(S, x, y, 8, (px, py) => { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 2, py - 6); ctx.stroke(); });
      });
      break;
    }
    case "rock":
    case "cliff":
    case "cave_floor": {
      // Irregular stones and soft tonal patches with a few cracks.
      strokes(id === "cliff" ? 70 : 55, (x, y) => {
        const r = 18 + rnd() * 46;
        const col = pal[Math.floor(rnd() * pal.length)];
        const pts = Array.from({ length: 7 }, (_, k) => {
          const a = (k / 7) * Math.PI * 2;
          const rr = r * (0.65 + rnd() * 0.5);
          return [Math.cos(a) * rr, Math.sin(a) * rr * 0.7] as const;
        });
        wrapDraw(S, x, y, r + 4, (px, py) => {
          ctx.fillStyle = rgba(shade(col, (rnd() - 0.5) * 0.25), 0.28);
          ctx.beginPath();
          pts.forEach(([ax, ay], k) => (k ? ctx.lineTo(px + ax, py + ay) : ctx.moveTo(px + ax, py + ay)));
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = rgba("#ffffff", 0.07);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(px + pts[4][0], py + pts[4][1]);
          ctx.lineTo(px + pts[5][0], py + pts[5][1]);
          ctx.stroke();
        });
      });
      strokes(id === "cliff" ? 40 : 22, (x, y) => {
        ctx.strokeStyle = rgba("#000000", id === "cliff" ? 0.3 : 0.18);
        ctx.lineWidth = 1 + rnd();
        wrapDraw(S, x, y, 40, (px, py) => {
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.quadraticCurveTo(px + (rnd() - 0.5) * 20, py + 10, px + (rnd() - 0.5) * 25, py + 18 + rnd() * 16);
          ctx.stroke();
        });
      });
      if (id === "cliff") {
        // Vertical striations give a sense of height.
        strokes(160, (x, y) => {
          ctx.strokeStyle = rgba(rnd() < 0.5 ? "#000000" : "#ffffff", 0.12);
          ctx.lineWidth = 2 + rnd() * 3;
          wrapDraw(S, x, y, 60, (px, py) => { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + (rnd() - 0.5) * 4, py + 30 + rnd() * 30); ctx.stroke(); });
        });
      }
      if (id === "rock") strokes(30, (x, y) => {
        ctx.fillStyle = rgba(seasonal("#6f8a45", season, "grass"), 0.55);
        wrapDraw(S, x, y, 12, (px, py) => { ctx.beginPath(); ctx.ellipse(px, py, 4 + rnd() * 8, 3 + rnd() * 4, 0, 0, Math.PI * 2); ctx.fill(); });
      });
      break;
    }
    case "shallow_water":
    case "deep_water": {
      strokes(id === "deep_water" ? 260 : 200, (x, y) => {
        ctx.strokeStyle = rgba("#ffffff", 0.06 + rnd() * 0.1);
        ctx.lineWidth = 1.5 + rnd() * 2;
        const w = 20 + rnd() * 50;
        wrapDraw(S, x, y, 80, (px, py) => { ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + w / 2, py - 4, px + w, py); ctx.stroke(); });
      });
      if (id === "shallow_water") strokes(120, (x, y) => {
        wrapDraw(S, x, y, 10, (px, py) => pebble(ctx, px, py, 3 + rnd() * 5, rgba("#8a7a5a", 0.45)));
      });
      break;
    }
  }

  // 3. Seasonal overlay: snow in leaf-bare, fallen leaves in leaf-fall.
  if (season === "leafbare" && !["shallow_water", "deep_water", "cave_floor"].includes(id)) {
    const n3 = periodicNoise(hashString(id) + 9, 16);
    const snow = ctx.getImageData(0, 0, S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const v = n3((x / S) * 16, (y / S) * 16);
      const t = Math.max(0, Math.min(1, (v - 0.35) * 3));
      const i = (y * S + x) * 4;
      snow.data[i] += (238 - snow.data[i]) * t;
      snow.data[i + 1] += (242 - snow.data[i + 1]) * t;
      snow.data[i + 2] += (248 - snow.data[i + 2]) * t;
    }
    ctx.putImageData(snow, 0, 0);
  }
  if (season === "leaffall" && ["grass", "forest_floor", "camp_ground"].includes(id)) {
    strokes(id === "forest_floor" ? 900 : 250, (x, y) => {
      ctx.fillStyle = ["#c9632c", "#e0a030", "#a8402a", "#d98a2b"][Math.floor(rnd() * 4)];
      wrapDraw(S, x, y, 8, (px, py) => { ctx.beginPath(); ctx.ellipse(px, py, 3.5, 2, rnd() * Math.PI, 0, Math.PI * 2); ctx.fill(); });
    });
  }
  return canvas;
}

function pebble(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string) {
  ctx.fillStyle = rgba("#000000", 0.18);
  ctx.beginPath();
  ctx.ellipse(x + 1, y + 1.5, r, r * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba("#ffffff", 0.25);
  ctx.beginPath();
  ctx.ellipse(x - r * 0.3, y - r * 0.25, r * 0.4, r * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
}

function hex(c: string): [number, number, number] {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}

// ---------------------------------------------------------------------------
// Chunk painting

/**
 * Soft transition mask for one tile/neighbour pair. The noise is sampled in
 * WORLD coordinates so borders continue smoothly across tile boundaries
 * (no visible tile grid), and reach ~85% into the tile for organic edges.
 */
const worldNoise = periodicNoise(4242, 64);
function edgeMaskWorld(ts: number, gx: number, gy: number, dx: number, dy: number, out: ImageData) {
  const step = 2; // compute at half resolution and fill 2x2 blocks for speed
  for (let y = 0; y < ts; y += step) for (let x = 0; x < ts; x += step) {
    const nx = x / ts, ny = y / ts;
    let d: number;
    if (dx !== 0 && dy !== 0) d = Math.hypot(dx > 0 ? 1 - nx : nx, dy > 0 ? 1 - ny : ny);
    else if (dx !== 0) d = dx > 0 ? 1 - nx : nx;
    else d = dy > 0 ? 1 - ny : ny;
    const wx = gx + nx, wy = gy + ny;
    const n = worldNoise(wx * 1.3, wy * 1.3) * 0.65 + worldNoise(wx * 4.1 + 7, wy * 4.1) * 0.35;
    const wobble = (n - 0.5) * 0.9;
    const a = Math.max(0, Math.min(1, 1 - (d + wobble) / 0.62));
    const v = Math.round(a * a * (3 - 2 * a) * 255);
    for (let yy = 0; yy < step; yy++) for (let xx = 0; xx < step; xx++) out.data[((y + yy) * ts + (x + xx)) * 4 + 3] = v;
  }
}

export class TerrainPainter {
  private textures = new Map<string, HTMLCanvasElement>();
  private scratch = makeCanvas(256, 256);
  private maskCanvas = makeCanvas(128, 128);
  private maskData: ImageData | null = null;

  constructor(private map: WorldMap) {}

  private mask(ts: number, gx: number, gy: number, dx: number, dy: number): HTMLCanvasElement {
    const m = this.maskCanvas;
    if (m.canvas.width !== ts) { m.canvas.width = ts; m.canvas.height = ts; this.maskData = null; }
    if (!this.maskData) {
      this.maskData = m.ctx.createImageData(ts, ts);
      for (let i = 0; i < this.maskData.data.length; i += 4) { this.maskData.data[i] = 255; this.maskData.data[i + 1] = 255; this.maskData.data[i + 2] = 255; }
    }
    edgeMaskWorld(ts, gx, gy, dx, dy, this.maskData);
    m.ctx.putImageData(this.maskData, 0, 0);
    return m.canvas;
  }

  texture(id: TerrainId, season: Season): HTMLCanvasElement {
    const key = id + season;
    let t = this.textures.get(key);
    if (!t) this.textures.set(key, (t = makeTerrainTexture(id, season)));
    return t;
  }

  clearSeason() {
    this.textures.clear();
  }

  /**
   * Paint a chunk of `size` x `size` tiles at tile (cx*size, cy*size) into a canvas
   * of (size*ts*scale) pixels. `scale` < 1 trades sharpness for memory.
   */
  paintChunk(cx: number, cy: number, size: number, season: Season, scale = 1): { canvas: HTMLCanvasElement; water: HTMLCanvasElement | null } {
    const ts = this.map.tileSize;
    const px = size * ts * scale;
    const { canvas, ctx } = makeCanvas(px, px);
    ctx.scale(scale, scale);
    const tx0 = cx * size, ty0 = cy * size;
    const terrainAt = (tx: number, ty: number) => this.map.terrainAtTile(tx, ty).id;
    let hasWater = false;
    // Base tiles.
    for (let ty = 0; ty < size; ty++) for (let tx = 0; tx < size; tx++) {
      const t = terrainAt(tx0 + tx, ty0 + ty);
      if (t === "shallow_water" || t === "deep_water") hasWater = true;
      const tex = this.texture(t, season);
      const sx = ((tx0 + tx) * ts) % TEX_SIZE, sy = ((ty0 + ty) * ts) % TEX_SIZE;
      ctx.drawImage(tex, sx, sy, ts, ts, tx * ts, ty * ts, ts, ts);
    }
    // Transitions: higher-priority neighbours bleed into this tile.
    const sc = this.scratch;
    if (sc.canvas.width !== ts) { sc.canvas.width = ts; sc.canvas.height = ts; }
    for (let ty = 0; ty < size; ty++) for (let tx = 0; tx < size; tx++) {
      const gx = tx0 + tx, gy = ty0 + ty;
      const t = terrainAt(gx, gy);
      const neighbours: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
      // Sort by priority so the strongest paints last.
      const list = neighbours
        .map(([dx, dy]) => ({ dx, dy, n: terrainAt(gx + dx, gy + dy) }))
        .filter((e) => e.n !== t && PRIORITY[e.n] > PRIORITY[t])
        .filter((e) => e.dx === 0 || e.dy === 0 || (terrainAt(gx + e.dx, gy) !== e.n && terrainAt(gx, gy + e.dy) !== e.n))
        .sort((a, b) => PRIORITY[a.n] - PRIORITY[b.n]);
      for (const e of list) {
        const tex = this.texture(e.n, season);
        const s = sc.ctx;
        s.globalCompositeOperation = "source-over";
        s.clearRect(0, 0, ts, ts);
        s.drawImage(tex, (gx * ts) % TEX_SIZE, (gy * ts) % TEX_SIZE, ts, ts, 0, 0, ts, ts);
        s.globalCompositeOperation = "destination-in";
        s.drawImage(this.mask(ts, gx, gy, e.dx, e.dy), 0, 0);
        ctx.drawImage(sc.canvas, tx * ts, ty * ts);
      }
      // Cliff faces cast a shadow and show a ledge on the tile below them.
      if (t !== "cliff" && terrainAt(gx, gy - 1) === "cliff") {
        const g = ctx.createLinearGradient(0, ty * ts, 0, ty * ts + ts * 0.45);
        g.addColorStop(0, "rgba(20,15,10,0.55)");
        g.addColorStop(1, "rgba(20,15,10,0)");
        ctx.fillStyle = g;
        ctx.fillRect(tx * ts, ty * ts, ts, ts * 0.45);
      }
      if (t === "cliff" && terrainAt(gx, gy + 1) !== "cliff") {
        // Darker vertical face at the bottom of a cliff block.
        const g = ctx.createLinearGradient(0, ty * ts + ts * 0.45, 0, ty * ts + ts);
        g.addColorStop(0, "rgba(40,32,28,0.2)");
        g.addColorStop(1, "rgba(30,24,20,0.75)");
        ctx.fillStyle = g;
        ctx.fillRect(tx * ts, ty * ts + ts * 0.45, ts, ts * 0.55);
        ctx.strokeStyle = "rgba(255,255,255,0.18)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(tx * ts, ty * ts + ts * 0.45);
        ctx.lineTo(tx * ts + ts, ty * ts + ts * 0.45);
        ctx.stroke();
      }
    }
    // Water shimmer layer (animated separately by the scene).
    let water: HTMLCanvasElement | null = null;
    if (hasWater) {
      const w = makeCanvas(px, px);
      w.ctx.scale(scale, scale);
      const rnd = seeded(cx * 1000 + cy);
      for (let ty = 0; ty < size; ty++) for (let tx = 0; tx < size; tx++) {
        const t = terrainAt(tx0 + tx, ty0 + ty);
        if (t !== "shallow_water" && t !== "deep_water") continue;
        for (let i = 0; i < 4; i++) {
          const x = tx * ts + rnd() * ts, y = ty * ts + rnd() * ts;
          const len = 14 + rnd() * 30;
          w.ctx.strokeStyle = `rgba(255,255,255,${0.25 + rnd() * 0.35})`;
          w.ctx.lineWidth = 2;
          w.ctx.lineCap = "round";
          w.ctx.beginPath();
          w.ctx.moveTo(x, y);
          w.ctx.quadraticCurveTo(x + len / 2, y - 3, x + len, y);
          w.ctx.stroke();
        }
      }
      water = w.canvas;
    }
    return { canvas, water };
  }
}

export { TERRAIN_ORDER };

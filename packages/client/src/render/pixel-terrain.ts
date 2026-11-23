/**
 * Pixel-art terrain built from licensed 16px tiles (inkBubi, CC0).
 *
 * Each chunk is painted at art resolution (16 px per tile) and displayed at
 * WORLD_PIXEL scale with nearest-neighbour filtering. Borders between terrain
 * types are decided per art pixel using world-space noise, so edges are
 * organic and pixel-stepped like hand-made autotiles, and continuous across
 * tiles and chunks. Shorelines get highlight/bank pixels; cliffs get a face.
 */
import { makeNoise2D, type Season, type TerrainId, type WorldMap } from "@catgen/shared";
import { compose, recolor, seasonFn, sheetPixels, type HslFn, type SheetId } from "./env-assets.ts";


const T = 16; // art pixels per tile

const PRIORITY: Record<TerrainId, number> = {
  deep_water: 0, shallow_water: 1, sand: 2, marsh: 3, grass: 4, moor: 5, forest_floor: 6, pine_floor: 7, camp_ground: 8, rock: 9, cave_floor: 10, cliff: 11,
};
const WATER = new Set<TerrainId>(["shallow_water", "deep_water"]);
const VEG = new Set<TerrainId>(["grass", "moor", "forest_floor", "pine_floor", "marsh"]);

interface TerrainSource {
  sheet: SheetId;
  /** Tile coordinates (16px units) of interchangeable base tiles. */
  tiles: [number, number][];
  /** Occasional decorative variants (e.g. flowers). */
  rare?: [number, number][];
  fn?: HslFn;
  vegetation?: boolean;
}

const GRASS_TILES: [number, number][] = [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [0, 3], [1, 3], [2, 3], [3, 3]];
const FLOWER_TILES: [number, number][] = [[0, 2], [1, 2], [2, 2], [3, 2]];
const DIRT_TILES: [number, number][] = [[12, 0], [13, 0], [12, 1], [13, 1], [12, 2], [13, 2], [12, 3], [13, 3]];
const WATER_TILES: [number, number][] = Array.from({ length: 16 }, (_, r) => [[12, r], [13, r]] as [number, number][]).flat();

const SOURCES: Record<TerrainId, TerrainSource> = {
  grass: { sheet: "grass", tiles: GRASS_TILES, rare: FLOWER_TILES, vegetation: true },
  forest_floor: { sheet: "grass", tiles: GRASS_TILES, vegetation: true, fn: (h, s, l) => [h + 0.03, s * 0.78, l * 0.74] },
  pine_floor: { sheet: "grass", tiles: GRASS_TILES, vegetation: true, fn: (h, s, l) => [0.1 + (h - 0.3) * 0.2, s * 0.42, l * 0.6] },
  moor: { sheet: "grass", tiles: GRASS_TILES, vegetation: true, fn: (h, s, l) => [h - 0.07, s * 0.72, Math.min(1, l * 1.06)] },
  marsh: { sheet: "grass", tiles: GRASS_TILES, vegetation: true, fn: (h, s, l) => [h + 0.1, s * 0.5, l * 0.72] },
  sand: { sheet: "grassDirt", tiles: DIRT_TILES, fn: (h, s, l) => [h + 0.01, s * 0.85, Math.min(1, l * 1.1)] },
  camp_ground: { sheet: "grassDirt", tiles: DIRT_TILES, fn: (h, s, l) => [h - 0.03, s * 0.75, l * 0.78] },
  rock: { sheet: "grassDirt", tiles: DIRT_TILES, fn: (h, s, l) => [0.1, s * 0.1, l * 0.88] },
  cliff: { sheet: "grassDirt", tiles: DIRT_TILES, fn: (h, s, l) => [0.08, s * 0.12, l * 0.6] },
  cave_floor: { sheet: "grassDirt", tiles: DIRT_TILES, fn: (h, s, l) => [0.08, s * 0.1, l * 0.42] },
  shallow_water: { sheet: "water", tiles: WATER_TILES, fn: (h, s, l) => [h - 0.06, s * 0.8, Math.min(1, l * 1.28)] },
  deep_water: { sheet: "water", tiles: WATER_TILES },
};

function hash(x: number, y: number, k = 0): number {
  let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class PixelTerrainPainter {
  /** Pre-recoloured tile pixel data per terrain+season. */
  private textures = new Map<string, { data: Uint8ClampedArray; width: number; src: TerrainSource }>();
  private noiseA = makeNoise2D(911);
  private noiseB = makeNoise2D(377);

  constructor(private map: WorldMap) {}

  clearSeason() {
    this.textures.clear();
  }

  private texture(t: TerrainId, season: Season) {
    const key = t + season;
    let tex = this.textures.get(key);
    if (!tex) {
      const src = SOURCES[t];
      const base = sheetPixels(src.sheet);
      const copy = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height);
      const fn = compose(src.fn, src.vegetation || src.sheet === "grassDirt" ? seasonFn(season) : undefined, season === "leafbare" && WATER.has(t) ? (h, s, l) => [h, s * 0.8, Math.min(1, l * 1.05)] : undefined);
      recolor(copy, fn);
      tex = { data: copy.data, width: base.width, src };
      this.textures.set(key, tex);
    }
    return tex;
  }

  private terrain(tx: number, ty: number): TerrainId {
    return this.map.terrainAtTile(tx, ty).id;
  }

  /** Which terrain an individual art pixel (global art-pixel coords) shows. */
  private pixelTerrain(GX: number, GY: number): TerrainId {
    const tx = Math.floor(GX / T), ty = Math.floor(GY / T);
    const t = this.terrain(tx, ty);
    const nx = (GX - tx * T + 0.5) / T, ny = (GY - ty * T + 0.5) / T;
    let chosen = t;
    let best = PRIORITY[t];
    const wx = GX / T, wy = GY / T;
    const wobble = (this.noiseA(wx * 1.1, wy * 1.1) - 0.5) * 0.55 + (this.noiseB(wx * 3.7, wy * 3.7) - 0.5) * 0.22;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const n = this.terrain(tx + dx, ty + dy);
      if (n === t || PRIORITY[n] <= best) continue;
      if (dx && dy && (this.terrain(tx + dx, ty) === n || this.terrain(tx, ty + dy) === n)) continue;
      let d: number;
      if (dx && dy) d = Math.hypot(dx > 0 ? 1 - nx : nx, dy > 0 ? 1 - ny : ny);
      else if (dx) d = dx > 0 ? 1 - nx : nx;
      else d = dy > 0 ? 1 - ny : ny;
      // Cliffs keep crisp, tile-aligned silhouettes; everything else blends organically.
      const reach = n === "cliff" ? 0.12 : WATER.has(t) ? 0.38 : 0.42;
      if (d + (n === "cliff" ? wobble * 0.3 : wobble) < reach) {
        chosen = n;
        best = PRIORITY[n];
      }
    }
    return chosen;
  }

  private sample(t: TerrainId, season: Season, GX: number, GY: number): [number, number, number] {
    const tex = this.texture(t, season);
    const tx = Math.floor(GX / T), ty = Math.floor(GY / T);
    const r = hash(tx, ty, PRIORITY[t]);
    const useRare = tex.src.rare && r < 0.07;
    const list = useRare ? tex.src.rare! : tex.src.tiles;
    const [sx, sy] = list[Math.floor(hash(tx, ty, 7) * list.length)];
    const px = sx * T + (GX - tx * T), py = sy * T + (GY - ty * T);
    const i = (py * tex.width + px) * 4;
    return [tex.data[i], tex.data[i + 1], tex.data[i + 2]];
  }

  /** Paint a chunk of size x size tiles at art resolution. */
  paintChunk(cx: number, cy: number, size: number, season: Season): { canvas: HTMLCanvasElement; water: HTMLCanvasElement | null } {
    const N = size * T;
    const GX0 = cx * size * T, GY0 = cy * size * T;
    // Terrain per pixel, with a 1px margin for edge detection.
    const M = N + 2;
    const ter: TerrainId[] = new Array(M * M);
    for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) ter[y * M + x] = this.pixelTerrain(GX0 + x - 1, GY0 + y - 1);
    const at = (x: number, y: number) => ter[(y + 1) * M + (x + 1)];

    const canvas = document.createElement("canvas");
    canvas.width = N;
    canvas.height = N;
    const ctx = canvas.getContext("2d")!;
    const img = ctx.createImageData(N, N);
    const d = img.data;
    const water = document.createElement("canvas");
    water.width = N;
    water.height = N;
    const wctx = water.getContext("2d")!;
    const wimg = wctx.createImageData(N, N);
    let hasWater = false;

    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const t = at(x, y);
      const GX = GX0 + x, GY = GY0 + y;
      let [r, g, b] = this.sample(t, season, GX, GY);
      const nb = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)];
      const isWater = WATER.has(t);
      if (isWater) {
        hasWater = true;
        if (nb.some((n) => !WATER.has(n))) {
          // Shoreline highlight.
          [r, g, b] = [Math.min(255, r * 0.5 + 140), Math.min(255, g * 0.5 + 165), Math.min(255, b * 0.5 + 180)];
        } else if (t === "deep_water" && nb.some((n) => n === "shallow_water")) {
          [r, g, b] = [r * 0.85 + 20, g * 0.85 + 30, b * 0.85 + 35];
        } else if (hash(GX, GY, 3) < 0.012) {
          const wi = (y * N + x) * 4;
          wimg.data[wi] = 220; wimg.data[wi + 1] = 240; wimg.data[wi + 2] = 255; wimg.data[wi + 3] = 255;
          if (x + 1 < N) { wimg.data[wi + 4] = 220; wimg.data[wi + 5] = 240; wimg.data[wi + 6] = 255; wimg.data[wi + 7] = 255; }
        }
      } else if (nb.some((n) => WATER.has(n))) {
        // Wet bank.
        [r, g, b] = [r * 0.62, g * 0.62, b * 0.62];
      } else if (VEG.has(t) && nb.some((n) => !VEG.has(n) && !WATER.has(n) && n !== "cliff")) {
        // Grass lip over dirt/sand/rock.
        [r, g, b] = [r * 0.8, g * 0.8, b * 0.8];
      }
      // Cliff faces and the shadow they cast.
      const localY = (GY0 + y) % T;
      const tileX = Math.floor(GX / T), tileY = Math.floor(GY / T);
      if (t === "cliff" && this.terrain(tileX, tileY + 1) !== "cliff") {
        if (localY >= 9) {
          const k = (localY - 9) / 7;
          const stripe = (GX % 4 === 0) ? 0.82 : 1;
          [r, g, b] = [r * (0.75 - k * 0.3) * stripe, g * (0.73 - k * 0.3) * stripe, b * (0.72 - k * 0.3) * stripe];
        } else if (localY === 8) [r, g, b] = [Math.min(255, r * 1.25), Math.min(255, g * 1.25), Math.min(255, b * 1.25)];
      } else if (t !== "cliff" && this.terrain(tileX, tileY - 1) === "cliff" && localY < 4) {
        const k = 0.6 + localY * 0.1;
        [r, g, b] = [r * k, g * k, b * k];
      }
      if (season === "leafbare" && !isWater && t !== "cliff" && t !== "cave_floor") {
        // Patchy snow cover.
        const snow = this.noiseA(GX / 22, GY / 22) + (hash(GX, GY, 9) - 0.5) * 0.08;
        if (snow > 0.56) [r, g, b] = snow > 0.6 ? [236, 242, 248] : [214, 224, 236];
      }
      const i = (y * N + x) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    if (hasWater) wctx.putImageData(wimg, 0, 0);
    return { canvas, water: hasWater ? water : null };
  }
}


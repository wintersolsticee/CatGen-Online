import Phaser from "phaser";
import type { Season, WorldMap } from "@catgen/shared";
import { PixelTerrainPainter } from "../../render/pixel-terrain.ts";
import { WORLD_PIXEL } from "../../render/env-assets.ts";

const CHUNK_TILES = 8;

interface Chunk {
  key: string;
  ground: Phaser.GameObjects.Image;
  water: Phaser.GameObjects.Image | null;
}

/**
 * Streams terrain in chunks around the camera. Chunks are painted lazily (a
 * small budget per frame to avoid hitches) and evicted when far away, keeping
 * GPU memory bounded on a large map.
 */
export class ChunkLayer {
  private chunks = new Map<string, Chunk>();
  private pending = new Set<string>();
  private painter: PixelTerrainPainter;
  private season: Season;
  private chunkPx: number;
  /** Chunks are tiny at art resolution (128x128 px), so many can stay cached. */
  maxChunks = 64;

  constructor(private scene: Phaser.Scene, private map: WorldMap, season: Season) {
    this.painter = new PixelTerrainPainter(map);
    this.season = season;
    this.chunkPx = CHUNK_TILES * map.tileSize;
  }

  setSeason(season: Season) {
    if (season === this.season) return;
    this.season = season;
    this.painter.clearSeason();
    for (const key of [...this.chunks.keys()]) this.destroyChunk(key);
  }

  private destroyChunk(key: string) {
    const c = this.chunks.get(key);
    if (!c) return;
    c.ground.destroy();
    c.water?.destroy();
    this.scene.textures.remove(`chunk_${key}_${this.season}`);
    this.scene.textures.remove(`chunk_${key}_${this.season}_w`);
    for (const k of this.scene.textures.getTextureKeys()) if (k.startsWith(`chunk_${key}_`)) this.scene.textures.remove(k);
    this.chunks.delete(key);
  }

  private build(cx: number, cy: number) {
    const key = `${cx}_${cy}`;
    const { canvas, water } = this.painter.paintChunk(cx, cy, CHUNK_TILES, this.season);
    const texKey = `chunk_${key}_${this.season}`;
    if (this.scene.textures.exists(texKey)) this.scene.textures.remove(texKey);
    this.scene.textures.addCanvas(texKey, canvas)!.setFilter(Phaser.Textures.FilterMode.NEAREST);
    const ground = this.scene.add.image(cx * this.chunkPx, cy * this.chunkPx, texKey).setOrigin(0, 0).setDepth(-100000).setScale(WORLD_PIXEL);
    let waterImg: Phaser.GameObjects.Image | null = null;
    if (water) {
      const wk = `${texKey}_w`;
      if (this.scene.textures.exists(wk)) this.scene.textures.remove(wk);
      this.scene.textures.addCanvas(wk, water)!.setFilter(Phaser.Textures.FilterMode.NEAREST);
      waterImg = this.scene.add.image(cx * this.chunkPx, cy * this.chunkPx, wk).setOrigin(0, 0).setDepth(-99999).setScale(WORLD_PIXEL);
    }
    this.chunks.set(key, { key, ground, water: waterImg });
  }

  /** Ensure chunks around the view exist. `budget` = chunks to paint this frame. */
  update(view: Phaser.Geom.Rectangle, time: number, budget = 1, synchronous = false) {
    const margin = this.chunkPx * 0.5;
    const x0 = Math.max(0, Math.floor((view.x - margin) / this.chunkPx));
    const y0 = Math.max(0, Math.floor((view.y - margin) / this.chunkPx));
    const x1 = Math.min(Math.ceil(this.map.width / CHUNK_TILES) - 1, Math.floor((view.right + margin) / this.chunkPx));
    const y1 = Math.min(Math.ceil(this.map.height / CHUNK_TILES) - 1, Math.floor((view.bottom + margin) / this.chunkPx));
    const cxm = view.centerX / this.chunkPx, cym = view.centerY / this.chunkPx;
    const needed: [number, number, number][] = [];
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      if (!this.chunks.has(`${cx}_${cy}`)) needed.push([cx, cy, (cx + 0.5 - cxm) ** 2 + (cy + 0.5 - cym) ** 2]);
    }
    needed.sort((a, b) => a[2] - b[2]);
    const n = synchronous ? needed.length : Math.min(budget, needed.length);
    for (let i = 0; i < n; i++) this.build(needed[i][0], needed[i][1]);

    // Animate water shimmer.
    // Water sparkles twinkle and drift by whole art pixels.
    const a = 0.25 + Math.abs(Math.sin(time / 700)) * 0.6;
    const drift = Math.round(Math.sin(time / 1500) * 1.5) * WORLD_PIXEL;
    for (const c of this.chunks.values()) {
      if (c.water) {
        c.water.setAlpha(a);
        c.water.x = c.ground.x + drift;
      }
    }
    // Evict far chunks.
    if (this.chunks.size > this.maxChunks) {
      const far = [...this.chunks.keys()]
        .map((k) => {
          const [cx, cy] = k.split("_").map(Number);
          return { k, d: (cx + 0.5 - cxm) ** 2 + (cy + 0.5 - cym) ** 2 };
        })
        .sort((a, b) => b.d - a.d);
      for (let i = 0; i < this.chunks.size - this.maxChunks; i++) this.destroyChunk(far[i].k);
    }
    return needed.length - n;
  }
}

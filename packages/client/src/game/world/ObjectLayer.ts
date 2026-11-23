import Phaser from "phaser";
import type { Season, WorldMap, WorldObject } from "@catgen/shared";
import { objectArt } from "../../render/object-textures.ts";
import { ensureCanvasTexture } from "../textures.ts";

const CELL = 1024;
const SWAY = new Set(["tall_grass", "reeds", "fern", "heather", "flowers", "tree_willow"]);
const GROUND_COVER = new Set(["flowers", "lilypad", "pebbles", "stepping_stone", "fresh_kill_pile"]);

interface Live {
  obj: WorldObject;
  img: Phaser.GameObjects.Image;
  canopy?: { x: number; y: number; w: number; h: number };
}

/**
 * World decorations (trees, rocks, dens...). Only objects near the camera get a
 * sprite; everything else is just data. Sprites are depth-sorted by y.
 */
export class ObjectLayer {
  private grid = new Map<string, WorldObject[]>();
  private live = new Map<string, Live[]>();
  private season: Season;
  wind = 1;

  constructor(private scene: Phaser.Scene, map: WorldMap, season: Season) {
    this.season = season;
    for (const o of map.objects) {
      const key = `${Math.floor(o.x / CELL)}_${Math.floor(o.y / CELL)}`;
      const list = this.grid.get(key) ?? [];
      list.push(o);
      this.grid.set(key, list);
    }
  }

  setSeason(season: Season) {
    if (season === this.season) return;
    this.season = season;
    for (const key of [...this.live.keys()]) this.despawnCell(key);
  }

  private spawnCell(key: string) {
    const objs = this.grid.get(key) ?? [];
    const out: Live[] = [];
    for (const obj of objs) {
      const art = objectArt(obj.kind, obj.variant, this.season);
      const tex = ensureCanvasTexture(this.scene, `obj_${obj.kind}_${obj.variant}_${this.season}`, () => art.canvas);
      const img = this.scene.add.image(obj.x, obj.y, tex).setOrigin(art.anchorX, art.anchorY).setScale(obj.scale);
      img.setDepth(GROUND_COVER.has(obj.kind) ? obj.y - 2000 : obj.y);
      if (obj.variant % 2) img.setFlipX(true);
      out.push({ obj, img, canopy: art.canopy ? { x: art.canopy.x * obj.scale, y: art.canopy.y * obj.scale, w: art.canopy.w * obj.scale, h: art.canopy.h * obj.scale } : undefined });
    }
    this.live.set(key, out);
  }

  private despawnCell(key: string) {
    for (const l of this.live.get(key) ?? []) l.img.destroy();
    this.live.delete(key);
  }

  update(view: Phaser.Geom.Rectangle, time: number, focus: { x: number; y: number } | null) {
    const margin = 500;
    const x0 = Math.floor((view.x - margin) / CELL), x1 = Math.floor((view.right + margin) / CELL);
    const y0 = Math.floor((view.y - margin) / CELL), y1 = Math.floor((view.bottom + margin * 1.6) / CELL);
    const keep = new Set<string>();
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const key = `${cx}_${cy}`;
      keep.add(key);
      if (!this.live.has(key) && this.grid.has(key)) this.spawnCell(key);
    }
    for (const key of [...this.live.keys()]) if (!keep.has(key)) this.despawnCell(key);

    // Foliage sway + canopy see-through when the player walks behind a tree.
    for (const list of this.live.values()) {
      for (const l of list) {
        if (SWAY.has(l.obj.kind)) l.img.setRotation(Math.sin(time / 700 + l.obj.x * 0.01) * 0.04 * this.wind);
        if (l.canopy && focus) {
          const inside = focus.y < l.obj.y && focus.x > l.obj.x + l.canopy.x && focus.x < l.obj.x + l.canopy.x + l.canopy.w && focus.y > l.obj.y + l.canopy.y && focus.y < l.obj.y + l.canopy.y + l.canopy.h + 40;
          const target = inside ? 0.42 : 1;
          l.img.setAlpha(l.img.alpha + (target - l.img.alpha) * 0.15);
        }
      }
    }
  }
}

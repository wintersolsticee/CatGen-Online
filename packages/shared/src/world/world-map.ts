import { TERRAIN, terrainFromGid, type Biome, type TerrainDefinition } from "../data/terrain.ts";
import { isClanId, type ClanId } from "../data/clans.ts";
import { objectType, prop, type TiledMap, type TiledObject, type TiledObjectLayer, type TiledTileLayer } from "./tiled.ts";

/** A static decoration (tree, rock, den...) placed in the world. */
export interface WorldObject {
  id: number;
  kind: string;
  x: number;
  y: number;
  /** Visual scale multiplier. */
  scale: number;
  /** Circle collider radius; 0 = no collision. */
  collisionRadius: number;
  /** Optional variant index for visual variety. */
  variant: number;
  /** Interactive role, if any (fresh_kill_pile, medicine_den, ...). */
  clan: ClanId | null;
}

export type LocationKind = "camp" | "landmark" | "gathering" | "fresh_kill_pile" | "medicine_den" | "spawn";

export interface WorldLocation {
  id: string;
  kind: LocationKind;
  name: string;
  x: number;
  y: number;
  radius: number;
  clan: ClanId | null;
  description: string;
}

export interface Territory {
  clan: ClanId;
  polygon: { x: number; y: number }[];
}

interface Collider {
  x: number;
  y: number;
  r: number;
}

const HASH_CELL = 256;

/**
 * Runtime representation of a world map, shared by server (authority) and client
 * (prediction + rendering). Construct from a Tiled JSON map.
 */
export class WorldMap {
  readonly width: number;
  readonly height: number;
  readonly tileSize: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly terrain: Uint8Array;
  readonly objects: WorldObject[] = [];
  readonly locations: WorldLocation[] = [];
  readonly territories: Territory[] = [];
  readonly name: string;
  private readonly colliderHash = new Map<number, Collider[]>();
  private readonly biomeTiles = new Map<Biome, number[]>();

  constructor(map: TiledMap) {
    this.width = map.width;
    this.height = map.height;
    this.tileSize = map.tilewidth;
    this.pixelWidth = map.width * map.tilewidth;
    this.pixelHeight = map.height * map.tileheight;
    this.name = prop(map, "name", "world");

    const terrainLayer = map.layers.find((l): l is TiledTileLayer => l.type === "tilelayer" && l.name === "terrain");
    if (!terrainLayer) throw new Error("Map is missing a 'terrain' tile layer");
    if (terrainLayer.data.length !== this.width * this.height) throw new Error("Terrain layer size mismatch");
    this.terrain = Uint8Array.from(terrainLayer.data);

    for (let i = 0; i < this.terrain.length; i++) {
      const t = terrainFromGid(this.terrain[i]);
      if (!t || !t.walkable) continue;
      const list = this.biomeTiles.get(t.biome) ?? [];
      list.push(i);
      this.biomeTiles.set(t.biome, list);
    }

    const layer = (name: string) => map.layers.find((l): l is TiledObjectLayer => l.type === "objectgroup" && l.name === name);
    for (const o of layer("objects")?.objects ?? []) this.addObject(o);
    for (const o of layer("locations")?.objects ?? []) this.addLocation(o);
    for (const o of layer("territories")?.objects ?? []) {
      const clan = prop(o, "clan", "");
      if (!isClanId(clan)) continue;
      const polygon = o.polygon
        ? o.polygon.map((p) => ({ x: o.x + p.x, y: o.y + p.y }))
        : [
            { x: o.x, y: o.y },
            { x: o.x + o.width, y: o.y },
            { x: o.x + o.width, y: o.y + o.height },
            { x: o.x, y: o.y + o.height },
          ];
      this.territories.push({ clan, polygon });
    }
  }

  private addObject(o: TiledObject) {
    const clan = prop(o, "clan", "");
    const obj: WorldObject = {
      id: o.id,
      kind: objectType(o),
      x: o.x,
      y: o.y,
      scale: prop(o, "scale", 1),
      collisionRadius: prop(o, "collisionRadius", 0),
      variant: prop(o, "variant", 0),
      clan: isClanId(clan) ? clan : null,
    };
    this.objects.push(obj);
    if (obj.collisionRadius > 0) {
      const c: Collider = { x: obj.x, y: obj.y, r: obj.collisionRadius };
      const minX = Math.floor((c.x - c.r) / HASH_CELL);
      const maxX = Math.floor((c.x + c.r) / HASH_CELL);
      const minY = Math.floor((c.y - c.r) / HASH_CELL);
      const maxY = Math.floor((c.y + c.r) / HASH_CELL);
      for (let cy = minY; cy <= maxY; cy++)
        for (let cx = minX; cx <= maxX; cx++) {
          const key = cy * 100000 + cx;
          const list = this.colliderHash.get(key) ?? [];
          list.push(c);
          this.colliderHash.set(key, list);
        }
    }
  }

  private addLocation(o: TiledObject) {
    const clan = prop(o, "clan", "");
    this.locations.push({
      id: prop(o, "locationId", `${objectType(o)}_${o.id}`),
      kind: objectType(o) as LocationKind,
      name: o.name,
      x: o.x,
      y: o.y,
      radius: prop(o, "radius", 300),
      clan: isClanId(clan) ? clan : null,
      description: prop(o, "description", ""),
    });
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.pixelWidth && y < this.pixelHeight;
  }

  terrainAtTile(tx: number, ty: number): TerrainDefinition {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return TERRAIN.cliff;
    return terrainFromGid(this.terrain[ty * this.width + tx]) ?? TERRAIN.cliff;
  }

  terrainAt(x: number, y: number): TerrainDefinition {
    return this.terrainAtTile(Math.floor(x / this.tileSize), Math.floor(y / this.tileSize));
  }

  /** Would a circle of radius r at (x,y) overlap anything solid? */
  collides(x: number, y: number, r: number): boolean {
    const ts = this.tileSize;
    const minTx = Math.floor((x - r) / ts);
    const maxTx = Math.floor((x + r) / ts);
    const minTy = Math.floor((y - r) / ts);
    const maxTy = Math.floor((y + r) / ts);
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        if (this.terrainAtTile(tx, ty).walkable) continue;
        // circle vs tile rect
        const nx = Math.max(tx * ts, Math.min(x, (tx + 1) * ts));
        const ny = Math.max(ty * ts, Math.min(y, (ty + 1) * ts));
        if ((nx - x) ** 2 + (ny - y) ** 2 < r * r) return true;
      }
    }
    const cx = Math.floor(x / HASH_CELL);
    const cy = Math.floor(y / HASH_CELL);
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) {
        const list = this.colliderHash.get((cy + oy) * 100000 + (cx + ox));
        if (!list) continue;
        for (const c of list) {
          const rr = c.r + r;
          if ((c.x - x) ** 2 + (c.y - y) ** 2 < rr * rr) return true;
        }
      }
    return false;
  }

  /**
   * Move a circle by (dx,dy) with sliding collision. Movement is split into small
   * steps so fast-moving cats never tunnel through thin obstacles.
   */
  moveWithCollision(x: number, y: number, dx: number, dy: number, r: number): { x: number; y: number } {
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / (r * 0.5)));
    const sx = dx / steps;
    const sy = dy / steps;
    for (let i = 0; i < steps; i++) {
      if (!this.collides(x + sx, y + sy, r)) {
        x += sx;
        y += sy;
      } else if (!this.collides(x + sx, y, r)) {
        x += sx;
      } else if (!this.collides(x, y + sy, r)) {
        y += sy;
      } else break;
    }
    return { x, y };
  }

  territoryAt(x: number, y: number): ClanId | null {
    for (const t of this.territories) if (pointInPolygon(x, y, t.polygon)) return t.clan;
    return null;
  }

  location(kind: LocationKind, clan: ClanId | null = null): WorldLocation | undefined {
    return this.locations.find((l) => l.kind === kind && l.clan === clan);
  }

  locationsNear(x: number, y: number): WorldLocation[] {
    return this.locations.filter((l) => (l.x - x) ** 2 + (l.y - y) ** 2 <= l.radius * l.radius);
  }

  /** Pick a random walkable tile centre within a biome (used for spawning). */
  randomPointInBiome(biome: Biome, rng: () => number): { x: number; y: number } | null {
    const tiles = this.biomeTiles.get(biome);
    if (!tiles || tiles.length === 0) return null;
    const idx = tiles[Math.floor(rng() * tiles.length)];
    const tx = idx % this.width;
    const ty = Math.floor(idx / this.width);
    return { x: (tx + 0.15 + rng() * 0.7) * this.tileSize, y: (ty + 0.15 + rng() * 0.7) * this.tileSize };
  }

  biomes(): Biome[] {
    return [...this.biomeTiles.keys()];
  }

  /** Find a non-colliding spawn point near (x,y). */
  findOpenSpot(x: number, y: number, r: number, rng: () => number = Math.random): { x: number; y: number } {
    for (let i = 0; i < 60; i++) {
      const a = rng() * Math.PI * 2;
      const d = i * 12;
      const px = x + Math.cos(a) * d;
      const py = y + Math.sin(a) * d;
      if (this.inBounds(px, py) && !this.collides(px, py, r)) return { x: px, y: py };
    }
    return { x, y };
  }
}

export function pointInPolygon(x: number, y: number, poly: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

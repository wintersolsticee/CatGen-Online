/**
 * Generates the default world map as a Tiled-compatible JSON file, plus a
 * colour-swatch terrain tileset PNG so the map can be opened and edited in Tiled.
 *
 *   npm run gen:map            (seed 1337)
 *   npm run gen:map -- 42      (custom seed)
 *
 * Output: packages/client/public/maps/world.json (+ terrain-tileset.png)
 * The server loads the same file, so client and server always agree.
 *
 * Layout (approximate, 160x160 tiles of 128px):
 *   ThunderClan  - oak forest, west
 *   ShadowClan   - pine forest + marsh, north
 *   WindClan     - open moorland, east
 *   RiverClan    - river + marsh, south-east
 *   SkyClan      - rocky cliffs, south-west
 *   Fourtrees    - neutral Gathering hollow at the centre
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GAME_CONFIG, TERRAIN, TERRAIN_ORDER, gidOfTerrain, mulberry32, makeNoise2D, fbm,
  type TerrainId, type ClanId, type TiledMap, type TiledObject, type TiledProperty,
} from "../packages/shared/src/index.ts";

const seed = Number(process.argv[2] ?? 1337);
const W = 160;
const H = 160;
const TS = GAME_CONFIG.tileSize;
const rng = mulberry32(seed);
const noise = makeNoise2D(seed);
const noise2 = makeNoise2D(seed + 99);

const grid: TerrainId[] = new Array(W * H).fill("grass");
const set = (x: number, y: number, t: TerrainId) => {
  if (x >= 0 && y >= 0 && x < W && y < H) grid[y * W + x] = t;
};
const get = (x: number, y: number): TerrainId => (x >= 0 && y >= 0 && x < W && y < H ? grid[y * W + x] : "cliff");

// ---- Clan regions --------------------------------------------------------
interface Region { clan: ClanId; cx: number; cy: number; base: TerrainId; alt: TerrainId; campName: string }
const regions: Region[] = [
  { clan: "thunderclan", cx: 34, cy: 80, base: "forest_floor", alt: "grass", campName: "ThunderClan Camp" },
  { clan: "shadowclan", cx: 80, cy: 28, base: "pine_floor", alt: "marsh", campName: "ShadowClan Camp" },
  { clan: "windclan", cx: 128, cy: 64, base: "moor", alt: "grass", campName: "WindClan Camp" },
  { clan: "riverclan", cx: 118, cy: 126, base: "marsh", alt: "grass", campName: "RiverClan Camp" },
  { clan: "skyclan", cx: 40, cy: 130, base: "rock", alt: "grass", campName: "SkyClan Camp" },
];
const center = { x: 80, y: 80 };

// Voronoi-ish assignment with noisy borders.
const owner = new Int8Array(W * H).fill(-1);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const wob = (fbm(noise, x / 18, y / 18) - 0.5) * 28;
    const wob2 = (fbm(noise2, x / 18, y / 18) - 0.5) * 28;
    let best = -1, bestD = Infinity;
    regions.forEach((r, i) => {
      const d = Math.hypot(x + wob - r.cx, y + wob2 - r.cy);
      if (d < bestD) { bestD = d; best = i; }
    });
    const dc = Math.hypot(x - center.x, y - center.y);
    if (dc < 9 + wob * 0.15) { owner[y * W + x] = -1; set(x, y, "grass"); continue; }
    owner[y * W + x] = best;
    const r = regions[best];
    const n = fbm(noise2, x / 9, y / 9);
    set(x, y, n > 0.62 ? r.alt : r.base);
    if (r.clan === "skyclan" && n < 0.36) set(x, y, "grass");
    if (r.clan === "thunderclan" && n < 0.3) set(x, y, "grass");
  }
}

// ---- River: from north-east down through RiverClan to the south edge, with a lake.
let rx = 150, ry = 0;
const riverPath: [number, number][] = [];
while (ry < H) {
  riverPath.push([rx, ry]);
  ry += 1;
  const target = ry < 60 ? 104 : ry < 110 ? 98 : 112;
  rx += Math.sign(target - rx) * (rng() < 0.55 ? 1 : 0) + (rng() < 0.15 ? (rng() < 0.5 ? -1 : 1) : 0);
}
for (const [px, py] of riverPath) {
  const width = 2 + Math.round(fbm(noise, px / 10, py / 10) * 2);
  for (let dx = -width - 2; dx <= width + 2; dx++) {
    const x = px + dx;
    const ad = Math.abs(dx);
    if (ad <= width - 1) set(x, py, "deep_water");
    else if (ad <= width) set(x, py, "shallow_water");
    else if (get(x, py) !== "deep_water" && get(x, py) !== "shallow_water") set(x, py, "sand");
  }
}
// Fords (stepping stones) so the river can be crossed.
for (const fordY of [18, 52, 88, 140]) {
  const pr = riverPath[fordY];
  for (let dx = -8; dx <= 8; dx++) for (let dy = -1; dy <= 1; dy++) {
    if (get(pr[0] + dx, fordY + dy) === "deep_water") set(pr[0] + dx, fordY + dy, "shallow_water");
  }
}
// Lake in RiverClan territory.
const lake = { x: 128, y: 138, r: 9 };
for (let y = lake.y - 14; y <= lake.y + 14; y++) for (let x = lake.x - 16; x <= lake.x + 16; x++) {
  const d = Math.hypot((x - lake.x) / 1.4, y - lake.y) + (fbm(noise, x / 5, y / 5) - 0.5) * 4;
  if (d < lake.r - 2) set(x, y, "deep_water");
  else if (d < lake.r) set(x, y, "shallow_water");
  else if (d < lake.r + 1.5 && get(x, y) !== "deep_water") set(x, y, "sand");
}

// ---- SkyClan cliffs: ridges of impassable cliff with gaps.
for (let i = 0; i < 6; i++) {
  let cx = 14 + rng() * 50, cy = 108 + rng() * 44;
  const ang = rng() * Math.PI;
  const len = 8 + rng() * 10;
  for (let s = 0; s < len; s++) {
    if (s % 7 === 3) { cx += Math.cos(ang); cy += Math.sin(ang); continue; } // leave gaps
    set(Math.round(cx), Math.round(cy), "cliff");
    set(Math.round(cx) + 1, Math.round(cy), "cliff");
    cx += Math.cos(ang);
    cy += Math.sin(ang);
  }
}
// ---- ShadowClan marsh pools.
for (let i = 0; i < 5; i++) {
  const px = 60 + rng() * 40, py = 10 + rng() * 30;
  for (let y = -3; y <= 3; y++) for (let x = -4; x <= 4; x++) {
    if (Math.hypot(x / 1.3, y) < 2.4 + rng() * 0.6) set(Math.round(px + x), Math.round(py + y), rng() < 0.7 ? "shallow_water" : "marsh");
  }
}
// ---- Mountain border (world edge) of cliffs with an underground cave in the north-west.
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
  const n = fbm(noise2, x / 6, y / 6);
  if (edge < 2 || (edge < 4 && n > 0.5)) set(x, y, "cliff");
}
const cave = { x: 16, y: 20 };
for (let y = cave.y - 7; y <= cave.y + 7; y++) for (let x = cave.x - 10; x <= cave.x + 10; x++) {
  const d = Math.hypot((x - cave.x) / 1.4, y - cave.y);
  if (d < 5.5 + fbm(noise, x / 3, y / 3) * 2) set(x, y, "cave_floor");
  else if (d < 8) set(x, y, "cliff");
}
for (let i = 0; i < 6; i++) set(cave.x + 7 + i, cave.y, "cave_floor"); // tunnel entrance
for (let i = 0; i < 6; i++) set(cave.x + 7 + i, cave.y + 1, "cave_floor");

// ---- Camps: flat clearings.
const camps = regions.map((r) => {
  for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) {
    const d = Math.hypot(x, y) + (fbm(noise, (r.cx + x) / 4, (r.cy + y) / 4) - 0.5) * 2;
    if (d < 5.5) set(r.cx + x, r.cy + y, "camp_ground");
  }
  return r;
});

// ---- Objects -------------------------------------------------------------
let nextId = 1;
const objects: TiledObject[] = [];
const locations: TiledObject[] = [];
const P = (name: string, value: string | number | boolean): TiledProperty => ({
  name, type: typeof value === "number" ? (Number.isInteger(value) ? "int" : "float") : typeof value === "boolean" ? "bool" : "string", value,
});
const obj = (type: string, x: number, y: number, props: TiledProperty[], name = ""): TiledObject => ({
  id: nextId++, name, type, x: Math.round(x), y: Math.round(y), width: 0, height: 0, rotation: 0, visible: true, point: true, properties: props,
});

const campTiles = new Set<number>();
for (let i = 0; i < grid.length; i++) if (grid[i] === "camp_ground") campTiles.add(i);
const nearCamp = (tx: number, ty: number) => camps.some((c) => Math.hypot(tx - c.cx, ty - c.cy) < 8);
const nearCenter = (tx: number, ty: number) => Math.hypot(tx - center.x, ty - center.y) < 11;

// Decorations per terrain type: [kind, density, collisionRadius, scale range]
// Densities/colliders are tuned for the pixel-art sprites (trees are ~460 world units wide,
// so they are spaced out; collision radius covers the trunk only).
const decor: Partial<Record<TerrainId, [string, number, number, [number, number]][]>> = {
  forest_floor: [["tree_oak", 0.075, 30, [1, 1]], ["tree_birch", 0.012, 26, [1, 1]], ["bush", 0.05, 0, [1, 1]], ["fern", 0.05, 0, [1, 1]], ["log", 0.008, 40, [1, 1]], ["rock_small", 0.02, 0, [1, 1]], ["flowers", 0.03, 0, [1, 1]]],
  pine_floor: [["tree_pine", 0.09, 26, [1, 1]], ["fern", 0.035, 0, [1, 1]], ["bush", 0.02, 0, [1, 1]], ["rock_small", 0.02, 0, [1, 1]], ["flowers", 0.015, 0, [1, 1]]],
  grass: [["flowers", 0.06, 0, [1, 1]], ["bush", 0.02, 0, [1, 1]], ["tree_oak", 0.012, 30, [1, 1]], ["rock_small", 0.012, 0, [1, 1]], ["tall_grass", 0.03, 0, [1, 1]]],
  moor: [["heather", 0.06, 0, [1, 1]], ["tall_grass", 0.04, 0, [1, 1]], ["boulder", 0.01, 60, [1, 1]], ["gorse", 0.025, 0, [1, 1]]],
  marsh: [["reeds", 0.08, 0, [1, 1]], ["tree_willow", 0.012, 30, [1, 1]], ["lilypad", 0.02, 0, [1, 1]], ["tall_grass", 0.04, 0, [1, 1]]],
  sand: [["pebbles", 0.04, 0, [1, 1]], ["reeds", 0.02, 0, [1, 1]]],
  rock: [["boulder", 0.035, 60, [1, 1]], ["rock_small", 0.06, 0, [1, 1]], ["tree_pine", 0.012, 26, [1, 1]], ["heather", 0.03, 0, [1, 1]]],
  shallow_water: [["lilypad", 0.05, 0, [1, 1]], ["stepping_stone", 0.02, 0, [1, 1]]],
  cave_floor: [["crystal", 0.04, 0, [1, 1]], ["rock_small", 0.08, 0, [1, 1]], ["stalagmite", 0.035, 40, [1, 1]]],
};

const placedTrees: { x: number; y: number }[] = [];
const treeGrid = new Map<string, { x: number; y: number }[]>();
const tooCloseToTree = (x: number, y: number, min: number) => {
  const gx = Math.floor(x / 512), gy = Math.floor(y / 512);
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    for (const p of treeGrid.get(`${gx + ox},${gy + oy}`) ?? []) if (Math.hypot(p.x - x, p.y - y) < min) return true;
  }
  return false;
};
for (let ty = 0; ty < H; ty++) {
  for (let tx = 0; tx < W; tx++) {
    const t = grid[ty * W + tx];
    const list = decor[t];
    if (!list || nearCenter(tx, ty) && t !== "grass") continue;
    for (const [kind, density, coll, [s0, s1]] of list) {
      const blocking = coll > 0;
      if (blocking && (nearCamp(tx, ty) || nearCenter(tx, ty))) continue;
      // multiple chances for small decor
      const tries = blocking ? 1 : 2;
      for (let k = 0; k < tries; k++) {
        if (rng() >= density / tries) continue;
        const x = (tx + 0.15 + rng() * 0.7) * TS;
        const y = (ty + 0.15 + rng() * 0.7) * TS;
        const scale = s0 + rng() * (s1 - s0);
        if (kind.startsWith("tree")) {
          if (tooCloseToTree(x, y, 300)) continue;
          placedTrees.push({ x, y });
          const key = `${Math.floor(x / 512)},${Math.floor(y / 512)}`;
          treeGrid.set(key, [...(treeGrid.get(key) ?? []), { x, y }]);
        }
        objects.push(obj(kind, x, y, [P("scale", Math.round(scale * 100) / 100), P("collisionRadius", Math.round(coll * scale)), P("variant", Math.floor(rng() * 4))]));
      }
    }
  }
}

// Fourtrees: four great oaks around a central rock.
const fc = { x: (center.x + 0.5) * TS, y: (center.y + 0.5) * TS };
for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
  objects.push(obj("tree_great_oak", fc.x + ox * 640, fc.y + oy * 560, [P("scale", 1.6), P("collisionRadius", 48), P("variant", 0)]));
}
objects.push(obj("great_rock", fc.x, fc.y - 40, [P("scale", 1.4), P("collisionRadius", 90), P("variant", 0)]));

// Camp structures: dens, highrock, fresh-kill pile, medicine den.
const clanCampStructures: Record<ClanId, string> = {
  thunderclan: "highrock", shadowclan: "pine_stump", windclan: "tallrock", riverclan: "reed_mound", skyclan: "sky_rock",
};
for (const c of camps) {
  const cx = (c.cx + 0.5) * TS, cy = (c.cy + 0.5) * TS;
  const ring = 520;
  objects.push(obj(clanCampStructures[c.clan], cx, cy - ring * 0.85, [P("scale", 1.2), P("collisionRadius", 70), P("clan", c.clan)]));
  const dens: [string, number][] = [["warriors_den", -2.3], ["apprentices_den", -0.9], ["nursery", 2.4], ["elders_den", 0.6]];
  for (const [kind, ang] of dens) {
    objects.push(obj("den", cx + Math.cos(ang) * ring, cy + Math.sin(ang) * ring, [P("scale", 1), P("collisionRadius", 60), P("variant", dens.findIndex((d) => d[0] === kind)), P("clan", c.clan)], kind));
  }
  // Camp walls of bramble/bushes around the clearing, with an entrance.
  for (let a = 0; a < Math.PI * 2; a += 0.16) {
    if (Math.abs(a - Math.PI / 2) < 0.35) continue; // entrance at south
    const r = 7.2 * TS;
    objects.push(obj("bramble_wall", cx + Math.cos(a) * r, cy + Math.sin(a) * r, [P("scale", 1 + rng() * 0.3), P("collisionRadius", 58), P("variant", Math.floor(rng() * 4)), P("clan", c.clan)]));
  }
  const pile = { x: cx + 120, y: cy + 60 };
  const med = { x: cx - 620, y: cy + 200 };
  objects.push(obj("fresh_kill_pile", pile.x, pile.y, [P("scale", 1), P("collisionRadius", 0), P("clan", c.clan)]));
  objects.push(obj("den", med.x, med.y, [P("scale", 1.05), P("collisionRadius", 60), P("variant", 4), P("clan", c.clan)], "medicine_den"));
  locations.push(obj("camp", cx, cy, [P("clan", c.clan), P("radius", 7 * TS), P("locationId", `${c.clan}_camp`), P("description", `The heart of ${c.campName.replace(" Camp", "")}.`)], c.campName));
  locations.push(obj("fresh_kill_pile", pile.x, pile.y, [P("clan", c.clan), P("radius", 160), P("locationId", `${c.clan}_pile`)], "Fresh-kill Pile"));
  locations.push(obj("medicine_den", med.x, med.y + 90, [P("clan", c.clan), P("radius", 190), P("locationId", `${c.clan}_medicine_den`)], "Medicine Den"));
  locations.push(obj("spawn", cx, cy + 220, [P("clan", c.clan), P("radius", 200), P("locationId", `${c.clan}_spawn`)], `${c.campName} spawn`));
}
locations.push(obj("gathering", fc.x, fc.y + 200, [P("radius", 11 * TS), P("locationId", "fourtrees"), P("description", "A hollow where four great oaks stand. The Clans meet here in peace at every full moon.")], "Fourtrees"));
locations.push(obj("spawn", fc.x, fc.y + 500, [P("radius", 200), P("locationId", "loner_spawn")], "Loner spawn"));

// Landmarks to discover.
const landmark = (name: string, tx: number, ty: number, description: string) => {
  const x = (tx + 0.5) * TS, y = (ty + 0.5) * TS;
  locations.push(obj("landmark", x, y, [P("radius", 4 * TS), P("locationId", name.toLowerCase().replace(/[^a-z]+/g, "_")), P("description", description)], name));
};
landmark("Moonstone Cave", cave.x, cave.y, "A cave deep beneath the mountains, where a great stone glows under the moon.");
landmark("Sunningrocks", 58, 96, "Warm, flat rocks by the border - long fought over.");
landmark("Owl Tree", 22, 62, "An ancient hollow oak where an owl nests.");
landmark("Snakerocks", 42, 112, "A pile of boulders where adders lurk. Tread carefully.");
landmark("The Great Sycamore", 46, 70, "The tallest tree in the forest.");
landmark("Carrionplace", 84, 12, "A foul-smelling place at the edge of ShadowClan territory.");
landmark("Outlook Rock", 140, 46, "A high rock overlooking the moor.");
landmark("Gorge", 150, 18, "The river roars through a steep gorge here.");
landmark("Sandy Hollow", 30, 96, "A soft hollow where apprentices train.");
landmark("The Lake", lake.x, lake.y, "A wide, still lake teeming with fish.");
landmark("Gathering Stepping Stones", riverPath[88][0], 88, "Stones that let cats cross the river dry-pawed.");

// ---- Territories: rasterised regions converted to coarse polygons (one rectangle per 4x4 block for simplicity).
const territories: TiledObject[] = [];
const B = 4;
regions.forEach((r, ri) => {
  for (let by = 0; by < H; by += B) {
    let runStart = -1;
    for (let bx = 0; bx <= W; bx += B) {
      const mid = bx < W ? owner[(by + B / 2) * W + bx + B / 2] : -2;
      const inRegion = mid === ri;
      if (inRegion && runStart < 0) runStart = bx;
      if ((!inRegion || bx >= W) && runStart >= 0) {
        territories.push({ id: nextId++, name: r.clan, type: "territory", x: runStart * TS, y: by * TS, width: (bx - runStart) * TS, height: B * TS, rotation: 0, visible: true, properties: [P("clan", r.clan)] });
        runStart = -1;
      }
    }
  }
});

// ---- Write map ---------------------------------------------------------
const tilesetImage = "terrain-tileset.png";
const map: TiledMap = {
  type: "map", version: "1.10", tiledversion: "1.10.2", orientation: "orthogonal", renderorder: "right-down",
  width: W, height: H, tilewidth: TS, tileheight: TS, infinite: false,
  nextlayerid: 5, nextobjectid: nextId,
  properties: [P("name", "The Forest Territories"), P("seed", seed)],
  layers: [
    { type: "tilelayer", id: 1, name: "terrain", width: W, height: H, x: 0, y: 0, opacity: 1, visible: true, data: grid.map(gidOfTerrain) },
    { type: "objectgroup", id: 2, name: "territories", x: 0, y: 0, opacity: 0.3, visible: true, draworder: "topdown", objects: territories },
    { type: "objectgroup", id: 3, name: "objects", x: 0, y: 0, opacity: 1, visible: true, draworder: "topdown", objects },
    { type: "objectgroup", id: 4, name: "locations", x: 0, y: 0, opacity: 1, visible: true, draworder: "topdown", objects: locations },
  ],
  tilesets: [{
    firstgid: 1, name: "terrain", tilewidth: TS, tileheight: TS, tilecount: TERRAIN_ORDER.length, columns: TERRAIN_ORDER.length,
    image: tilesetImage, imagewidth: TS * TERRAIN_ORDER.length, imageheight: TS, margin: 0, spacing: 0,
  }],
};

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../packages/client/public/maps");
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "world.json"), JSON.stringify(map));
writeFileSync(resolve(outDir, tilesetImage), swatchPng());
console.log(`World generated (seed ${seed}): ${W}x${H} tiles, ${objects.length} objects, ${locations.length} locations, ${territories.length} territory blocks -> ${outDir}`);

/** Minimal PNG encoder producing one flat-colour swatch per terrain (for editing in Tiled). */
function swatchPng(): Buffer {
  const w = TS * TERRAIN_ORDER.length, h = TS;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const hex = TERRAIN[TERRAIN_ORDER[Math.floor(x / TS)]].palette[0];
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = parseInt(hex.slice(1, 3), 16);
      raw[o + 1] = parseInt(hex.slice(3, 5), 16);
      raw[o + 2] = parseInt(hex.slice(5, 7), 16);
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

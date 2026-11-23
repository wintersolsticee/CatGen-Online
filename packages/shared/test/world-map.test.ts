import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WorldMap, CLANS, gidOfTerrain, type TiledMap } from "../src/index.ts";

function tinyMap(): TiledMap {
  const W = 6, H = 6;
  const data = new Array(W * H).fill(gidOfTerrain("grass"));
  data[2 * W + 3] = gidOfTerrain("cliff");
  return {
    type: "map", version: "1.10", tiledversion: "1.10", orientation: "orthogonal", renderorder: "right-down",
    width: W, height: H, tilewidth: 128, tileheight: 128, infinite: false, nextlayerid: 3, nextobjectid: 3, tilesets: [],
    layers: [
      { type: "tilelayer", id: 1, name: "terrain", width: W, height: H, x: 0, y: 0, opacity: 1, visible: true, data },
      { type: "objectgroup", id: 2, name: "objects", x: 0, y: 0, opacity: 1, visible: true, draworder: "topdown", objects: [
        { id: 1, name: "", type: "boulder", x: 128, y: 640, width: 0, height: 0, rotation: 0, visible: true, properties: [{ name: "collisionRadius", type: "int", value: 40 }] },
      ] },
    ],
  };
}

describe("WorldMap", () => {
  it("blocks movement into cliffs and slides along them", () => {
    const m = new WorldMap(tinyMap());
    expect(m.collides(3.5 * 128, 2.5 * 128, 30)).toBe(true);
    const moved = m.moveWithCollision(2.5 * 128, 2.5 * 128, 200, 0, 30);
    expect(moved.x).toBeLessThan(3 * 128);
    const slid = m.moveWithCollision(2.5 * 128, 2.5 * 128, 200, 60, 30);
    expect(slid.y).toBeGreaterThan(2.5 * 128);
  });

  it("collides with object colliders", () => {
    const m = new WorldMap(tinyMap());
    expect(m.collides(128 + 50, 640, 30)).toBe(true);
    expect(m.collides(128 + 90, 640, 30)).toBe(false);
  });

  it("treats out-of-bounds as solid", () => {
    expect(new WorldMap(tinyMap()).collides(-10, 100, 20)).toBe(true);
  });

  it("the generated world has a camp, pile, den and territory for every Clan, and Fourtrees", () => {
    const json = JSON.parse(readFileSync(resolve(__dirname, "../../client/public/maps/world.json"), "utf8"));
    const m = new WorldMap(json);
    for (const c of CLANS) {
      const camp = m.location("camp", c.id);
      expect(camp, c.id).toBeDefined();
      expect(m.location("fresh_kill_pile", c.id)).toBeDefined();
      expect(m.location("medicine_den", c.id)).toBeDefined();
      expect(m.territoryAt(camp!.x, camp!.y)).toBe(c.id);
      const spawn = m.location("spawn", c.id)!;
      expect(m.collides(spawn.x, spawn.y, 34)).toBe(false);
    }
    expect(m.location("gathering")?.name).toBe("Fourtrees");
  });
});

/**
 * Terrain types used by the world map. The map's "terrain" tile layer stores
 * the index (+1, Tiled GID style) of each entry in TERRAIN_ORDER.
 * Append new terrain types to the END of TERRAIN_ORDER to keep existing maps valid.
 */
export type TerrainId =
  | "grass"
  | "forest_floor"
  | "pine_floor"
  | "moor"
  | "marsh"
  | "sand"
  | "rock"
  | "shallow_water"
  | "deep_water"
  | "cliff"
  | "camp_ground"
  | "cave_floor";

export interface TerrainDefinition {
  id: TerrainId;
  /** Can a cat walk on it? */
  walkable: boolean;
  /** Movement speed multiplier. */
  speedMul: number;
  /** Biome name used for prey and herb spawning. */
  biome: Biome;
  /** Base colours for procedural texture generation (client). */
  palette: readonly string[];
  /** Is the area indoors / underground (darker, no weather). */
  underground?: boolean;
}

export type Biome = "forest" | "pine" | "grassland" | "marsh" | "shore" | "rocky" | "water" | "camp" | "cave";

export const TERRAIN_ORDER: readonly TerrainId[] = [
  "grass",
  "forest_floor",
  "pine_floor",
  "moor",
  "marsh",
  "sand",
  "rock",
  "shallow_water",
  "deep_water",
  "cliff",
  "camp_ground",
  "cave_floor",
];

export const TERRAIN: Record<TerrainId, TerrainDefinition> = {
  grass: { id: "grass", walkable: true, speedMul: 1, biome: "grassland", palette: ["#6f9a43", "#82ad4f", "#5d8838", "#94bb5c"] },
  forest_floor: { id: "forest_floor", walkable: true, speedMul: 0.95, biome: "forest", palette: ["#5b6b33", "#6f6a3a", "#4c5a2b", "#7d7445"] },
  pine_floor: { id: "pine_floor", walkable: true, speedMul: 0.95, biome: "pine", palette: ["#5a4a36", "#6b5640", "#4a3d2e", "#3f5032"] },
  moor: { id: "moor", walkable: true, speedMul: 1.05, biome: "grassland", palette: ["#a3a25e", "#8d8f4f", "#b6b06d", "#8a7f5a"] },
  marsh: { id: "marsh", walkable: true, speedMul: 0.75, biome: "marsh", palette: ["#4f6a4a", "#5d7a55", "#3f5a45", "#6a7d5c"] },
  sand: { id: "sand", walkable: true, speedMul: 0.9, biome: "shore", palette: ["#d8c393", "#c9b07c", "#e2d0a5", "#bfa673"] },
  rock: { id: "rock", walkable: true, speedMul: 0.95, biome: "rocky", palette: ["#8b8780", "#9d978d", "#77736d", "#a9a399"] },
  shallow_water: { id: "shallow_water", walkable: true, speedMul: 0.55, biome: "water", palette: ["#4c8fae", "#5aa0bd", "#3f7f9f", "#6db0c8"] },
  deep_water: { id: "deep_water", walkable: false, speedMul: 0, biome: "water", palette: ["#2b5f80", "#336b8d", "#24526f", "#3b7799"] },
  cliff: { id: "cliff", walkable: false, speedMul: 0, biome: "rocky", palette: ["#6b625a", "#5a524b", "#7a7067", "#4b443e"] },
  camp_ground: { id: "camp_ground", walkable: true, speedMul: 1, biome: "camp", palette: ["#8c7a55", "#9a8660", "#7c6b4a", "#a69370"] },
  cave_floor: { id: "cave_floor", walkable: true, speedMul: 0.9, biome: "cave", palette: ["#4a4440", "#55504a", "#3d3834", "#5f5852"], underground: true },
};

export function terrainFromGid(gid: number): TerrainDefinition | undefined {
  const id = TERRAIN_ORDER[gid - 1];
  return id ? TERRAIN[id] : undefined;
}

export function gidOfTerrain(id: TerrainId): number {
  return TERRAIN_ORDER.indexOf(id) + 1;
}

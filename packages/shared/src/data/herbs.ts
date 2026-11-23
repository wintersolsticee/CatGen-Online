import type { Biome } from "./terrain.ts";
import type { ConditionId } from "./conditions.ts";

/**
 * Medicinal herbs. To add a herb, append an entry: it automatically becomes an
 * inventory item, spawns in the listed biomes and can treat its conditions.
 */
export interface HerbDefinition {
  id: string;
  name: string;
  description: string;
  /** Biomes in which this herb grows. */
  biomes: readonly Biome[];
  /** Relative spawn weight. */
  rarity: number;
  /** Conditions this herb cures. */
  treats: readonly ConditionId[];
  /** Health restored on use (in addition to curing). */
  heal: number;
  /** Visual description used by the client renderer. */
  look: { kind: "leafy" | "flower" | "berries" | "web" | "seeds" | "stalk"; color: string; accent: string };
  /** Using it outside its purpose may cause a side effect. */
  sideEffect?: ConditionId;
}

export const HERBS: readonly HerbDefinition[] = [
  { id: "cobweb", name: "Cobweb", description: "Pressed onto wounds to stop bleeding.", biomes: ["forest", "pine", "cave", "camp"], rarity: 3, treats: ["bleeding"], heal: 4, look: { kind: "web", color: "#e8eef2", accent: "#b9c6cf" } },
  { id: "marigold", name: "Marigold", description: "Chewed into a poultice to stop infection.", biomes: ["shore", "grassland"], rarity: 2, treats: ["infected_wound"], heal: 6, look: { kind: "flower", color: "#f29a1d", accent: "#4f7a2d" } },
  { id: "horsetail", name: "Horsetail", description: "Its juice treats infected wounds.", biomes: ["marsh", "shore"], rarity: 2, treats: ["infected_wound"], heal: 4, look: { kind: "stalk", color: "#5f8f3a", accent: "#3d6125" } },
  { id: "comfrey", name: "Comfrey Root", description: "Helps wrenched limbs and broken bones mend.", biomes: ["marsh", "forest"], rarity: 2, treats: ["sprained_leg"], heal: 5, look: { kind: "leafy", color: "#4a7d3b", accent: "#9b7bc4" } },
  { id: "dock", name: "Dock Leaf", description: "Soothes sore pads and scratches.", biomes: ["grassland", "forest", "camp"], rarity: 3, treats: ["sore_pads"], heal: 3, look: { kind: "leafy", color: "#5d9a44", accent: "#3a6b2a" } },
  { id: "juniper", name: "Juniper Berries", description: "Soothe bellyache and give strength.", biomes: ["rocky", "pine"], rarity: 2, treats: ["bellyache"], heal: 4, look: { kind: "berries", color: "#3d4f8a", accent: "#2f5c35" } },
  { id: "chervil", name: "Chervil", description: "Its root eases bellyache; leaves help infected wounds.", biomes: ["forest", "grassland"], rarity: 1, treats: ["bellyache", "infected_wound"], heal: 3, look: { kind: "flower", color: "#f2f2e6", accent: "#5c8f3e" } },
  { id: "tansy", name: "Tansy", description: "Cures coughs. Too much is harmful.", biomes: ["grassland", "shore"], rarity: 2, treats: ["whitecough"], heal: 2, look: { kind: "flower", color: "#f2d13a", accent: "#557f33" }, sideEffect: "bellyache" },
  { id: "catmint", name: "Catmint", description: "The best cure for greencough. Rare and precious.", biomes: ["camp", "grassland"], rarity: 0.6, treats: ["greencough", "whitecough"], heal: 6, look: { kind: "leafy", color: "#8fbf8a", accent: "#b89cd9" } },
  { id: "feverfew", name: "Feverfew", description: "Cools fevers and eases aches.", biomes: ["forest", "grassland"], rarity: 1.5, treats: ["fever"], heal: 3, look: { kind: "flower", color: "#ffffff", accent: "#f2c230" } },
  { id: "borage", name: "Borage Leaves", description: "Bring down fever.", biomes: ["shore", "marsh"], rarity: 1.5, treats: ["fever"], heal: 3, look: { kind: "flower", color: "#5a7fd9", accent: "#4f7f3a" } },
  { id: "yarrow", name: "Yarrow", description: "Makes a cat vomit up poison.", biomes: ["grassland", "rocky"], rarity: 1.5, treats: ["poisoned"], heal: 0, look: { kind: "flower", color: "#efe6d6", accent: "#6a8f4a" } },
  { id: "thyme", name: "Thyme", description: "Calms nerves and eases shock.", biomes: ["rocky", "grassland"], rarity: 1.5, treats: ["shock"], heal: 2, look: { kind: "leafy", color: "#6f8f5a", accent: "#c9a6d9" } },
  { id: "poppy_seed", name: "Poppy Seeds", description: "Ease pain and help a cat sleep and heal.", biomes: ["grassland", "camp"], rarity: 1, treats: [], heal: 15, look: { kind: "seeds", color: "#2b2b2b", accent: "#d93a3a" } },
];

export const HERB_IDS = HERBS.map((h) => h.id);

export function getHerb(id: string): HerbDefinition | undefined {
  return HERBS.find((h) => h.id === id);
}

import { HERBS } from "./herbs.ts";
import { PREY } from "./prey.ts";
import type { Biome } from "./terrain.ts";

/**
 * Unified item registry. Herbs and prey are derived from their own registries so
 * adding a herb or prey species never requires touching the inventory system.
 */
export type ItemCategory = "herb" | "prey" | "accessory" | "collectible";

export interface ItemDefinition {
  id: string;
  name: string;
  category: ItemCategory;
  description: string;
  maxStack: number;
  /** For accessories: which slot they are worn in. */
  slot?: AccessorySlot;
  /** For collectibles found in the world. */
  biomes?: readonly Biome[];
  color?: string;
}

export type AccessorySlot = "head" | "neck" | "back" | "tail";

/** Accessories and collectibles. Accessories may be equipped; collectibles are trophies/crafting material. */
const COSMETICS: ItemDefinition[] = [
  { id: "flower_crown", name: "Flower Crown", category: "accessory", slot: "head", description: "A crown of woven daisies.", maxStack: 1, color: "#f5f0d8" },
  { id: "feather_tuft", name: "Feather Tuft", category: "accessory", slot: "head", description: "A jay feather tucked behind an ear.", maxStack: 1, color: "#4a7fc1" },
  { id: "leaf_scarf", name: "Leaf Scarf", category: "accessory", slot: "neck", description: "A wrap of bright leaves.", maxStack: 1, color: "#c9632c" },
  { id: "shell_necklace", name: "Shell Necklace", category: "accessory", slot: "neck", description: "Tiny river shells on a vine.", maxStack: 1, color: "#efe3d0" },
  { id: "moss_cape", name: "Moss Cape", category: "accessory", slot: "back", description: "Soft moss draped across the shoulders.", maxStack: 1, color: "#5c8a3c" },
  { id: "tail_ribbon", name: "Tail Vine", category: "accessory", slot: "tail", description: "A flowering vine looped around the tail.", maxStack: 1, color: "#d97aa6" },
  { id: "feather", name: "Feather", category: "collectible", description: "A soft feather. Useful for lining nests.", maxStack: 20, biomes: ["forest", "grassland", "pine"], color: "#d9d2c0" },
  { id: "moss", name: "Moss", category: "collectible", description: "Soft moss for bedding, or for carrying water.", maxStack: 20, biomes: ["forest", "marsh", "cave", "pine"], color: "#6a9a45" },
  { id: "river_shell", name: "River Shell", category: "collectible", description: "A smooth shell from the riverbank.", maxStack: 20, biomes: ["shore"], color: "#efe3d0" },
  { id: "shiny_stone", name: "Shiny Stone", category: "collectible", description: "A glittering stone.", maxStack: 20, biomes: ["rocky", "cave"], color: "#b8c4d6" },
];

export const ITEMS: readonly ItemDefinition[] = [
  ...HERBS.map<ItemDefinition>((h) => ({ id: h.id, name: h.name, category: "herb", description: h.description, maxStack: 20, color: h.look.color, biomes: h.biomes })),
  ...PREY.map<ItemDefinition>((p) => ({ id: p.id, name: p.name, category: "prey", description: `Fresh-kill: restores ${p.foodValue} hunger.`, maxStack: 1, color: p.look.body })),
  ...COSMETICS,
];

const ITEM_MAP = new Map(ITEMS.map((i) => [i.id, i]));

export function getItem(id: string): ItemDefinition | undefined {
  return ITEM_MAP.get(id);
}

export function isItemId(v: unknown): v is string {
  return typeof v === "string" && ITEM_MAP.has(v);
}

/** Craft recipes: combine collectibles into wearable accessories. */
export interface Recipe {
  result: string;
  ingredients: Record<string, number>;
}

export const RECIPES: readonly Recipe[] = [
  { result: "flower_crown", ingredients: { feverfew: 2, marigold: 2 } },
  { result: "feather_tuft", ingredients: { feather: 3 } },
  { result: "shell_necklace", ingredients: { river_shell: 4 } },
  { result: "moss_cape", ingredients: { moss: 5 } },
  { result: "leaf_scarf", ingredients: { dock: 3, moss: 1 } },
  { result: "tail_ribbon", ingredients: { borage: 2, feather: 1 } },
];

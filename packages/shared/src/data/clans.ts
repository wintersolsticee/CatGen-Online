/**
 * The Clans of the forest. Names from Erin Hunter's Warriors series (credited in-game).
 * Add new Clans by appending to CLANS; territory ids must match the map's territory objects.
 */
export type ClanId = "thunderclan" | "riverclan" | "windclan" | "shadowclan" | "skyclan";

export interface ClanDefinition {
  id: ClanId;
  name: string;
  /** Primary UI colour (CSS hex). */
  color: string;
  description: string;
  /** Biome flavour of the Clan's home territory. */
  homeBiome: string;
}

export const CLANS: readonly ClanDefinition[] = [
  {
    id: "thunderclan",
    name: "ThunderClan",
    color: "#d9822b",
    description: "Brave forest cats who stalk prey through dense oak woodland and thick undergrowth.",
    homeBiome: "forest",
  },
  {
    id: "riverclan",
    name: "RiverClan",
    color: "#3a8fc4",
    description: "Sleek swimmers who fish the river and live among reeds and running water.",
    homeBiome: "marsh",
  },
  {
    id: "windclan",
    name: "WindClan",
    color: "#c9b45a",
    description: "Swift moorland runners who chase rabbits across open, windswept grassland.",
    homeBiome: "grassland",
  },
  {
    id: "shadowclan",
    name: "ShadowClan",
    color: "#6b5a8c",
    description: "Cunning cats of the dark pine forest and boggy marshland.",
    homeBiome: "pine",
  },
  {
    id: "skyclan",
    name: "SkyClan",
    color: "#7fb7d9",
    description: "Agile leapers who make their home among rocky cliffs and high places.",
    homeBiome: "rocky",
  },
] as const;

export const CLAN_IDS = CLANS.map((c) => c.id);

export function getClan(id: string | null | undefined): ClanDefinition | undefined {
  return CLANS.find((c) => c.id === id);
}

export function isClanId(id: unknown): id is ClanId {
  return typeof id === "string" && (CLAN_IDS as string[]).includes(id);
}

export type ClanRelation = "neutral" | "allied" | "rival";

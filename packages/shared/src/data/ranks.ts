/**
 * Clan ranks and the permissions they grant. Permissions are checked server-side
 * via systems/clan.ts; the UI uses the same data to hide unavailable actions.
 */
export type Rank =
  | "kit"
  | "apprentice"
  | "warrior"
  | "medicine_apprentice"
  | "medicine_cat"
  | "deputy"
  | "leader"
  | "elder";

export type ClanPermission =
  | "promote"
  | "announce"
  | "set_relations"
  | "access_herb_store"
  | "identify_all_herbs"
  | "fight"
  | "hunt"
  | "eat_from_pile"
  | "leave_camp_alone";

export interface RankDefinition {
  id: Rank;
  name: string;
  /** Higher = more authority. Used for "can act on lower ranks" rules. */
  authority: number;
  permissions: readonly ClanPermission[];
  /** Multiplier applied to combat damage (kits are weak). */
  combatMultiplier: number;
  description: string;
}

const COMMON: ClanPermission[] = ["eat_from_pile"];

export const RANKS: Record<Rank, RankDefinition> = {
  kit: {
    id: "kit",
    name: "Kit",
    authority: 0,
    permissions: [...COMMON],
    combatMultiplier: 0.3,
    description: "A young cat who must stay near camp.",
  },
  apprentice: {
    id: "apprentice",
    name: "Apprentice",
    authority: 1,
    permissions: [...COMMON, "fight", "hunt", "leave_camp_alone"],
    combatMultiplier: 0.8,
    description: "Training to become a warrior.",
  },
  medicine_apprentice: {
    id: "medicine_apprentice",
    name: "Medicine Cat Apprentice",
    authority: 1,
    permissions: [...COMMON, "hunt", "leave_camp_alone", "access_herb_store"],
    combatMultiplier: 0.6,
    description: "Learning the ways of herbs and healing.",
  },
  warrior: {
    id: "warrior",
    name: "Warrior",
    authority: 2,
    permissions: [...COMMON, "fight", "hunt", "leave_camp_alone"],
    combatMultiplier: 1,
    description: "Defends and feeds the Clan.",
  },
  elder: {
    id: "elder",
    name: "Elder",
    authority: 2,
    permissions: [...COMMON, "leave_camp_alone"],
    combatMultiplier: 0.5,
    description: "A respected retired cat who passes on Clan wisdom.",
  },
  medicine_cat: {
    id: "medicine_cat",
    name: "Medicine Cat",
    authority: 3,
    permissions: [...COMMON, "hunt", "leave_camp_alone", "access_herb_store", "identify_all_herbs", "announce"],
    combatMultiplier: 0.6,
    description: "Heals the Clan and interprets signs from StarClan.",
  },
  deputy: {
    id: "deputy",
    name: "Deputy",
    authority: 4,
    permissions: [...COMMON, "fight", "hunt", "leave_camp_alone", "promote", "announce"],
    combatMultiplier: 1.1,
    description: "Second-in-command; organises patrols.",
  },
  leader: {
    id: "leader",
    name: "Leader",
    authority: 5,
    permissions: [
      ...COMMON,
      "fight",
      "hunt",
      "leave_camp_alone",
      "promote",
      "announce",
      "set_relations",
      "access_herb_store",
    ],
    combatMultiplier: 1.2,
    description: "Leads the Clan with StarClan's blessing.",
  },
};

export const RANK_IDS = Object.keys(RANKS) as Rank[];

export function isRank(v: unknown): v is Rank {
  return typeof v === "string" && v in RANKS;
}

/** Ranks a brand-new character may start as. */
export const STARTING_RANKS: Rank[] = ["kit", "apprentice", "medicine_apprentice", "warrior"];

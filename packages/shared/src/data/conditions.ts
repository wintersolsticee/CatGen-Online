/**
 * Injuries and illnesses. Each condition modifies gameplay while active.
 * Herbs (data/herbs.ts) list the conditions they treat.
 */
export type ConditionId =
  | "bleeding"
  | "infected_wound"
  | "sprained_leg"
  | "sore_pads"
  | "bellyache"
  | "whitecough"
  | "greencough"
  | "fever"
  | "poisoned"
  | "shock";

export type ConditionCategory = "wound" | "illness" | "poison" | "other";

export interface ConditionDefinition {
  id: ConditionId;
  name: string;
  category: ConditionCategory;
  description: string;
  /** Health lost per second while active. */
  healthDrainPerSec: number;
  /** Movement speed multiplier. */
  speedMul: number;
  /** Stamina regeneration multiplier. */
  staminaRegenMul: number;
  /** Outgoing combat damage multiplier. */
  attackMul: number;
  /** Seconds after which an untreated condition recovers by itself (undefined = never). */
  naturalRecoverySec?: number;
  /** Untreated, the condition can worsen into another after this many seconds. */
  worsensTo?: { condition: ConditionId; afterSec: number };
}

export const CONDITIONS: Record<ConditionId, ConditionDefinition> = {
  bleeding: {
    id: "bleeding",
    name: "Bleeding Wound",
    category: "wound",
    description: "An open wound that keeps bleeding. Cobwebs will stop it.",
    healthDrainPerSec: 0.35,
    speedMul: 1,
    staminaRegenMul: 0.85,
    attackMul: 1,
    naturalRecoverySec: 240,
    worsensTo: { condition: "infected_wound", afterSec: 180 },
  },
  infected_wound: {
    id: "infected_wound",
    name: "Infected Wound",
    category: "wound",
    description: "A wound that has turned bad. Marigold or horsetail fight infection.",
    healthDrainPerSec: 0.2,
    speedMul: 0.9,
    staminaRegenMul: 0.7,
    attackMul: 0.85,
    worsensTo: { condition: "fever", afterSec: 300 },
  },
  sprained_leg: {
    id: "sprained_leg",
    name: "Sprained Leg",
    category: "wound",
    description: "A wrenched leg that makes running painful. Comfrey root helps it mend.",
    healthDrainPerSec: 0,
    speedMul: 0.65,
    staminaRegenMul: 1,
    attackMul: 0.9,
    naturalRecoverySec: 400,
  },
  sore_pads: {
    id: "sore_pads",
    name: "Sore Pads",
    category: "wound",
    description: "Cracked, sore paw pads. Dock leaves soothe them.",
    healthDrainPerSec: 0,
    speedMul: 0.85,
    staminaRegenMul: 1,
    attackMul: 1,
    naturalRecoverySec: 200,
  },
  bellyache: {
    id: "bellyache",
    name: "Bellyache",
    category: "illness",
    description: "An aching belly. Juniper berries or chervil settle it.",
    healthDrainPerSec: 0.05,
    speedMul: 0.95,
    staminaRegenMul: 0.6,
    attackMul: 0.9,
    naturalRecoverySec: 240,
  },
  whitecough: {
    id: "whitecough",
    name: "Whitecough",
    category: "illness",
    description: "A mild cough. Tansy or catmint cure it before it becomes greencough.",
    healthDrainPerSec: 0.03,
    speedMul: 1,
    staminaRegenMul: 0.75,
    attackMul: 1,
    worsensTo: { condition: "greencough", afterSec: 420 },
  },
  greencough: {
    id: "greencough",
    name: "Greencough",
    category: "illness",
    description: "A deadly sickness of leaf-bare. Only catmint can cure it.",
    healthDrainPerSec: 0.25,
    speedMul: 0.75,
    staminaRegenMul: 0.4,
    attackMul: 0.6,
  },
  fever: {
    id: "fever",
    name: "Fever",
    category: "illness",
    description: "A burning fever. Feverfew or borage bring it down.",
    healthDrainPerSec: 0.12,
    speedMul: 0.85,
    staminaRegenMul: 0.6,
    attackMul: 0.8,
    naturalRecoverySec: 500,
  },
  poisoned: {
    id: "poisoned",
    name: "Poisoned",
    category: "poison",
    description: "Something poisonous was eaten. Yarrow will make the cat sick it up.",
    healthDrainPerSec: 0.4,
    speedMul: 0.8,
    staminaRegenMul: 0.5,
    attackMul: 0.7,
  },
  shock: {
    id: "shock",
    name: "Shock",
    category: "other",
    description: "Shaken after a hard fight. Thyme calms a cat in shock.",
    healthDrainPerSec: 0,
    speedMul: 0.9,
    staminaRegenMul: 0.5,
    attackMul: 0.85,
    naturalRecoverySec: 90,
  },
};

export const CONDITION_IDS = Object.keys(CONDITIONS) as ConditionId[];

export function isConditionId(v: unknown): v is ConditionId {
  return typeof v === "string" && v in CONDITIONS;
}

/**
 * Character appearance model.
 *
 * Appearance is stored as JSON in the database. It carries a `version` so that
 * older saves can be migrated forward (see migrateAppearance). Every field is
 * validated and defaulted by normalizeAppearance, so adding a new option never
 * invalidates existing characters: unknown/missing values fall back to defaults.
 *
 * To add an option: append it to the relevant *_OPTIONS list and teach the
 * client renderer (packages/client/src/render/cat) how to draw it.
 */

export const APPEARANCE_VERSION = 3;

/**
 * Hand-drawn cat sprites ("Pet Cats Pack" by LuizMelo, CC0). Each id maps to
 * packages/client/public/assets/cats/<id>/. Append new sprites; never rename ids.
 */
export const CAT_SPRITES = [
  { id: "cat-1", name: "Ginger", baseColor: "#b07a2a" },
  { id: "cat-2", name: "Black", baseColor: "#222222" },
  { id: "cat-3", name: "Siamese", baseColor: "#e6e2dc" },
  { id: "cat-4", name: "Hairless", baseColor: "#c49a8a" },
  { id: "cat-5", name: "Fluffy White", baseColor: "#f2f0ea" },
  { id: "cat-6", name: "Grey Tabby", baseColor: "#8a8a8a" },
] as const;
export type CatSpriteId = (typeof CAT_SPRITES)[number]["id"];
export const CAT_SPRITE_IDS = CAT_SPRITES.map((c) => c.id) as readonly CatSpriteId[];

/** Coat shades: recolours applied to the chosen sprite (see client render/cat-sprites.ts). */
export const COAT_OPTIONS = ["natural", "light", "dark", "warm", "cool", "golden", "silver", "smoky", "rusty"] as const;
export type CoatShade = (typeof COAT_OPTIONS)[number];

export const PATTERN_OPTIONS = ["solid", "tabby", "mackerel", "spotted", "ticked", "tortoiseshell", "calico", "bicolor", "tuxedo", "colorpoint", "smoke"] as const;
export const MARKING_OPTIONS = ["chest", "socks", "stockings", "blaze", "muzzle", "belly", "tail_tip", "ear_tips"] as const;
export const EAR_OPTIONS = ["pointed", "rounded", "tufted", "folded", "large"] as const;
export const TAIL_OPTIONS = ["long", "fluffy", "short", "bobbed", "thin"] as const;
export const FUR_LENGTH_OPTIONS = ["short", "medium", "long"] as const;
export const BODY_OPTIONS = ["slim", "average", "stocky"] as const;
export const MUZZLE_OPTIONS = ["narrow", "round", "broad"] as const;
export const EYE_SHAPE_OPTIONS = ["round", "almond", "narrow"] as const;
export const SCAR_OPTIONS = ["eye_scar", "ear_nick", "nose_scar", "shoulder_scar", "torn_ear", "blind_eye"] as const;

export type Pattern = (typeof PATTERN_OPTIONS)[number];
export type Marking = (typeof MARKING_OPTIONS)[number];
export type EarShape = (typeof EAR_OPTIONS)[number];
export type TailType = (typeof TAIL_OPTIONS)[number];
export type FurLength = (typeof FUR_LENGTH_OPTIONS)[number];
export type BodyType = (typeof BODY_OPTIONS)[number];
export type MuzzleShape = (typeof MUZZLE_OPTIONS)[number];
export type EyeShape = (typeof EYE_SHAPE_OPTIONS)[number];
export type Scar = (typeof SCAR_OPTIONS)[number];

export interface Appearance {
  version: number;
  /** Which hand-drawn cat sprite is used. */
  sprite: CatSpriteId;
  /** Recolour applied to the sprite. */
  coat: CoatShade;
  baseColor: string;
  secondaryColor: string;
  pattern: Pattern;
  patternIntensity: number; // 0..1
  markings: Marking[];
  markingColor: string;
  eyeColor: string;
  /** Second eye colour for heterochromia; null for matching eyes. */
  eyeColorRight: string | null;
  eyeShape: EyeShape;
  earShape: EarShape;
  tailType: TailType;
  furLength: FurLength;
  bodyType: BodyType;
  muzzle: MuzzleShape;
  noseColor: string;
  innerEarColor: string;
  /** Overall size multiplier, 0.85..1.15. */
  size: number;
  scars: Scar[];
}

/** Curated fur colours for the creator (any valid hex is accepted though). */
export const FUR_PALETTE = [
  "#f4efe6", "#e6d3b3", "#d9b98c", "#e8a25c", "#d2691e", "#b5562a", "#8b4a2b", "#6b4a35",
  "#4a3628", "#2b2320", "#1a1a1a", "#3d3d42", "#6e6e75", "#9c9ca3", "#b8b2a7", "#c7a27c",
  "#a8865f", "#7d6a55", "#c8b6a0", "#f0dcc0",
] as const;

export const EYE_PALETTE = ["#f2c230", "#e89a2c", "#6fbf3a", "#3a9f5a", "#3a8fd9", "#7fc8e8", "#a2672e", "#c9d93a", "#8a6fd9", "#e0e0e0"] as const;

export const DEFAULT_APPEARANCE: Readonly<Appearance> = Object.freeze({
  version: APPEARANCE_VERSION,
  sprite: "cat-1",
  coat: "natural",
  baseColor: "#d2691e",
  secondaryColor: "#8b4a2b",
  pattern: "tabby",
  patternIntensity: 0.7,
  markings: ["chest"],
  markingColor: "#f4efe6",
  eyeColor: "#6fbf3a",
  eyeColorRight: null,
  eyeShape: "almond",
  earShape: "pointed",
  tailType: "long",
  furLength: "medium",
  bodyType: "average",
  muzzle: "round",
  noseColor: "#d98a8a",
  innerEarColor: "#e8a8a0",
  size: 1,
  scars: [],
} as Appearance);

const HEX = /^#[0-9a-fA-F]{6}$/;

function color(v: unknown, fallback: string): string {
  return typeof v === "string" && HEX.test(v) ? v.toLowerCase() : fallback;
}

function oneOf<T extends string>(v: unknown, options: readonly T[], fallback: T): T {
  return typeof v === "string" && (options as readonly string[]).includes(v) ? (v as T) : fallback;
}

function subsetOf<T extends string>(v: unknown, options: readonly T[], max: number): T[] {
  if (!Array.isArray(v)) return [];
  const out: T[] = [];
  for (const x of v) {
    if (typeof x === "string" && (options as readonly string[]).includes(x) && !out.includes(x as T)) out.push(x as T);
    if (out.length >= max) break;
  }
  return out;
}

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

/**
 * Upgrade raw stored appearance data from older versions.
 * v1 -> v2: v1 had `whiteMarkings: string` (single) and `eyes: string`.
 */
export function migrateAppearance(raw: Record<string, unknown>): Record<string, unknown> {
  const data = { ...raw };
  const version = typeof data.version === "number" ? data.version : 1;
  if (version < 2) {
    if (typeof data.whiteMarkings === "string" && data.whiteMarkings !== "none") data.markings = [data.whiteMarkings];
    if (typeof data.eyes === "string" && data.eyeColor === undefined) data.eyeColor = data.eyes;
    delete data.whiteMarkings;
    delete data.eyes;
    data.version = 2;
  }
  if ((data.version as number) < 3) {
    // v2 -> v3: cats became hand-drawn sprites. Pick the sprite closest to the old fur colour.
    if (data.sprite === undefined) data.sprite = closestSprite(typeof data.baseColor === "string" ? data.baseColor : "#d2691e");
    data.version = 3;
  }
  return data;
}

function closestSprite(hex: string): CatSpriteId {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) || 0);
  const [r, g, b] = rgb(HEX.test(hex) ? hex : "#d2691e");
  let best: CatSpriteId = "cat-1";
  let bestD = Infinity;
  for (const c of CAT_SPRITES) {
    const [r2, g2, b2] = rgb(c.baseColor);
    const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (d < bestD) { bestD = d; best = c.id; }
  }
  return best;
}

/** Validate + default an appearance object coming from the client or the database. Never throws. */
export function normalizeAppearance(input: unknown): Appearance {
  const raw = input && typeof input === "object" ? migrateAppearance(input as Record<string, unknown>) : {};
  const d = DEFAULT_APPEARANCE;
  return {
    version: APPEARANCE_VERSION,
    sprite: oneOf(raw.sprite, CAT_SPRITE_IDS, d.sprite),
    coat: oneOf(raw.coat, COAT_OPTIONS, d.coat),
    baseColor: color(raw.baseColor, d.baseColor),
    secondaryColor: color(raw.secondaryColor, d.secondaryColor),
    pattern: oneOf(raw.pattern, PATTERN_OPTIONS, d.pattern),
    patternIntensity: clampNum(raw.patternIntensity, 0, 1, d.patternIntensity),
    markings: raw.markings === undefined ? [...d.markings] : subsetOf(raw.markings, MARKING_OPTIONS, MARKING_OPTIONS.length),
    markingColor: color(raw.markingColor, d.markingColor),
    eyeColor: color(raw.eyeColor, d.eyeColor),
    eyeColorRight: raw.eyeColorRight === null || raw.eyeColorRight === undefined ? null : color(raw.eyeColorRight, d.eyeColor),
    eyeShape: oneOf(raw.eyeShape, EYE_SHAPE_OPTIONS, d.eyeShape),
    earShape: oneOf(raw.earShape, EAR_OPTIONS, d.earShape),
    tailType: oneOf(raw.tailType, TAIL_OPTIONS, d.tailType),
    furLength: oneOf(raw.furLength, FUR_LENGTH_OPTIONS, d.furLength),
    bodyType: oneOf(raw.bodyType, BODY_OPTIONS, d.bodyType),
    muzzle: oneOf(raw.muzzle, MUZZLE_OPTIONS, d.muzzle),
    noseColor: color(raw.noseColor, d.noseColor),
    innerEarColor: color(raw.innerEarColor, d.innerEarColor),
    size: clampNum(raw.size, 0.85, 1.15, d.size),
    scars: subsetOf(raw.scars, SCAR_OPTIONS, 4),
  };
}

/** Produce a random but pleasant appearance (used by the "randomise" button and NPC-free tests). */
export function randomAppearance(rand: () => number = Math.random): Appearance {
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
  const markings = MARKING_OPTIONS.filter(() => rand() < 0.22);
  return normalizeAppearance({
    sprite: pick(CAT_SPRITE_IDS),
    coat: rand() < 0.5 ? "natural" : pick(COAT_OPTIONS),
    baseColor: pick(FUR_PALETTE),
    secondaryColor: pick(FUR_PALETTE),
    pattern: pick(PATTERN_OPTIONS),
    patternIntensity: 0.4 + rand() * 0.6,
    markings,
    markingColor: rand() < 0.85 ? "#f4efe6" : pick(FUR_PALETTE),
    eyeColor: pick(EYE_PALETTE),
    eyeColorRight: rand() < 0.06 ? pick(EYE_PALETTE) : null,
    eyeShape: pick(EYE_SHAPE_OPTIONS),
    earShape: pick(EAR_OPTIONS),
    tailType: pick(TAIL_OPTIONS),
    furLength: pick(FUR_LENGTH_OPTIONS),
    bodyType: pick(BODY_OPTIONS),
    muzzle: pick(MUZZLE_OPTIONS),
    size: 0.9 + rand() * 0.2,
  });
}

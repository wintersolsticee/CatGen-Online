/**
 * Centralised, tunable game constants shared by client and server.
 * Change values here rather than hard-coding them in systems.
 */
export const GAME_CONFIG = {
  /** World tile size in pixels. Terrain art is authored at this size (or multiples of it). */
  tileSize: 128,
  /** Server simulation rate. */
  tickRate: 20,
  /** How often (ms) players' state is persisted while online. */
  autosaveIntervalMs: 60_000,

  movement: {
    walkSpeed: 210, // px / second
    runSpeed: 380,
    stalkSpeed: 110,
    /** Radius of the cat's collision circle. */
    collisionRadius: 34,
    /** Max distance the server tolerates between client-predicted and server position before snapping. */
    reconcileThreshold: 120,
  },

  stats: {
    maxHealth: 100,
    maxStamina: 100,
    maxHunger: 100,
    staminaRegenPerSec: 9,
    runStaminaCostPerSec: 12,
    healthRegenPerSec: 0.6,
    /** Hunger lost per in-game second. */
    hungerDecayPerSec: 0.035,
    /** Health lost per second while starving (hunger 0). */
    starvingDamagePerSec: 0.4,
  },

  time: {
    /** Real-time milliseconds for one full in-game day. */
    dayLengthMs: 24 * 60_000,
    /** In-game days per season. */
    daysPerSeason: 4,
    /** A Gathering occurs every N days (full moon). */
    gatheringEveryDays: 4,
  },

  interaction: {
    range: 130,
    preyCatchRange: 120,
    carryLimit: 2,
  },

  chat: {
    proximityRadius: 900,
    maxLength: 240,
    /** Minimum ms between chat messages from one player. */
    rateLimitMs: 700,
  },

  world: {
    maxPrey: 70,
    maxHerbNodes: 120,
    herbRespawnMs: 90_000,
    preyRespawnMs: 6_000,
    weatherChangeMs: 4 * 60_000,
  },
} as const;

export type GameConfig = typeof GAME_CONFIG;

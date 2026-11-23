import type { Biome } from "./terrain.ts";

/**
 * Prey species. Behaviours are simulated by the server (systems/prey-ai lives in the server).
 * Add species here; they spawn automatically in their biomes.
 */
export type PreyBehaviour = "skittish" | "runner" | "flier" | "swimmer" | "climber";

export interface PreyDefinition {
  id: string;
  name: string;
  biomes: readonly Biome[];
  behaviour: PreyBehaviour;
  /** Wander speed / flee speed in px/s. */
  speed: number;
  fleeSpeed: number;
  /** Distance at which prey notices a (non-stalking) cat. Stalking halves this. */
  alertRadius: number;
  /** Hunger restored when eaten. */
  foodValue: number;
  /** Spawn weight. */
  weight: number;
  /** Render size (px) and colours. */
  look: { size: number; body: string; belly: string; shape: "mouse" | "rabbit" | "bird" | "squirrel" | "fish" | "frog" | "vole" | "lizard" };
}

export const PREY: readonly PreyDefinition[] = [
  { id: "mouse", name: "Mouse", biomes: ["forest", "grassland", "pine", "camp"], behaviour: "skittish", speed: 45, fleeSpeed: 260, alertRadius: 240, foodValue: 18, weight: 4, look: { size: 34, body: "#8a7563", belly: "#c9b8a6", shape: "mouse" } },
  { id: "vole", name: "Vole", biomes: ["marsh", "grassland", "shore"], behaviour: "skittish", speed: 40, fleeSpeed: 240, alertRadius: 220, foodValue: 20, weight: 3, look: { size: 36, body: "#6e5a46", belly: "#a8957f", shape: "vole" } },
  { id: "rabbit", name: "Rabbit", biomes: ["grassland"], behaviour: "runner", speed: 70, fleeSpeed: 430, alertRadius: 380, foodValue: 45, weight: 3, look: { size: 62, body: "#9c8670", belly: "#e3d8c8", shape: "rabbit" } },
  { id: "squirrel", name: "Squirrel", biomes: ["forest", "pine"], behaviour: "climber", speed: 80, fleeSpeed: 340, alertRadius: 300, foodValue: 30, weight: 2.5, look: { size: 46, body: "#a65d2e", belly: "#e8c9a8", shape: "squirrel" } },
  { id: "thrush", name: "Thrush", biomes: ["forest", "grassland", "pine"], behaviour: "flier", speed: 50, fleeSpeed: 520, alertRadius: 300, foodValue: 22, weight: 2.5, look: { size: 36, body: "#7a6047", belly: "#e6d3b0", shape: "bird" } },
  { id: "fish", name: "Fish", biomes: ["water"], behaviour: "swimmer", speed: 60, fleeSpeed: 260, alertRadius: 200, foodValue: 32, weight: 3, look: { size: 44, body: "#7f9aa8", belly: "#d9e4e8", shape: "fish" } },
  { id: "frog", name: "Frog", biomes: ["marsh", "shore"], behaviour: "skittish", speed: 30, fleeSpeed: 220, alertRadius: 200, foodValue: 14, weight: 2.5, look: { size: 32, body: "#5c8a3c", belly: "#c9d98a", shape: "frog" } },
  { id: "lizard", name: "Lizard", biomes: ["rocky", "shore"], behaviour: "runner", speed: 55, fleeSpeed: 300, alertRadius: 230, foodValue: 12, weight: 2, look: { size: 34, body: "#7d7a4a", belly: "#b5b07a", shape: "lizard" } },
];

export const PREY_IDS = PREY.map((p) => p.id);

export function getPrey(id: string): PreyDefinition | undefined {
  return PREY.find((p) => p.id === id);
}

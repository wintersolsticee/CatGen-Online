import { GAME_CONFIG } from "../config.ts";

export type Season = "newleaf" | "greenleaf" | "leaffall" | "leafbare";
export const SEASONS: Season[] = ["newleaf", "greenleaf", "leaffall", "leafbare"];
export const SEASON_NAMES: Record<Season, string> = {
  newleaf: "Newleaf",
  greenleaf: "Greenleaf",
  leaffall: "Leaf-fall",
  leafbare: "Leaf-bare",
};

export type Weather = "clear" | "cloudy" | "rain" | "storm" | "fog" | "snow";

export interface WorldClock {
  /** Whole in-game days since the world began. */
  day: number;
  /** 0..24 fractional hour. */
  hour: number;
  season: Season;
  /** 0 (dark) .. 1 (full daylight). */
  daylight: number;
  isNight: boolean;
  /** Is a Gathering (full-moon truce) happening tonight? */
  isGathering: boolean;
  /** 0..1 lunar phase; 0.5 = full moon. */
  moonPhase: number;
}

/** Derive the world clock from elapsed world time (ms). Deterministic and shared. */
export function getWorldClock(worldTimeMs: number): WorldClock {
  const { dayLengthMs, daysPerSeason, gatheringEveryDays } = GAME_CONFIG.time;
  const totalDays = worldTimeMs / dayLengthMs;
  const day = Math.floor(totalDays);
  const hour = (totalDays - day) * 24;
  const season = SEASONS[Math.floor(day / daysPerSeason) % SEASONS.length];
  // Smooth daylight curve: dawn ~5-7, dusk ~19-21.
  const sun = Math.sin(((hour - 6) / 24) * Math.PI * 2);
  const daylight = Math.max(0, Math.min(1, sun * 1.6 + 0.35));
  const isNight = hour < 5.5 || hour > 20.5;
  const moonPhase = ((day % gatheringEveryDays) + hour / 24) / gatheringEveryDays;
  const isGathering = day % gatheringEveryDays === gatheringEveryDays - 1 && (hour >= 20 || hour < 2);
  return { day, hour, season, daylight, isNight, isGathering, moonPhase };
}

/** Weather probabilities per season. */
export const WEATHER_TABLE: Record<Season, [Weather, number][]> = {
  newleaf: [["clear", 4], ["cloudy", 3], ["rain", 3], ["fog", 1], ["storm", 0.5]],
  greenleaf: [["clear", 6], ["cloudy", 2], ["rain", 1], ["storm", 1]],
  leaffall: [["clear", 2], ["cloudy", 3], ["rain", 3], ["fog", 2], ["storm", 1]],
  leafbare: [["clear", 2], ["cloudy", 3], ["snow", 4], ["fog", 1]],
};

export function rollWeather(season: Season, rng: () => number): Weather {
  const table = WEATHER_TABLE[season];
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [w, weight] of table) {
    r -= weight;
    if (r <= 0) return w;
  }
  return table[0][0];
}

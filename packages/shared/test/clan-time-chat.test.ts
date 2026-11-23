import { describe, it, expect } from "vitest";
import { canChangeRank, getWorldClock, GAME_CONFIG, filterChat, sanitizeChat, hasPermission, skillLevel, xpForLevel } from "../src/index.ts";

const cat = (id: string, rank: Parameters<typeof canChangeRank>[0]["rank"], clan: string | null = "thunderclan") => ({ id, rank, clan });

describe("clan permissions", () => {
  it("leader can make an apprentice a warrior and name a deputy", () => {
    expect(canChangeRank(cat("a", "leader"), cat("b", "apprentice"), "warrior", false).ok).toBe(true);
    expect(canChangeRank(cat("a", "leader"), cat("b", "warrior"), "deputy", false).ok).toBe(true);
    expect(canChangeRank(cat("a", "leader"), cat("b", "warrior"), "deputy", true).ok).toBe(false);
  });

  it("deputy cannot appoint a deputy or promote higher ranks", () => {
    expect(canChangeRank(cat("a", "deputy"), cat("b", "warrior"), "deputy", false).ok).toBe(false);
    expect(canChangeRank(cat("a", "deputy"), cat("b", "medicine_cat"), "elder", false).ok).toBe(true);
    expect(canChangeRank(cat("a", "deputy"), cat("b", "kit"), "apprentice", false).ok).toBe(true);
  });

  it("warriors cannot hold ceremonies; other Clans are off limits", () => {
    expect(canChangeRank(cat("a", "warrior"), cat("b", "kit"), "apprentice", false).ok).toBe(false);
    expect(canChangeRank(cat("a", "leader"), cat("b", "kit", "windclan"), "apprentice", false).ok).toBe(false);
    expect(canChangeRank(cat("a", "leader"), cat("b", "kit"), "warrior", false).ok).toBe(false); // must be apprenticed first
  });

  it("only medicine ranks access the herb store", () => {
    expect(hasPermission("medicine_cat", "access_herb_store")).toBe(true);
    expect(hasPermission("warrior", "access_herb_store")).toBe(false);
  });
});

describe("world clock", () => {
  it("cycles day/night and seasons deterministically", () => {
    const day = GAME_CONFIG.time.dayLengthMs;
    expect(getWorldClock(day * 0.5).isNight).toBe(false);
    expect(getWorldClock(day * 0.01).isNight).toBe(true);
    expect(getWorldClock(0).season).toBe("newleaf");
    expect(getWorldClock(day * GAME_CONFIG.time.daysPerSeason).season).toBe("greenleaf");
  });

  it("has a gathering at night on the full-moon day", () => {
    const d = GAME_CONFIG.time.dayLengthMs;
    const fullMoonDay = GAME_CONFIG.time.gatheringEveryDays - 1;
    expect(getWorldClock(d * fullMoonDay + d * (22 / 24)).isGathering).toBe(true);
    expect(getWorldClock(d * fullMoonDay + d * (12 / 24)).isGathering).toBe(false);
  });
});

describe("chat", () => {
  it("sanitises and filters", () => {
    expect(sanitizeChat("  hi\u0000   there  ")).toBe("hi there");
    expect(sanitizeChat("   ")).toBeNull();
    expect(filterChat("what the shit")).toBe("what the s***");
    expect(filterChat("Shitake? no: classic")).not.toContain("classic*");
  });
});

describe("progression", () => {
  it("levels follow the curve", () => {
    expect(skillLevel(0)).toBe(0);
    expect(skillLevel(xpForLevel(3))).toBe(3);
    expect(skillLevel(xpForLevel(3) - 1)).toBe(2);
  });
});

import { describe, it, expect } from "vitest";
import { normalizeAppearance, DEFAULT_APPEARANCE, APPEARANCE_VERSION, randomAppearance, mulberry32 } from "../src/index.ts";

describe("appearance", () => {
  it("defaults missing or garbage input", () => {
    expect(normalizeAppearance(undefined)).toEqual({ ...DEFAULT_APPEARANCE });
    expect(normalizeAppearance("nope")).toEqual({ ...DEFAULT_APPEARANCE });
  });

  it("rejects invalid values field by field without discarding valid ones", () => {
    const a = normalizeAppearance({ baseColor: "#ABCDEF", pattern: "plaid", eyeColor: "red", size: 99, markings: ["socks", "bogus", "socks"] });
    expect(a.baseColor).toBe("#abcdef");
    expect(a.pattern).toBe(DEFAULT_APPEARANCE.pattern);
    expect(a.eyeColor).toBe(DEFAULT_APPEARANCE.eyeColor);
    expect(a.size).toBe(1.15);
    expect(a.markings).toEqual(["socks"]);
  });

  it("migrates v1 saves (regression: old characters must stay loadable)", () => {
    const v1 = { version: 1, baseColor: "#222222", whiteMarkings: "blaze", eyes: "#3a8fd9" };
    const a = normalizeAppearance(v1);
    expect(a.version).toBe(APPEARANCE_VERSION);
    expect(a.markings).toEqual(["blaze"]);
    expect(a.eyeColor).toBe("#3a8fd9");
    expect(a.baseColor).toBe("#222222");
  });

  it("migrates v2 code-drawn cats to the closest sprite", () => {
    expect(normalizeAppearance({ version: 2, baseColor: "#1a1a1a" }).sprite).toBe("cat-2");
    expect(normalizeAppearance({ version: 2, baseColor: "#f4efe6" }).sprite).toBe("cat-5");
    expect(normalizeAppearance({ version: 2, baseColor: "#b5562a" }).sprite).toBe("cat-1");
    expect(normalizeAppearance({ sprite: "cat-99", coat: "plaid" })).toMatchObject({ sprite: "cat-1", coat: "natural" });
  });

  it("random appearances are always valid", () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 50; i++) {
      const a = randomAppearance(rng);
      expect(normalizeAppearance(a)).toEqual(a);
    }
  });
});

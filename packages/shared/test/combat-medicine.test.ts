import { describe, it, expect } from "vitest";
import { resolveAttack, canUseMove, applyHerb, tickConditions, addCondition, getConditionModifiers, type Combatant } from "../src/index.ts";

const base = (over: Partial<Combatant> = {}): Combatant => ({
  x: 0, y: 0, facing: 0, stamina: 100, rank: "warrior", conditions: [], fightingXp: 0, blockingUntil: 0, dodgingUntil: 0, cooldowns: {}, ...over,
});
const rngConst = (v: number) => () => v;

describe("combat", () => {
  it("hits a target in front and in range", () => {
    const out = resolveAttack(base(), base({ x: 80, facing: Math.PI }), "swipe", 1000, rngConst(0.5));
    expect(out.hit).toBe(true);
    expect(out.damage).toBeCloseTo(8, 1);
  });

  it("misses targets behind or out of range", () => {
    expect(resolveAttack(base(), base({ x: -80 }), "swipe", 0, rngConst(0.5)).hit).toBe(false);
    expect(resolveAttack(base(), base({ x: 500 }), "swipe", 0, rngConst(0.5)).hit).toBe(false);
  });

  it("dodging avoids all damage; blocking from the front reduces it", () => {
    const dodge = resolveAttack(base(), base({ x: 80, dodgingUntil: 2000 }), "bite", 1000, rngConst(0.5));
    expect(dodge.dodged).toBe(true);
    expect(dodge.damage).toBe(0);
    const block = resolveAttack(base(), base({ x: 80, facing: Math.PI, blockingUntil: 2000 }), "bite", 1000, rngConst(0.5));
    expect(block.blocked).toBe(true);
    expect(block.damage).toBeCloseTo(15 * 0.3, 1);
    // Block facing away does not help.
    const back = resolveAttack(base(), base({ x: 80, facing: 0, blockingUntil: 2000 }), "bite", 1000, rngConst(0.5));
    expect(back.blocked).toBe(false);
  });

  it("injuries weaken attacks (combat <-> medical integration)", () => {
    const hurt = base({ conditions: [{ id: "infected_wound", elapsedSec: 0 }] });
    const out = resolveAttack(hurt, base({ x: 80 }), "swipe", 0, rngConst(0.5));
    expect(out.damage).toBeLessThan(8);
  });

  it("inflicts injuries on an unlucky hit", () => {
    expect(resolveAttack(base(), base({ x: 80 }), "bite", 0, rngConst(0.01)).injury).toBe("bleeding");
  });

  it("respects cooldown and stamina", () => {
    expect(canUseMove(base({ cooldowns: { swipe: 5000 } }), "swipe", 1000)).toEqual({ ok: false, reason: "cooldown" });
    expect(canUseMove(base({ stamina: 2 }), "swipe", 1000)).toEqual({ ok: false, reason: "stamina" });
    expect(canUseMove(base({ rank: "elder" }), "bite", 0)).toEqual({ ok: false, reason: "rank" });
  });
});

describe("conditions & herbs", () => {
  it("cobweb stops bleeding", () => {
    const res = applyHerb([{ id: "bleeding", elapsedSec: 3 }], "cobweb", 0);
    expect(res.cured).toEqual(["bleeding"]);
    expect(res.conditions).toEqual([]);
  });

  it("the wrong herb does not cure, and tansy has a side effect", () => {
    const res = applyHerb([{ id: "bleeding", elapsedSec: 0 }], "tansy", 0);
    expect(res.cured).toEqual([]);
    expect(res.sideEffect).toBe("bellyache");
    expect(res.conditions.map((c) => c.id).sort()).toEqual(["bellyache", "bleeding"]);
  });

  it("untreated bleeding becomes infected, whitecough becomes greencough", () => {
    expect(tickConditions([{ id: "bleeding", elapsedSec: 179 }], 2).conditions.map((c) => c.id)).toEqual(["infected_wound"]);
    expect(tickConditions([{ id: "whitecough", elapsedSec: 419 }], 2).conditions.map((c) => c.id)).toEqual(["greencough"]);
  });

  it("does not add a milder form of an existing illness", () => {
    expect(addCondition([{ id: "greencough", elapsedSec: 0 }], "whitecough").map((c) => c.id)).toEqual(["greencough"]);
  });

  it("modifiers stack multiplicatively", () => {
    const m = getConditionModifiers([{ id: "sprained_leg", elapsedSec: 0 }, { id: "sore_pads", elapsedSec: 0 }]);
    expect(m.speedMul).toBeCloseTo(0.65 * 0.85);
  });
});

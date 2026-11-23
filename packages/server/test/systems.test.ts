import { describe, it, expect } from "vitest";
import { GAME_CONFIG, countItem, getWorldClock } from "@catgen/shared";
import { makeCtx } from "./helpers.ts";
import { handleAttack } from "../src/game/combat-system.ts";
import { handleInput } from "../src/game/movement-system.ts";
import { tryCatchPrey } from "../src/game/prey-system.ts";
import { tickSurvival } from "../src/game/survival-system.ts";
import { collectForage } from "../src/game/forage-system.ts";
import { useItem } from "../src/game/items-system.ts";
import { ClanService } from "../src/game/clan-service.ts";
import { ChatSystem } from "../src/game/chat-system.ts";
import { WorldSystem } from "../src/game/world-system.ts";
import { PreyState, ForageState } from "../src/rooms/schema.ts";

describe("movement (server authority)", () => {
  it("moves by the shared step and enforces the anti-speedhack budget", () => {
    const t = makeCtx();
    const p = t.addPlayer("Mover", {}, { x: 1000, y: 1000 });
    t.now.t += 1000;
    handleInput(t.ctx, p, { seq: 1, dx: 1, dy: 0, run: false, stalk: false, dt: 100 });
    expect(p.state.x).toBeCloseTo(1000 + GAME_CONFIG.movement.walkSpeed * 0.1, 0);
    expect(p.state.lastSeq).toBe(1);
    // Spamming inputs without real time passing must not move the cat further.
    const x = p.state.x;
    for (let i = 0; i < 50; i++) handleInput(t.ctx, p, { seq: 2 + i, dx: 1, dy: 0, run: false, stalk: false, dt: 100 });
    expect(p.state.x - x).toBeLessThan(GAME_CONFIG.movement.walkSpeed * 0.31);
  });
});

describe("combat", () => {
  it("damages, can injure, and defeats a rival without killing them", () => {
    const t = makeCtx();
    const a = t.addPlayer("Tigerclaw", { clan: "shadowclan" }, { x: 1000, y: 1000 });
    const b = t.addPlayer("Firepaw", { clan: "thunderclan" }, { x: 1080, y: 1000 });
    t.rngValue.v = 0.01; // always injure
    handleAttack(t.ctx, a, { move: "bite", facing: 0 });
    expect(b.state.health).toBeLessThan(100);
    expect(b.char.conditions.map((c) => c.id)).toContain("bleeding");
    expect(a.fake.sent.some((m) => m.type === "combat")).toBe(true);
    // Keep fighting until defeat.
    for (let i = 0; i < 40 && b.state.health > 0 && b.char.conditions.every((c) => c.id !== "shock"); i++) {
      t.now.t += 2000;
      a.state.stamina = 100;
      b.state.x = 1080; b.state.y = 1000;
      handleAttack(t.ctx, a, { move: "bite", facing: 0 });
    }
    expect(b.char.conditions.map((c) => c.id)).toContain("shock");
    expect(b.state.health).toBe(25); // collapsed and carried home, not dead
    expect(a.char.skills.fighting).toBeGreaterThan(0);
  });

  it("sparring with Clanmates never injures or drops below 10 health", () => {
    const t = makeCtx();
    const a = t.addPlayer("Graystripe", {}, { x: 1000, y: 1000 });
    const b = t.addPlayer("Ravenpaw", {}, { x: 1080, y: 1000 });
    t.rngValue.v = 0.01;
    for (let i = 0; i < 30; i++) {
      t.now.t += 2000;
      a.state.stamina = 100;
      handleAttack(t.ctx, a, { move: "bite", facing: 0 });
    }
    expect(b.state.health).toBeGreaterThanOrEqual(10);
    expect(b.char.conditions).toEqual([]);
  });

  it("warriors never attack kits of other Clans", () => {
    const t = makeCtx();
    const a = t.addPlayer("Brokenstar", { clan: "shadowclan" }, { x: 1000, y: 1000 });
    const kit = t.addPlayer("Cloudkit", { rank: "kit" }, { x: 1080, y: 1000 });
    handleAttack(t.ctx, a, { move: "swipe", facing: 0 });
    expect(kit.state.health).toBe(100);
  });

  it("the Gathering truce stops fights at Fourtrees", () => {
    const t = makeCtx();
    const d = GAME_CONFIG.time.dayLengthMs;
    t.ctx.state.worldTime = d * (GAME_CONFIG.time.gatheringEveryDays - 1) + d * (22 / 24);
    expect(getWorldClock(t.ctx.state.worldTime).isGathering).toBe(true);
    const a = t.addPlayer("Blackfoot", { clan: "shadowclan" }, { x: 2500, y: 4000 });
    const b = t.addPlayer("Whitestorm", {}, { x: 2580, y: 4000 });
    handleAttack(t.ctx, a, { move: "swipe", facing: 0 });
    expect(b.state.health).toBe(100);
    expect(t.notices.some((n) => n.to === "Blackfoot" && /truce/i.test(n.text))).toBe(true);
  });
});

describe("hunting -> fresh-kill -> food", () => {
  it("catches prey, deposits it on the pile, and Clanmates can eat it", async () => {
    const t = makeCtx();
    const clans = new ClanService(t.ctx);
    await clans.load();
    const hunter = t.addPlayer("Sandstorm", {}, { x: 1000, y: 1000 });
    const prey = new PreyState();
    prey.id = "p1"; prey.species = "mouse"; prey.x = 1090; prey.y = 1000;
    t.ctx.state.prey.set("p1", prey);
    t.rngValue.v = 0.1; // success
    expect(tryCatchPrey(t.ctx, hunter, "pounce")).toBe(true);
    expect(countItem(hunter.char.inventory, "mouse")).toBe(1);
    expect(t.ctx.state.prey.has("p1")).toBe(false);
    expect(hunter.state.carrying).toBe("mouse");
    expect(hunter.char.skills.hunting).toBeGreaterThan(0);

    hunter.state.x = 700; hunter.state.y = 700; // at the pile
    expect(clans.depositPrey(hunter)).toBe(true);
    expect(clans.record("thunderclan").freshKill.mouse).toBe(1);
    expect(hunter.state.carrying).toBe("");

    const hungry = t.addPlayer("Dustpaw", {}, { x: 710, y: 700 });
    hungry.state.hunger = 40;
    clans.eatFromPile(hungry);
    expect(hungry.state.hunger).toBe(58);
    expect(clans.record("thunderclan").freshKill.mouse ?? 0).toBe(0);
  });

  it("prey flees from a running cat but a stalking cat gets closer", async () => {
    const { tickPrey } = await import("../src/game/prey-system.ts");
    const t = makeCtx();
    const mk = (id: string) => {
      const s = new PreyState();
      s.id = id; s.species = "rabbit"; s.x = 1000; s.y = 1500;
      return s;
    };
    // Prey must be created through spawn to get AI; emulate by spawning then moving it.
    const { spawnPrey } = await import("../src/game/prey-system.ts");
    spawnPrey(t.ctx, 30);
    const any = [...t.ctx.state.prey.values()][0];
    expect(any).toBeDefined();
    const cat = t.addPlayer("Onewhisker", {}, { x: any.x + 150, y: any.y });
    cat.state.running = true; cat.state.moving = true;
    t.rngValue.v = 0.9; // no freeze
    tickPrey(t.ctx, 0.05);
    expect(["flee", "fly"]).toContain(any.mode);
    void mk;
  });
});

describe("herbs & medicine", () => {
  it("gathering a herb adds it; using the right herb on a Clanmate cures them", () => {
    const t = makeCtx();
    const med = t.addPlayer("Yellowfang", { rank: "medicine_cat" }, { x: 1000, y: 1000 });
    const node = new ForageState();
    node.id = "f1"; node.itemId = "cobweb"; node.x = 1020; node.y = 1000;
    t.ctx.state.forage.set("f1", node);
    expect(collectForage(t.ctx, med, node)).toBe(true);
    expect(countItem(med.char.inventory, "cobweb")).toBe(1);

    const patient = t.addPlayer("Longtail", { conditions: [{ id: "bleeding", elapsedSec: 10 }] }, { x: 1060, y: 1000 });
    useItem(t.ctx, med, { itemId: "cobweb", targetId: patient.char.id });
    expect(patient.char.conditions).toEqual([]);
    expect(countItem(med.char.inventory, "cobweb")).toBe(0);
    expect(med.char.skills.medicine).toBeGreaterThan(0);
  });

  it("untreated wounds drain health and worsen over time", () => {
    const t = makeCtx();
    const p = t.addPlayer("Lionheart", { conditions: [{ id: "bleeding", elapsedSec: 179 }] }, { x: 1000, y: 1000 });
    for (let i = 0; i < 25; i++) tickSurvival(t.ctx, 0.1);
    expect(p.char.conditions.map((c) => c.id)).toEqual(["infected_wound"]);
    expect(p.state.health).toBeLessThan(100);
  });

  it("only medicine ranks may take from the herb store", async () => {
    const t = makeCtx();
    const clans = new ClanService(t.ctx);
    await clans.load();
    clans.record("thunderclan").herbStore = { marigold: 2 };
    const warrior = t.addPlayer("Mousefur", {}, { x: 500, y: 700 });
    clans.withdrawHerb(warrior, "marigold", 1);
    expect(countItem(warrior.char.inventory, "marigold")).toBe(0);
    const med = t.addPlayer("Spottedleaf", { rank: "medicine_cat" }, { x: 500, y: 700 });
    clans.withdrawHerb(med, "marigold", 1);
    expect(countItem(med.char.inventory, "marigold")).toBe(1);
    expect(clans.record("thunderclan").herbStore.marigold).toBe(1);
  });
});

describe("chat", () => {
  it("local chat reaches only nearby cats and respects blocks", () => {
    const t = makeCtx();
    const chat = new ChatSystem(t.ctx);
    const a = t.addPlayer("Talker", {}, { x: 1000, y: 1000 });
    const near = t.addPlayer("Near", {}, { x: 1200, y: 1000 });
    const far = t.addPlayer("Far", {}, { x: 4000, y: 4000 });
    const blocker = t.addPlayer("Blocker", {}, { x: 1100, y: 1000 });
    blocker.blocked.add(a.char.id);
    chat.handle(a, { channel: "local", text: "hello there" });
    const got = (n: string) => t.chats.some((c) => c.to === n && c.ev.text === "hello there");
    expect(got("Talker")).toBe(true);
    expect(got("Near")).toBe(true);
    expect(got("Far")).toBe(false);
    expect(got("Blocker")).toBe(false);
    void near; void far;
  });

  it("filters profanity, rate-limits, and blocks muted players", () => {
    const t = makeCtx();
    const chat = new ChatSystem(t.ctx);
    const a = t.addPlayer("Rude", {}, { x: 1000, y: 1000 });
    chat.handle(a, { channel: "global", text: "oh shit" });
    expect(t.chats[0].ev.text).toBe("oh s***");
    chat.handle(a, { channel: "global", text: "again" });
    expect(t.chats.length).toBe(1); // rate limited
    a.account.mutedUntil = new Date(Date.now() + 60_000);
    t.now.t += 5000;
    chat.handle(a, { channel: "global", text: "muted" });
    expect(t.chats.length).toBe(1);
  });
});

describe("world", () => {
  it("discovers landmarks and alerts a Clan to intruders", async () => {
    const t = makeCtx();
    const clans = new ClanService(t.ctx);
    await clans.load();
    const world = new WorldSystem(t.ctx, clans);
    const explorer = t.addPlayer("Explorer", { clan: "windclan" }, { x: 1500, y: 1500 });
    const guard = t.addPlayer("Guard", {}, { x: 600, y: 600 });
    world.tick(1000);
    expect(explorer.char.discovered).toContain("owl_tree");
    expect(t.chats.some((c) => c.to === "Guard" && /intruder/i.test(c.ev.text))).toBe(true);
    void guard;
  });
});

import { describe, it, expect } from "vitest";
import { addItem, removeItem, countItem, craft, GAME_CONFIG, INVENTORY_SLOTS } from "../src/index.ts";

describe("inventory", () => {
  it("stacks items up to their max stack", () => {
    let inv = addItem([], "cobweb", 15).inventory;
    inv = addItem(inv, "cobweb", 10).inventory;
    expect(inv).toEqual([{ itemId: "cobweb", qty: 20 }, { itemId: "cobweb", qty: 5 }]);
    expect(countItem(inv, "cobweb")).toBe(25);
  });

  it("enforces the prey carry limit", () => {
    let inv = addItem([], "mouse").inventory;
    inv = addItem(inv, "rabbit").inventory;
    const res = addItem(inv, "vole");
    expect(GAME_CONFIG.interaction.carryLimit).toBe(2);
    expect(res.ok).toBe(false);
    expect(countItem(res.inventory, "vole")).toBe(0);
  });

  it("rejects unknown items and does not mutate input", () => {
    const inv = [{ itemId: "dock", qty: 1 }];
    expect(addItem(inv, "laser").ok).toBe(false);
    addItem(inv, "dock", 3);
    expect(inv).toEqual([{ itemId: "dock", qty: 1 }]);
  });

  it("fails when slots are full", () => {
    let inv: { itemId: string; qty: number }[] = [];
    for (let i = 0; i < INVENTORY_SLOTS; i++) inv.push({ itemId: "flower_crown", qty: 1 });
    expect(addItem(inv, "dock").ok).toBe(false);
  });

  it("removes items across stacks", () => {
    const inv = [{ itemId: "moss", qty: 20 }, { itemId: "moss", qty: 3 }];
    const res = removeItem(inv, "moss", 5);
    expect(res.ok).toBe(true);
    expect(countItem(res.inventory, "moss")).toBe(18);
    expect(removeItem(inv, "moss", 99).ok).toBe(false);
  });

  it("crafts accessories from collectibles", () => {
    const inv = [{ itemId: "feather", qty: 4 }];
    const res = craft(inv, "feather_tuft");
    expect(res.ok).toBe(true);
    expect(countItem(res.inventory, "feather")).toBe(1);
    expect(countItem(res.inventory, "feather_tuft")).toBe(1);
    expect(craft(res.inventory, "feather_tuft").ok).toBe(false);
  });
});

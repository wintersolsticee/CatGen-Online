import { getItem, RECIPES, type Recipe } from "../data/items.ts";
import { GAME_CONFIG } from "../config.ts";

/**
 * Pure inventory operations. Inventories are arrays of stacks; functions return
 * new arrays and never mutate their input, which makes them trivially testable
 * and safe to use for client-side previews.
 */
export interface InventoryStack {
  itemId: string;
  qty: number;
}

export const INVENTORY_SLOTS = 24;

export interface InventoryResult {
  ok: boolean;
  inventory: InventoryStack[];
  /** Quantity actually added/removed. */
  moved: number;
  error?: string;
}

export function countItem(inv: readonly InventoryStack[], itemId: string): number {
  return inv.reduce((n, s) => (s.itemId === itemId ? n + s.qty : n), 0);
}

export function countCategory(inv: readonly InventoryStack[], category: string): number {
  return inv.reduce((n, s) => (getItem(s.itemId)?.category === category ? n + s.qty : n), 0);
}

/** Add items, filling existing stacks first. Prey obeys the carry limit (a cat's mouth is small). */
export function addItem(inv: readonly InventoryStack[], itemId: string, qty = 1, slots = INVENTORY_SLOTS): InventoryResult {
  const def = getItem(itemId);
  if (!def) return { ok: false, inventory: [...inv], moved: 0, error: "Unknown item." };
  if (qty <= 0) return { ok: false, inventory: [...inv], moved: 0, error: "Invalid quantity." };

  let remaining = qty;
  if (def.category === "prey") {
    const room = GAME_CONFIG.interaction.carryLimit - countCategory(inv, "prey");
    if (room <= 0) return { ok: false, inventory: [...inv], moved: 0, error: "Your mouth is full! Drop prey at the fresh-kill pile." };
    remaining = Math.min(remaining, room);
  }
  const out = inv.map((s) => ({ ...s }));
  for (const s of out) {
    if (remaining <= 0) break;
    if (s.itemId !== itemId) continue;
    const space = def.maxStack - s.qty;
    const take = Math.min(space, remaining);
    s.qty += take;
    remaining -= take;
  }
  while (remaining > 0 && out.length < slots) {
    const take = Math.min(def.maxStack, remaining);
    out.push({ itemId, qty: take });
    remaining -= take;
  }
  const added = countItem(out, itemId) - countItem(inv, itemId);
  if (added === 0) return { ok: false, inventory: [...inv], moved: 0, error: "Inventory full." };
  return { ok: true, inventory: out, moved: added };
}

export function removeItem(inv: readonly InventoryStack[], itemId: string, qty = 1): InventoryResult {
  if (qty <= 0 || countItem(inv, itemId) < qty) return { ok: false, inventory: [...inv], moved: 0, error: "Not enough items." };
  let remaining = qty;
  const out: InventoryStack[] = [];
  // Remove from the last stacks first so the first stack stays stable in the UI.
  const copy = inv.map((s) => ({ ...s }));
  for (let i = copy.length - 1; i >= 0; i--) {
    const s = copy[i];
    if (remaining > 0 && s.itemId === itemId) {
      const take = Math.min(s.qty, remaining);
      s.qty -= take;
      remaining -= take;
    }
  }
  for (const s of copy) if (s.qty > 0) out.push(s);
  return { ok: true, inventory: out, moved: qty };
}

export function canCraft(inv: readonly InventoryStack[], recipe: Recipe): boolean {
  return Object.entries(recipe.ingredients).every(([id, n]) => countItem(inv, id) >= n);
}

export function craft(inv: readonly InventoryStack[], resultId: string): InventoryResult {
  const recipe = RECIPES.find((r) => r.result === resultId);
  if (!recipe) return { ok: false, inventory: [...inv], moved: 0, error: "Unknown recipe." };
  if (!canCraft(inv, recipe)) return { ok: false, inventory: [...inv], moved: 0, error: "Missing ingredients." };
  let cur: InventoryStack[] = [...inv];
  for (const [id, n] of Object.entries(recipe.ingredients)) cur = removeItem(cur, id, n).inventory;
  const res = addItem(cur, resultId, 1);
  if (!res.ok) return { ok: false, inventory: [...inv], moved: 0, error: res.error };
  return res;
}

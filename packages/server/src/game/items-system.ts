import {
  GAME_CONFIG, CONDITIONS, applyHerb, craft, getItem, getPrey, removeItem, countItem, herbDisplayName,
  type AccessorySlot, type UseItemMsg,
} from "@catgen/shared";
import type { GameContext, PlayerRuntime } from "./context.ts";
import { markDirty } from "./players.ts";

export function useItem(ctx: GameContext, p: PlayerRuntime, msg: UseItemMsg) {
  const item = getItem(msg.itemId);
  if (!item || countItem(p.char.inventory, item.id) < 1) return;

  if (item.category === "prey") {
    const food = getPrey(item.id)?.foodValue ?? 10;
    p.char.inventory = removeItem(p.char.inventory, item.id, 1).inventory;
    p.state.hunger = Math.min(GAME_CONFIG.stats.maxHunger, p.state.hunger + food);
    p.state.pose = "eat";
    markDirty(p);
    ctx.notify(p, "info", `You eat the ${item.name.toLowerCase()}.${p.char.clan ? " (A loyal warrior feeds the Clan first...)" : ""}`);
    return;
  }

  if (item.category === "herb") {
    let target = p;
    if (msg.targetId) {
      const t = ctx.playerByCharId(msg.targetId);
      if (!t || Math.hypot(t.state.x - p.state.x, t.state.y - p.state.y) > GAME_CONFIG.interaction.range * 1.5) {
        return ctx.notify(p, "warning", "Get closer to treat that cat.");
      }
      target = t;
    }
    const res = applyHerb(target.char.conditions, item.id, p.char.skills.medicine);
    p.char.inventory = removeItem(p.char.inventory, item.id, 1).inventory;
    target.char.conditions = res.conditions;
    target.state.health = Math.min(GAME_CONFIG.stats.maxHealth, target.state.health + res.heal);
    // Using a herb teaches you what it is.
    if (!p.char.knownHerbs.includes(item.id)) p.char.knownHerbs = [...p.char.knownHerbs, item.id];
    const who = target === p ? "yourself" : target.char.name;
    if (res.cured.length) {
      const names = res.cured.map((c) => CONDITIONS[c].name.toLowerCase()).join(" and ");
      ctx.notify(p, "success", `You treat ${who} with ${item.name}. The ${names} is cured!`);
      if (target !== p) ctx.notify(target, "success", `${p.char.name} treated your ${names} with ${item.name}.`);
      for (let i = 0; i < res.cured.length; i++) ctx.awardXp(p, "treatCondition");
    } else if (res.sideEffect) {
      ctx.notify(p, "error", `${item.name} wasn't needed, and gave ${who} ${CONDITIONS[res.sideEffect].name.toLowerCase()}!`);
    } else {
      ctx.notify(p, "info", `You use ${herbDisplayName(p.char.rank, p.char.knownHerbs, item.id)} on ${who}. ${res.heal >= 10 ? "It eases the pain." : "Nothing much happens."}`);
    }
    markDirty(p);
    if (target !== p) markDirty(target);
    return;
  }

  if (item.category === "accessory" && item.slot) {
    equip(ctx, p, item.slot, p.char.equipped[item.slot] === item.id ? null : item.id);
  }
}

export function equip(ctx: GameContext, p: PlayerRuntime, slot: AccessorySlot, itemId: string | null) {
  if (itemId === null) {
    delete p.char.equipped[slot];
  } else {
    const item = getItem(itemId);
    if (!item || item.slot !== slot || countItem(p.char.inventory, itemId) < 1) return ctx.notify(p, "warning", "You can't wear that there.");
    p.char.equipped[slot] = itemId;
  }
  markDirty(p);
}

export function dropItem(ctx: GameContext, p: PlayerRuntime, itemId: string) {
  const res = removeItem(p.char.inventory, itemId, 1);
  if (!res.ok) return;
  p.char.inventory = res.inventory;
  for (const [slot, id] of Object.entries(p.char.equipped)) {
    if (id === itemId && countItem(p.char.inventory, itemId) === 0) delete p.char.equipped[slot as AccessorySlot];
  }
  markDirty(p);
}

export function craftItem(ctx: GameContext, p: PlayerRuntime, resultId: string) {
  const res = craft(p.char.inventory, resultId);
  if (!res.ok) return ctx.notify(p, "warning", res.error ?? "You can't make that.");
  p.char.inventory = res.inventory;
  markDirty(p);
  ctx.notify(p, "success", `You made a ${getItem(resultId)!.name}!`);
}

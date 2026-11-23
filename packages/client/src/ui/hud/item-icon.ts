import { getItem, getHerb, getPrey } from "@catgen/shared";
import { forageArt, preyArt, pixelate } from "../../render/object-textures.ts";
import { WORLD_PIXEL } from "../../render/env-assets.ts";
import { h } from "../dom.ts";
import { icon, type IconName } from "../icons.ts";

const cache = new Map<string, string>();

/** Item icon as a data URL (rendered with the in-world art). */
export function itemIconUrl(itemId: string): string {
  const hit = cache.get(itemId);
  if (hit) return hit;
  const item = getItem(itemId);
  const prey = getPrey(itemId);
  const art = prey ? preyArt(prey) : forageArt(getHerb(itemId) ?? null, itemId, item?.color ?? "#ccc");
  // Same pixel grid as in the world, so icons match what the player sees on the ground.
  const url = pixelate(art.canvas, prey ? 0.5 : 0.75, WORLD_PIXEL).toDataURL();
  cache.set(itemId, url);
  return url;
}

/** Accessories have no world sprite, so they use matching game-icons.net icons. */
const ACCESSORY_ICONS: Record<string, IconName> = {
  flower_crown: "crown", feather_tuft: "feather", leaf_scarf: "leaf", shell_necklace: "necklace", moss_cape: "cape", tail_ribbon: "knot",
};

export function itemIcon(itemId: string, size = 44): HTMLElement {
  const acc = ACCESSORY_ICONS[itemId];
  if (acc) {
    const el = icon(acc);
    el.style.fontSize = `${Math.round(size * 0.7)}px`;
    el.style.color = getItem(itemId)?.color ?? "#f0b75a";
    el.style.filter = "drop-shadow(0 1px 0 rgba(0,0,0,.6))";
    el.title = getItem(itemId)?.name ?? itemId;
    return el;
  }
  return h("img", { src: itemIconUrl(itemId), width: size, height: size, style: "object-fit:contain", alt: getItem(itemId)?.name ?? itemId });
}

import { getItem, getHerb, getPrey } from "@catgen/shared";
import { forageArt, preyArt } from "../../render/object-textures.ts";
import { h } from "../dom.ts";

const cache = new Map<string, string>();

/** Item icon as a data URL (rendered with the in-world art). */
export function itemIconUrl(itemId: string): string {
  const hit = cache.get(itemId);
  if (hit) return hit;
  const item = getItem(itemId);
  const prey = getPrey(itemId);
  const art = prey ? preyArt(prey) : forageArt(getHerb(itemId) ?? null, itemId, item?.color ?? "#ccc");
  const url = art.canvas.toDataURL();
  cache.set(itemId, url);
  return url;
}

export function itemIcon(itemId: string, size = 44): HTMLImageElement {
  return h("img", { src: itemIconUrl(itemId), width: size, height: size, style: "object-fit:contain", alt: getItem(itemId)?.name ?? itemId });
}

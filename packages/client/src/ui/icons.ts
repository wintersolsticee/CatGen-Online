/**
 * Icons from game-icons.net (CC BY 3.0, authors in the file names; see ASSET_CREDITS.md).
 * Rendered as CSS masks so they take the surrounding text colour.
 */
import { h } from "./dom.ts";

const ICONS = {
  swipe: "lorc_claw-slashes", bite: "skoll_fangs", pounce: "sbed_pounce", block: "lorc_edged-shield", dodge: "lorc_dodging",
  stalk: "lorc_footprint", interact: "lorc_hand", inventory: "lorc_knapsack", clan: "lorc_campfire", friends: "delapouite_three-friends",
  settings: "delapouite_settings-knobs", help: "sbed_help", map: "lorc_treasure-map", emote: "lorc_cat", chat: "delapouite_chat-bubble",
  announce: "lorc_scroll-unfurled", herbs: "delapouite_herbs-bundle", food: "lorc_meat", health: "zeromancer_heart-plus", stamina: "lorc_sprint",
  exit: "delapouite_exit-door", sun: "lorc_sun", moon: "lorc_moon", cloud: "lorc_fluffy-cloud", rain: "lorc_raining", snow: "lorc_snowflake-1",
  fog: "delapouite_fog", storm: "lorc_lightning-arc", paw: "lorc_paw-print", crown: "lorc_crown", tree: "lorc_pine-tree",
  search: "lorc_magnifying-glass", fight: "lorc_crossed-swords", leaf: "lorc_falling-leaf", sprout: "lorc_sprout", dawn: "delapouite_sunrise",
  trade: "lorc_trade", hunger: "delapouite_stomach", mushroom: "lorc_mushroom",
  feather: "lorc_feather", necklace: "lucasms_necklace", cape: "delapouite_cape", knot: "delapouite_knot",
} as const;
export type IconName = keyof typeof ICONS;

export function iconUrl(name: IconName): string {
  return `/assets/ui/icons/gameicons_${ICONS[name]}.svg`;
}

export function icon(name: IconName, extraClass = ""): HTMLSpanElement {
  return h("span", { class: `gi ${extraClass}`.trim(), style: `--gi:url(${iconUrl(name)})`, "aria-hidden": "true" });
}

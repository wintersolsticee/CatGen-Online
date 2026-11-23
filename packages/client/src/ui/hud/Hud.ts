import {
  C2S, CONDITIONS, RANKS, SEASON_NAMES, getClan, getWorldClock, isConditionId, isRank, normalizeAppearance,
  type ChatEvent, type ClanInfo, type CombatMoveId, type PrivateState, type Rank, type Weather, type WorldClock,
} from "@catgen/shared";
import { h, toast } from "../dom.ts";
import type { HudContext, PanelName, Settings } from "./context.ts";
import { ChatBox } from "./chat.ts";
import { renderMapImage, drawMinimap, type MapMarker } from "./minimap.ts";
import { inventoryPanel, clanPanel, socialPanel, herbStorePanel, emotesPanel, settingsPanel, helpPanel, catCard } from "./panels.ts";
import { renderPortrait } from "../../render/cat-sprites.ts";
import type { NetPlayer } from "../../game/net.ts";
import type { GameBridge } from "../../game/GameScene.ts";
import { KEY_LABELS } from "../../game/keybinds.ts";
import { icon, type IconName } from "../icons.ts";

const WEATHER_ICON: Record<Weather, IconName> = { clear: "sun", cloudy: "cloud", rain: "rain", storm: "storm", fog: "fog", snow: "snow" };
const ACTIONS: { move: CombatMoveId | "interact" | "stalk"; icon: IconName; name: string }[] = [
  { move: "swipe", icon: "swipe", name: "Swipe" },
  { move: "bite", icon: "bite", name: "Bite" },
  { move: "pounce", icon: "pounce", name: "Pounce" },
  { move: "block", icon: "block", name: "Block" },
  { move: "dodge", icon: "dodge", name: "Dodge" },
  { move: "stalk", icon: "stalk", name: "Stalk" },
  { move: "interact", icon: "interact", name: "Interact" },
];

/** The DOM heads-up display. Receives data from the game scene via GameBridge. */
export class Hud implements GameBridge {
  readonly el: HTMLElement;
  private chat: ChatBox;
  private portrait: HTMLCanvasElement;
  private whoEl = h("div", { class: "who" });
  private subEl = h("div", { class: "sub" });
  private bars = { hp: h("div", { class: "bar hp" }), st: h("div", { class: "bar st" }), hu: h("div", { class: "bar hu" }) };
  private condEl = h("div", { class: "conditions" });
  private timeEl = h("div", { class: "time" });
  private metaEl = h("div", { class: "meta" });
  private minimap = h("canvas", { class: "minimap", title: "Click for the full map (M)" }) as HTMLCanvasElement;
  private territoryEl = h("div", { class: "hud-territory", style: "display:none" });
  private promptEl = h("div", { class: "hud-prompt panel", style: "display:none" });
  private panelHost = h("div");
  private cardHost = h("div");
  private actionEls = new Map<string, { el: HTMLElement; cd: HTMLElement }>();
  private mapBase: HTMLCanvasElement;
  private openName: PanelName | null = null;
  private bigMap: HTMLElement | null = null;
  private selectedKey: string | null = null;
  private lastPortraitKey = "";
  private lastTerritory: string | null | undefined = undefined;
  private stalking = false;

  constructor(private ctx: HudContext, private hooks: { exit: () => void; applySettings: (s: Settings) => void; localPos: () => { x: number; y: number } }) {
    this.chat = new ChatBox(ctx);
    this.portrait = h("canvas", { class: "portrait", width: 128, height: 128 }) as HTMLCanvasElement;
    this.mapBase = renderMapImage(ctx.map, 2);
    const barIcon: Record<string, IconName> = { hp: "health", st: "stamina", hu: "food" };
    for (const k of ["hp", "st", "hu"] as const) {
      this.bars[k].append(h("i"), h("span"), h("b", {}, icon(barIcon[k])));
      this.bars[k].setAttribute("data-tip", k === "hp" ? "Health" : k === "st" ? "Stamina" : "Hunger");
    }
    const actionBar = h("div", { class: "hud-actions panel" }, ACTIONS.map((a) => {
      const cd = h("div", { class: "cd" });
      const el = h("div", { class: "action", "data-tip": `${a.name} (${KEY_LABELS[a.move] ?? ""})`, onclick: () => this.clickAction(a.move) }, h("span", { class: "key" }, KEY_LABELS[a.move] ?? ""), icon(a.icon), h("span", { class: "name" }, a.name), cd);
      this.actionEls.set(a.move, { el, cd });
      return el;
    }));
    const menuBtn = (ico: IconName, key: string, title: string, name: PanelName) => h("button", { "aria-label": `${title} (${key})`, title: `${title} (${key})`, onclick: () => this.togglePanel(name) }, icon(ico), h("span", { class: "key" }, key));
    const ring = h("div", { class: "minimap-ring", title: "Click for the full map (M)", onclick: () => this.toggleBigMap() }, this.minimap);
    this.el = h("div", { id: "hud" },
      h("div", { class: "hud-status panel" }, this.portrait, h("div", {}, this.whoEl, this.subEl, h("div", { class: "bars" }, this.bars.hp, this.bars.st, this.bars.hu), this.condEl)),
      this.territoryEl,
      h("div", { class: "hud-clock panel" }, this.timeEl, this.metaEl, ring),
      this.chat.el,
      this.promptEl,
      actionBar,
      h("div", { class: "hud-menu" },
        menuBtn("inventory", "I", "Inventory", "inventory"), menuBtn("clan", "K", "Clan", "clan"), menuBtn("friends", "O", "Friends", "social"),
        menuBtn("emote", "G", "Emotes", "emotes"), menuBtn("help", "H", "Help", "help"), menuBtn("settings", "Esc", "Settings", "settings")),
      this.panelHost,
      this.cardHost,
    );
    window.addEventListener("keydown", this.onKey);
  }

  dispose() {
    window.removeEventListener("keydown", this.onKey);
    this.el.remove();
    this.bigMap?.remove();
  }

  private onKey = (e: KeyboardEvent) => {
    if (this.isTyping()) return;
    const k = e.key.toLowerCase();
    if (e.key === "Enter") { e.preventDefault(); this.chat.focus(); return; }
    if (e.key === "/") { e.preventDefault(); this.chat.focus(); this.chat.input.value = "/"; return; }
    if (e.key === "Escape") { if (this.bigMap) this.toggleBigMap(); else if (this.openName) this.openPanel(null); else this.openPanel("settings"); return; }
    const map: Record<string, PanelName> = { i: "inventory", k: "clan", o: "social", g: "emotes", h: "help" };
    if (map[k]) this.togglePanel(map[k]);
    if (k === "m") this.toggleBigMap();
    if (k === "c") { this.stalking = !this.stalking; this.actionEls.get("stalk")?.el.classList.toggle("toggled", this.stalking); }
  };

  private clickAction(move: string) {
    const code = { swipe: "Digit1", bite: "Digit2", pounce: "Digit3", block: "KeyQ", dodge: "Space", interact: "KeyE", stalk: "KeyC" }[move];
    const keyCode = { swipe: 49, bite: 50, pounce: 51, block: 81, dodge: 32, interact: 69, stalk: 67 }[move];
    if (!code) return;
    // Simulate a key press so the scene handles it exactly like the keyboard.
    window.dispatchEvent(new KeyboardEvent("keydown", { code, keyCode, key: move === "dodge" ? " " : code.slice(-1).toLowerCase() } as KeyboardEventInit));
    setTimeout(() => window.dispatchEvent(new KeyboardEvent("keyup", { code, keyCode } as KeyboardEventInit)), 60);
  }

  // ----- Bridge implementation ---------------------------------------------------
  isTyping(): boolean {
    const a = document.activeElement;
    return !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT");
  }

  onLocalState(p: NetPlayer, clock: WorldClock, weather: Weather, territory: string | null) {
    this.ctx.me = p;
    const portraitKey = p.appearance + p.equipped;
    if (portraitKey !== this.lastPortraitKey) {
      this.lastPortraitKey = portraitKey;
      try {
        const img = renderPortrait(normalizeAppearance(JSON.parse(p.appearance)), 128);
        const c = this.portrait.getContext("2d")!;
        c.clearRect(0, 0, 128, 128);
        c.drawImage(img, 0, 0);
      } catch { /* ignore */ }
    }
    const clan = getClan(p.clan);
    this.whoEl.textContent = p.name;
    const subKey = `${p.clan}|${p.rank}`;
    if (this.subEl.dataset.k !== subKey) {
      this.subEl.dataset.k = subKey;
      this.subEl.replaceChildren(h("span", { class: "clan-dot", style: `background:${clan?.color ?? "#8e866f"};margin-right:5px` }), `${clan?.name ?? "Loner"} · ${isRank(p.rank) ? RANKS[p.rank as Rank].name : p.rank}`);
    }
    const setBar = (b: HTMLElement, v: number) => {
      const pct = Math.max(0, Math.min(100, v));
      const fill = b.children[0] as HTMLElement;
      fill.style.width = `calc(${pct}% + ${18 * (pct / 100)}px)`;
      fill.style.display = pct <= 0 ? "none" : "";
      (b.children[1] as HTMLElement).textContent = String(Math.round(v));
    };
    setBar(this.bars.hp, p.health);
    setBar(this.bars.st, p.stamina);
    setBar(this.bars.hu, p.hunger);
    const conds = p.conditions.split(",").filter(isConditionId);
    const condKey = conds.join(",") + (p.hunger < 15 ? "|starving" : "");
    if (this.condEl.dataset.k !== condKey) {
      this.condEl.dataset.k = condKey;
      const chips = conds.map((c) => h("span", { class: "chip chip-danger", title: CONDITIONS[c].description }, CONDITIONS[c].name));
      if (p.hunger < 15) chips.push(h("span", { class: "chip chip-danger" }, "Starving"));
      this.condEl.replaceChildren(...chips);
    }
    const hh = Math.floor(clock.hour), mm = Math.floor((clock.hour % 1) * 60);
    const part = clock.hour < 5 ? "Night" : clock.hour < 8 ? "Dawn" : clock.hour < 12 ? "Morning" : clock.hour < 17 ? "Afternoon" : clock.hour < 20.5 ? "Evening" : "Night";
    const timeKey = `${part}${hh}${mm}${weather}${clock.season}${clock.day}${clock.isGathering}`;
    if (this.timeEl.dataset.k !== timeKey) {
      this.timeEl.dataset.k = timeKey;
      this.timeEl.replaceChildren(icon(clock.isNight ? "moon" : part === "Dawn" ? "dawn" : "sun"), `${part} · ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
      this.metaEl.replaceChildren(icon(WEATHER_ICON[weather] ?? "sun"), `${SEASON_NAMES[clock.season]} · Day ${clock.day + 1}${clock.isGathering ? " · Gathering!" : ""}`);
    }
    if (territory !== this.lastTerritory) {
      this.lastTerritory = territory;
      const tc = getClan(territory);
      this.territoryEl.style.display = "";
      this.territoryEl.textContent = tc ? `${tc.name} territory` : "Neutral ground";

    }
    // Minimap.
    const pos = this.hooks.localPos();
    const markers: MapMarker[] = [];
    this.ctx.net.state.players.forEach((o, key) => {
      if (key === this.ctx.net.sessionId) return;
      markers.push({ x: o.x, y: o.y, color: getClan(o.clan)?.color ?? "#ddd", r: 3 });
    });
    markers.push({ x: pos.x, y: pos.y, color: "#fff3c4", r: 5 });
    const labels = this.ctx.map.locations.filter((l) => ["camp", "gathering", "landmark"].includes(l.kind) && (this.ctx.priv?.discovered.includes(l.id) ?? false)).map((l) => ({ x: l.x, y: l.y, text: l.name }));
    drawMinimap(this.minimap, this.mapBase, this.ctx.map, pos.x, pos.y, 9000, markers, labels);
    if (this.bigMap) drawMinimap(this.bigMap.querySelector("canvas")!, this.mapBase, this.ctx.map, this.ctx.map.pixelWidth / 2, this.ctx.map.pixelHeight / 2, this.ctx.map.pixelWidth * 1.02, markers.map((m) => ({ ...m, r: m.r + 1 })), labels);
    if (this.selectedKey) this.renderCard();
  }

  onPrompt(text: string | null) {
    if (!text) { this.promptEl.style.display = "none"; return; }
    this.promptEl.style.display = "";
    if (this.promptEl.dataset.t !== text) {
      this.promptEl.dataset.t = text;
      this.promptEl.replaceChildren(h("span", { class: "kbd" }, "E"), text);
    }
  }

  onSelectCat(key: string | null) {
    this.selectedKey = key;
    this.renderCard();
  }

  private renderCard() {
    if (!this.selectedKey) { this.cardHost.replaceChildren(); return; }
    // Avoid rebuilding while the user interacts with the card.
    if (this.cardHost.contains(document.activeElement)) return;
    const card = catCard(this.ctx, this.selectedKey, () => this.onSelectCat(null));
    this.cardHost.replaceChildren(...(card ? [card] : []));
  }

  onOpenHerbStore() {
    this.openPanel("herbs");
  }

  onCooldown(move: CombatMoveId, _until: number, duration: number) {
    const a = this.actionEls.get(move);
    if (!a) return;
    a.cd.animate([{ transform: "scaleY(1)" }, { transform: "scaleY(0)" }], { duration, easing: "linear" });
  }

  // ----- Panels -------------------------------------------------------------------
  togglePanel(name: PanelName) {
    this.openPanel(this.openName === name ? null : name);
  }

  openPanel(name: PanelName | null) {
    this.openName = name;
    this.refreshPanel();
  }

  refreshPanel() {
    const ctx = this.ctx;
    if (!this.openName) { this.panelHost.replaceChildren(); return; }
    if (this.panelHost.contains(document.activeElement) && document.activeElement?.tagName !== "BUTTON") return;
    const scroll = this.panelHost.querySelector(".body")?.scrollTop ?? 0;
    const el = {
      inventory: () => inventoryPanel(ctx),
      clan: () => clanPanel(ctx),
      social: () => socialPanel(ctx),
      herbs: () => herbStorePanel(ctx),
      emotes: () => emotesPanel(ctx),
      settings: () => settingsPanel(ctx, () => this.hooks.applySettings(ctx.settings), this.hooks.exit),
      help: () => helpPanel(ctx),
    }[this.openName]();
    this.panelHost.replaceChildren(el);
    const body = el.querySelector(".body");
    if (body) body.scrollTop = scroll;
  }

  private toggleBigMap() {
    if (this.bigMap) { this.bigMap.remove(); this.bigMap = null; return; }
    this.bigMap = h("div", { class: "big-map panel" }, h("div", { class: "row", style: "margin-bottom:6px" }, icon("map"), h("h2", { class: "display grow", style: "margin:0" }, "The Forest Territories"), h("button", { class: "close-x", "aria-label": "Close", onclick: () => this.toggleBigMap() }, "✕")), h("canvas"));
    document.body.append(this.bigMap);
  }

  // ----- Data from server ---------------------------------------------------------------
  onChat(ev: ChatEvent) {
    this.chat.add(ev);
  }

  onPrivate(p: PrivateState) {
    this.ctx.priv = p;
    if (this.openName && this.openName !== "social") this.refreshPanel();
  }

  onClan(c: ClanInfo) {
    this.ctx.clan = c;
    if (this.openName === "clan" || this.openName === "herbs") this.refreshPanel();
  }

  notice(kind: "info" | "success" | "warning" | "error", text: string) {
    toast(text, kind);
    if (kind !== "info") this.chat.add({ channel: "system", from: "", fromId: "", clan: null, text, ts: Date.now() });
  }

  whisper(name: string) {
    this.chat.setWhisper(name);
  }

  get clock() {
    return getWorldClock(this.ctx.net.state.worldTime);
  }
}

export { C2S };

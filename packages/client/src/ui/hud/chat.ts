import { C2S, EMOTES, getClan, type ChatEvent } from "@catgen/shared";
import { h } from "../dom.ts";
import type { HudContext } from "./context.ts";

type Tab = "all" | "local" | "clan" | "global";

/** Chat box with channel tabs, /commands and whisper support. */
export class ChatBox {
  el: HTMLElement;
  input: HTMLInputElement;
  private log: HTMLElement;
  private tabsEl: HTMLElement;
  private tab: Tab = "all";
  private sendChannel: "local" | "clan" | "global" = "local";
  private lines: ChatEvent[] = [];

  constructor(private ctx: HudContext) {
    this.log = h("div", { class: "log scroll" });
    this.tabsEl = h("div", { class: "tabs" });
    this.input = h("input", { class: "input", maxlength: 240, placeholder: "Press Enter to talk · /w name msg · /clan · /global · /me" }) as HTMLInputElement;
    this.input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        this.submit();
        this.input.blur(); // hand the keyboard back to the game after talking
      }
      if (e.key === "Escape") this.input.blur();
    });
    this.el = h("div", { class: "hud-chat panel" }, this.tabsEl, this.log, this.input);
    this.renderTabs();
  }

  private renderTabs() {
    const tabs: [Tab, string][] = [["all", "All"], ["local", "Nearby"], ["clan", "Clan"], ["global", "Global"]];
    this.tabsEl.replaceChildren(...tabs.map(([t, label]) => h("button", { class: this.tab === t ? "active" : "", onclick: () => {
      this.tab = t;
      if (t !== "all") this.sendChannel = t;
      this.renderTabs();
      this.renderLog();
    } }, label)));
    this.input.placeholder = `Talking in ${this.sendChannel === "local" ? "Nearby" : this.sendChannel === "clan" ? "Clan" : "Global"} · /w name msg · /me`;
  }

  focus() {
    this.input.focus();
  }

  private submit() {
    const raw = this.input.value.trim();
    this.input.value = "";
    if (!raw) { this.input.blur(); return; }
    const net = this.ctx.net;
    if (raw.startsWith("/")) {
      const [cmd, ...rest] = raw.slice(1).split(" ");
      const arg = rest.join(" ");
      switch (cmd.toLowerCase()) {
        case "w": case "whisper": case "msg": {
          const [to, ...msg] = rest;
          if (to && msg.length) net.send(C2S.chat, { channel: "whisper", to, text: msg.join(" ") });
          return;
        }
        case "c": case "clan": if (arg) net.send(C2S.chat, { channel: "clan", text: arg }); return;
        case "g": case "global": if (arg) net.send(C2S.chat, { channel: "global", text: arg }); return;
        case "l": case "local": case "s": if (arg) net.send(C2S.chat, { channel: "local", text: arg }); return;
        case "announce": if (arg) net.send(C2S.announce, { text: arg }); return;
        case "report": {
          const [who, ...why] = rest;
          if (who && why.length) net.send(C2S.report, { targetName: who, reason: why.join(" ") });
          return;
        }
        case "mute": case "kick": case "ban": {
          const [who, minutes, ...why] = rest;
          if (who) net.send(C2S.moderate, { action: cmd.toLowerCase(), targetName: who, minutes: Number(minutes) || undefined, reason: why.join(" ") || undefined });
          return;
        }
        default:
          if (cmd in EMOTES) { net.send(C2S.emote, { emote: cmd }); return; }
          this.add({ channel: "system", from: "", fromId: "", clan: null, text: `Unknown command /${cmd}. Emotes: ${Object.keys(EMOTES).map((e) => "/" + e).join(" ")}`, ts: Date.now() });
          return;
      }
    }
    net.send(C2S.chat, { channel: this.sendChannel, text: raw });
  }

  add(ev: ChatEvent) {
    this.lines.push(ev);
    if (this.lines.length > 200) this.lines.shift();
    if (this.matches(ev)) this.appendLine(ev);
  }

  private matches(ev: ChatEvent) {
    if (this.tab === "all") return true;
    if (this.tab === "local") return ev.channel === "local" || ev.channel === "emote" || ev.channel === "whisper" || ev.channel === "system";
    if (this.tab === "clan") return ev.channel === "clan" || ev.channel === "announcement";
    return ev.channel === "global";
  }

  private renderLog() {
    this.log.replaceChildren();
    for (const l of this.lines) if (this.matches(l)) this.appendLine(l);
  }

  private appendLine(ev: ChatEvent) {
    const atBottom = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 30;
    const color = getClan(ev.clan)?.color ?? "#d8cfb8";
    const from = (name: string) => h("span", { class: "from", style: `color:${color}`, title: "Click to whisper", onclick: () => this.ctx.whisper(name) }, name);
    let line: HTMLElement;
    switch (ev.channel) {
      case "system": line = h("div", { class: "line system" }, ev.text); break;
      case "announcement": line = h("div", { class: "line announcement" }, "📣 ", ev.from ? h("b", {}, ev.from + ": ") : null, ev.text); break;
      case "emote": line = h("div", { class: "line emote" }, "* ", from(ev.from), " ", ev.text); break;
      case "whisper": line = h("div", { class: "line whisper" }, h("span", { class: "ch" }, "whisper"), from(ev.from), ": ", ev.text); break;
      default: line = h("div", { class: "line" }, ev.channel !== "local" ? h("span", { class: "ch" }, ev.channel) : null, from(ev.from), ": ", ev.text);
    }
    this.log.append(line);
    while (this.log.children.length > 200) this.log.firstElementChild?.remove();
    if (atBottom) this.log.scrollTop = this.log.scrollHeight;
  }

  setWhisper(name: string) {
    this.input.value = `/w ${name} `;
    this.input.focus();
  }
}

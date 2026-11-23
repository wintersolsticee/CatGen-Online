import { EMOTES, GAME_CONFIG, filterChat, sanitizeChat, type ChatEvent, type ChatMsg } from "@catgen/shared";
import type { GameContext, PlayerRuntime } from "./context.ts";

/** Recent chat for moderation report context (ring buffer). */
const HISTORY_SIZE = 200;

export class ChatSystem {
  readonly history: ChatEvent[] = [];

  constructor(private ctx: GameContext) {}

  private record(ev: ChatEvent) {
    this.history.push(ev);
    if (this.history.length > HISTORY_SIZE) this.history.shift();
  }

  private isMuted(p: PlayerRuntime): boolean {
    const until = p.account.mutedUntil;
    if (until && until > new Date()) {
      this.ctx.notify(p, "warning", `You are muted until ${until.toLocaleTimeString()}.`);
      return true;
    }
    return false;
  }

  /** Deliver to a recipient unless they blocked the sender. */
  private deliver(to: PlayerRuntime, from: PlayerRuntime, ev: ChatEvent) {
    if (to.blocked.has(from.char.id)) return;
    this.ctx.sendChat(to, ev);
  }

  handle(p: PlayerRuntime, msg: ChatMsg) {
    const now = this.ctx.now();
    if (now - p.lastChatAt < GAME_CONFIG.chat.rateLimitMs) return this.ctx.notify(p, "warning", "Slow down!");
    if (this.isMuted(p)) return;
    const clean = sanitizeChat(msg.text);
    if (!clean) return;
    p.lastChatAt = now;
    const text = filterChat(clean);
    const ev: ChatEvent = { channel: msg.channel, from: p.char.name, fromId: p.char.id, clan: p.char.clan, text, ts: now };
    this.record(ev);
    const all = [...this.ctx.players.values()];
    switch (msg.channel) {
      case "local": {
        const r = GAME_CONFIG.chat.proximityRadius;
        for (const o of all) if (Math.hypot(o.state.x - p.state.x, o.state.y - p.state.y) <= r) this.deliver(o, p, ev);
        break;
      }
      case "global":
        for (const o of all) this.deliver(o, p, ev);
        break;
      case "clan":
        if (!p.char.clan) return this.ctx.notify(p, "warning", "Loners have no Clan to talk to.");
        for (const o of all) if (o.char.clan === p.char.clan) this.deliver(o, p, ev);
        break;
      case "whisper": {
        const to = msg.to ? this.ctx.playerByName(msg.to) : undefined;
        if (!to) return this.ctx.notify(p, "warning", `${msg.to ?? "That cat"} is not online.`);
        const w = { ...ev, text: `→ ${to.char.name}: ${text}` };
        this.deliver(to, p, { ...ev, text });
        this.ctx.sendChat(p, w);
        break;
      }
    }
  }

  emote(p: PlayerRuntime, emote: string) {
    const def = EMOTES[emote];
    if (!def) return;
    p.state.pose = def.anim;
    const ev: ChatEvent = { channel: "emote", from: p.char.name, fromId: p.char.id, clan: p.char.clan, text: def.text, ts: this.ctx.now() };
    for (const o of this.ctx.players.values()) {
      if (Math.hypot(o.state.x - p.state.x, o.state.y - p.state.y) <= GAME_CONFIG.chat.proximityRadius) this.deliver(o, p, ev);
    }
  }

  contextFor(name: string): ChatEvent[] {
    const lower = name.toLowerCase();
    return this.history.filter((e) => e.from.toLowerCase() === lower).slice(-20);
  }
}

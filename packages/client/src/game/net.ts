/**
 * Multiplayer connection. Wraps colyseus.js and exposes typed events so the
 * rest of the client never touches Colyseus directly (easy to swap/mock).
 */
import { Client, Room, getStateCallbacks } from "colyseus.js";
import { C2S, S2C, ROOM_NAME, type ChatEvent, type CombatEvent, type NoticeEvent, type PrivateState, type ClanInfo } from "@catgen/shared";

/** Shape of the synced state as decoded on the client (mirrors server/rooms/schema.ts). */
export interface NetPlayer {
  id: string; name: string; clan: string; rank: string; appearance: string; equipped: string;
  x: number; y: number; facing: number; moving: boolean; running: boolean; stalking: boolean; pose: string;
  health: number; stamina: number; hunger: number; conditions: string; carrying: string; lastSeq: number; blocking: boolean; role: string;
}
export interface NetPrey { id: string; species: string; x: number; y: number; facing: number; mode: string }
export interface NetForage { id: string; itemId: string; x: number; y: number }
export interface NetState {
  players: Map<string, NetPlayer> & { forEach(cb: (v: NetPlayer, k: string) => void): void };
  prey: Map<string, NetPrey> & { forEach(cb: (v: NetPrey, k: string) => void): void };
  forage: Map<string, NetForage> & { forEach(cb: (v: NetForage, k: string) => void): void };
  worldTime: number;
  weather: string;
}

type Handlers = {
  chat: (e: ChatEvent) => void;
  combat: (e: CombatEvent) => void;
  notice: (e: NoticeEvent) => void;
  privateState: (e: PrivateState) => void;
  clanInfo: (e: ClanInfo) => void;
  preyCaught: (e: { species: string }) => void;
  kicked: (e: { reason: string }) => void;
  disconnected: (reconnecting: boolean) => void;
  reconnected: () => void;
  playerAdded: (key: string, p: NetPlayer) => void;
  playerRemoved: (key: string) => void;
};

function wsUrl(): string {
  const env = import.meta.env.VITE_WS_URL as string | undefined;
  if (env) return env;
  const { protocol, hostname, port } = window.location;
  // In development the Vite dev server runs on 5173 and the game server on 2567.
  const p = port === "5173" ? "2567" : port;
  return `${protocol === "https:" ? "wss" : "ws"}://${hostname}${p ? ":" + p : ""}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listener = (...args: any[]) => void;

export class Net {
  private client = new Client(wsUrl());
  room!: Room;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private listeners: Partial<Record<keyof Handlers, Listener[]>> = {};
  private leaving = false;

  on<K extends keyof Handlers>(ev: K, fn: Handlers[K]) {
    const list: Listener[] = this.listeners[ev] ?? [];
    list.push(fn as Listener);
    this.listeners[ev] = list;
    // Late subscribers still get the most recent snapshot-type message.
    const last = this.latest.get(ev);
    if (last) (fn as Listener)(...last);
  }

  /** Last payload of "snapshot" events, replayed to listeners that subscribe late. */
  private latest = new Map<keyof Handlers, unknown[]>();
  private static SNAPSHOT_EVENTS = new Set<keyof Handlers>(["privateState", "clanInfo"]);

  private emit<K extends keyof Handlers>(ev: K, ...args: Parameters<Handlers[K]>) {
    if (Net.SNAPSHOT_EVENTS.has(ev)) this.latest.set(ev, args);
    for (const fn of this.listeners[ev] ?? []) fn(...args);
  }

  get state(): NetState {
    return this.room.state as unknown as NetState;
  }

  get sessionId(): string {
    return this.room.sessionId;
  }

  async connect(token: string, characterId: string) {
    this.room = await this.client.joinOrCreate(ROOM_NAME, { token, characterId });
    // Wait for the first full state sync before the game starts reading it.
    if (!(this.room.state as { players?: unknown })?.players) {
      await new Promise<void>((resolve) => this.room.onStateChange.once(() => resolve()));
    }
    this.bind();
  }

  private bind() {
    const r = this.room;
    r.onMessage(S2C.chat, (m) => this.emit("chat", m));
    r.onMessage(S2C.combat, (m) => this.emit("combat", m));
    r.onMessage(S2C.notice, (m) => this.emit("notice", m));
    r.onMessage(S2C.privateState, (m) => this.emit("privateState", m));
    r.onMessage(S2C.clanInfo, (m) => this.emit("clanInfo", m));
    r.onMessage(S2C.preyCaught, (m) => this.emit("preyCaught", m));
    r.onMessage(S2C.kicked, (m) => {
      this.leaving = true;
      this.emit("kicked", m);
    });
    const $ = getStateCallbacks(r);
    const state = $(r.state as never) as unknown as {
      players: { onAdd(cb: (p: NetPlayer, k: string) => void, immediate?: boolean): void; onRemove(cb: (p: NetPlayer, k: string) => void): void };
    };
    state.players.onAdd((p, k) => this.emit("playerAdded", k, p));
    state.players.onRemove((_p, k) => this.emit("playerRemoved", k));
    r.onLeave(async (code) => {
      if (this.leaving || code === 1000 || code >= 4000) {
        this.emit("disconnected", false);
        return;
      }
      this.emit("disconnected", true);
      // Try to resume the same session (server keeps it for a short time).
      for (let attempt = 0; attempt < 6; attempt++) {
        await new Promise((res) => setTimeout(res, 1000 + attempt * 1500));
        try {
          this.room = await this.client.reconnect(r.reconnectionToken);
          this.bind();
          this.emit("reconnected");
          return;
        } catch {
          /* retry */
        }
      }
      this.emit("disconnected", false);
    });
  }

  send(type: (typeof C2S)[keyof typeof C2S], payload: unknown = {}) {
    try {
      this.room?.send(type, payload);
    } catch {
      /* socket closed; reconnect logic will handle it */
    }
  }

  async leave() {
    this.leaving = true;
    await this.room?.leave(true).catch(() => undefined);
  }
}

import type { Client } from "colyseus";
import {
  WorldMap, getWorldClock, gidOfTerrain, normalizeCharacterState, type CharacterData, type ChatEvent, type TiledMap, type TiledObject, type TiledProperty,
} from "@catgen/shared";
import { WorldState } from "../src/rooms/schema.ts";
import type { GameContext, PlayerRuntime } from "../src/game/context.ts";
import { createRuntime, awardXp } from "../src/game/players.ts";
import type { Account } from "../src/db/accounts.ts";
import type { Repos } from "../src/db/index.ts";

/** A 40x40 grass map with ThunderClan + WindClan camps, piles, dens and Fourtrees. */
export function testMap(): WorldMap {
  const W = 40, H = 40;
  const data = new Array(W * H).fill(gidOfTerrain("grass"));
  for (let y = 0; y < H; y++) data[y * W + 39] = gidOfTerrain("cliff");
  let id = 1;
  const P = (name: string, value: string | number): TiledProperty => ({ name, type: typeof value === "number" ? "int" : "string", value });
  const loc = (type: string, x: number, y: number, props: TiledProperty[], name = type): TiledObject => ({ id: id++, name, type, x, y, width: 0, height: 0, rotation: 0, visible: true, point: true, properties: props });
  const locations = [
    loc("camp", 640, 640, [P("clan", "thunderclan"), P("radius", 600), P("locationId", "thunderclan_camp")], "ThunderClan Camp"),
    loc("fresh_kill_pile", 700, 700, [P("clan", "thunderclan"), P("radius", 160)]),
    loc("medicine_den", 500, 700, [P("clan", "thunderclan"), P("radius", 190)]),
    loc("spawn", 640, 800, [P("clan", "thunderclan"), P("radius", 200)]),
    loc("camp", 3800, 640, [P("clan", "windclan"), P("radius", 600)], "WindClan Camp"),
    loc("spawn", 3800, 800, [P("clan", "windclan"), P("radius", 200)]),
    loc("gathering", 2500, 4000, [P("radius", 800), P("locationId", "fourtrees")], "Fourtrees"),
    loc("spawn", 2500, 4200, [P("radius", 200)], "loner"),
    loc("landmark", 1500, 1500, [P("radius", 300), P("locationId", "owl_tree")], "Owl Tree"),
  ];
  const territories: TiledObject[] = [
    { id: id++, name: "", type: "territory", x: 0, y: 0, width: 2000, height: 2000, rotation: 0, visible: true, properties: [P("clan", "thunderclan")] },
    { id: id++, name: "", type: "territory", x: 3000, y: 0, width: 2000, height: 2000, rotation: 0, visible: true, properties: [P("clan", "windclan")] },
  ];
  const map: TiledMap = {
    type: "map", version: "1.10", tiledversion: "1.10", orientation: "orthogonal", renderorder: "right-down",
    width: W, height: H, tilewidth: 128, tileheight: 128, infinite: false, nextlayerid: 4, nextobjectid: id, tilesets: [],
    layers: [
      { type: "tilelayer", id: 1, name: "terrain", width: W, height: H, x: 0, y: 0, opacity: 1, visible: true, data },
      { type: "objectgroup", id: 2, name: "locations", x: 0, y: 0, opacity: 1, visible: true, draworder: "topdown", objects: locations },
      { type: "objectgroup", id: 3, name: "territories", x: 0, y: 0, opacity: 1, visible: true, draworder: "topdown", objects: territories },
    ],
  };
  return new WorldMap(map);
}

export interface FakeClient {
  sessionId: string;
  sent: { type: string; msg: unknown }[];
  left: boolean;
  send(type: string, msg: unknown): void;
  leave(): void;
}

export function fakeClient(id: string): FakeClient {
  return { sessionId: id, sent: [], left: false, send(type, msg) { this.sent.push({ type, msg }); }, leave() { this.left = true; } };
}

export function account(role: Account["role"] = "player"): Account {
  return { id: "acc-" + Math.random(), username: "u", passwordHash: "", role, settings: {}, mutedUntil: null, bannedUntil: null, banReason: null };
}

/** In-memory repos stub: only what the systems touch in unit tests. */
export function fakeRepos(): Repos {
  const store = new Map<string, CharacterData>();
  return {
    characters: {
      get: async (id: string) => store.get(id) ?? null,
      setClanRank: async () => undefined,
      clanMembers: async () => [],
      clanHasRank: async () => false,
      save: async (c: CharacterData) => void store.set(c.id, c),
    },
    clans: { all: async () => [], save: async () => undefined, addAnnouncement: async () => undefined, announcements: async () => [] },
    accounts: {}, social: {}, world: {},
  } as unknown as Repos;
}

export interface TestCtx {
  ctx: GameContext;
  now: { t: number };
  rngValue: { v: number };
  chats: { to: string; ev: ChatEvent }[];
  notices: { to: string; kind: string; text: string }[];
  addPlayer(name: string, over?: Partial<CharacterData>, pos?: { x: number; y: number }): PlayerRuntime & { fake: FakeClient };
}

export function makeCtx(): TestCtx {
  const map = testMap();
  const state = new WorldState();
  const players = new Map<string, PlayerRuntime>();
  const now = { t: 1_000_000 };
  const rngValue = { v: 0.5 };
  const chats: TestCtx["chats"] = [];
  const notices: TestCtx["notices"] = [];
  const ctx: GameContext = {
    map, state, repos: fakeRepos(), players,
    rng: () => rngValue.v,
    now: () => now.t,
    clock: () => getWorldClock(state.worldTime),
    notify: (p, kind, text) => notices.push({ to: p.char.name, kind, text }),
    sendChat: (p, ev) => chats.push({ to: p.char.name, ev }),
    broadcastNear: (x, y, r, type, payload) => {
      for (const p of players.values()) if (Math.hypot(p.state.x - x, p.state.y - y) <= r) p.client.send(type, payload);
    },
    playerByCharId: (id) => [...players.values()].find((p) => p.char.id === id),
    playerByName: (n) => [...players.values()].find((p) => p.char.name.toLowerCase() === n.toLowerCase()),
    awardXp: (p, r) => awardXp(ctx, p, r),
  };
  state.worldTime = getWorldClock(0).day; // day 0, midnight
  let n = 0;
  return {
    ctx, now, rngValue, chats, notices,
    addPlayer(name, over = {}, pos) {
      const id = `s${++n}`;
      const client = fakeClient(id);
      const char: CharacterData = { id: `c-${name}`, accountId: `a-${name}`, ...normalizeCharacterState({ name, clan: "thunderclan", rank: "warrior" }), ...over };
      const p = createRuntime(ctx, client as unknown as Client, account(), char, []) as PlayerRuntime & { fake: FakeClient };
      p.fake = client;
      if (pos) { p.state.x = pos.x; p.state.y = pos.y; }
      players.set(id, p);
      state.players.set(id, p.state);
      return p;
    },
  };
}

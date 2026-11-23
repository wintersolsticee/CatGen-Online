/**
 * End-to-end multiplayer test: real HTTP API + Colyseus server + Postgres
 * (database `catgen_test`, wiped before the run), driven by real clients.
 * Skipped automatically when no test database is reachable.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { Client as ColyseusClient, type Room } from "colyseus.js";
import { ROOM_NAME, C2S, S2C } from "@catgen/shared";
import type { RunningServer } from "../src/server.ts";

const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgres://catgen:catgen@localhost:5432/catgen_test";
let server: RunningServer | null = null;
let dbAvailable = true;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(cond: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("timed out waiting for condition");
    await wait(20);
  }
}

beforeAll(async () => {
  const c = new pg.Client({ connectionString: TEST_DB });
  try {
    await c.connect();
    await c.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  } catch {
    dbAvailable = false;
    return;
  } finally {
    await c.end().catch(() => undefined);
  }
  const { startServer } = await import("../src/server.ts");
  server = await startServer({ port: 0, databaseUrl: TEST_DB, quiet: true });
}, 30_000);

afterAll(async () => {
  await server?.close();
});

async function http<T>(method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; data: T }> {
  const res = await fetch(`http://localhost:${server!.port}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: (await res.json()) as T };
}

async function newPlayer(username: string, name: string, clan: string | null) {
  const reg = await http<{ token: string }>("POST", "/api/auth/register", { username, password: "password123" });
  expect(reg.status).toBe(200);
  const ch = await http<{ character: { id: string } }>("POST", "/api/characters", { name, clan, rank: "warrior", appearance: { baseColor: "#123456" } }, reg.data.token);
  expect(ch.status).toBe(200);
  const client = new ColyseusClient(`ws://localhost:${server!.port}`);
  const room: Room = await client.joinOrCreate(ROOM_NAME, { token: reg.data.token, characterId: ch.data.character.id });
  const inbox: { type: string | number; msg: unknown }[] = [];
  room.onMessage("*", (type, msg) => inbox.push({ type, msg }));
  await until(() => !!(room.state as { players?: Map<string, unknown> }).players?.get(room.sessionId));
  return { token: reg.data.token, characterId: ch.data.character.id, room, inbox };
}

describe.skipIf(!dbAvailable)("multiplayer integration", () => {
  it("auth: rejects bad credentials and duplicate names", async () => {
    if (!server) return;
    expect((await http("POST", "/api/auth/register", { username: "x", password: "short" })).status).toBe(400);
    await http("POST", "/api/auth/register", { username: "dupe_user", password: "password123" });
    expect((await http("POST", "/api/auth/register", { username: "DUPE_user", password: "password123" })).status).toBe(409);
    expect((await http("POST", "/api/auth/login", { username: "dupe_user", password: "wrongpassword" })).status).toBe(401);
    expect((await http("GET", "/api/characters")).status).toBe(401);
  });

  it("two players see each other move, chat, and fight; state persists", async () => {
    if (!server) return;
    const a = await newPlayer("alice_cat", "Bluefur", "thunderclan");
    const b = await newPlayer("bob_cat", "Oakheart", "thunderclan"); // same camp so they spawn together
    type P = { x: number; y: number; health: number; name: string };
    const playersOf = (r: Room) => (r.state as { players: Map<string, P> }).players;
    await until(() => playersOf(a.room).size === 2 && playersOf(b.room).size === 2);

    // Movement is synchronised to the other client.
    const startX = playersOf(b.room).get(a.room.sessionId)!.x;
    for (let i = 1; i <= 6; i++) {
      a.room.send(C2S.input, { seq: i, dx: 1, dy: 0, run: false, stalk: false, dt: 50 });
      await wait(55);
    }
    await until(() => playersOf(b.room).get(a.room.sessionId)!.x > startX + 20);

    // Global chat reaches the other player.
    a.room.send(C2S.chat, { channel: "global", text: "Hello from ThunderClan" });
    await until(() => b.inbox.some((m) => m.type === S2C.chat && (m.msg as { text: string }).text === "Hello from ThunderClan"));

    // Walk Bluefur up to Oakheart (server-authoritative movement) and attack.
    const ax = playersOf(a.room).get(a.room.sessionId)!;
    const bx = playersOf(a.room).get(b.room.sessionId)!;
    // Walk A toward B until close (server authoritative).
    let seq = 100;
    for (let i = 0; i < 400 && Math.hypot(ax.x - bx.x, ax.y - bx.y) > 90; i++) {
      const dx = bx.x - ax.x, dy = bx.y - ax.y, l = Math.hypot(dx, dy) || 1;
      a.room.send(C2S.input, { seq: seq++, dx: dx / l, dy: dy / l, run: true, stalk: false, dt: 50 });
      await wait(52);
    }
    expect(Math.hypot(ax.x - bx.x, ax.y - bx.y)).toBeLessThan(140);
    const facing = Math.atan2(bx.y - ax.y, bx.x - ax.x);
    a.room.send(C2S.attack, { move: "swipe", facing });
    await until(() => b.inbox.some((m) => m.type === S2C.combat && (m.msg as { hit: boolean }).hit), 3000);
    await until(() => playersOf(b.room).get(b.room.sessionId)!.health < 100);

    // Leave and verify the character was saved.
    const finalX = playersOf(a.room).get(a.room.sessionId)!.x;
    await a.room.leave(true);
    await until(() => playersOf(b.room).size === 1);
    await wait(200);
    const saved = await server!.repos.characters.get(a.characterId);
    expect(saved!.x).toBeCloseTo(finalX, 0);
    await b.room.leave(true);
  }, 60_000);

  it("rejects joining with someone else's character", async () => {
    if (!server) return;
    const a = await http<{ token: string }>("POST", "/api/auth/register", { username: "thief_cat", password: "password123" });
    const victim = await server!.repos.characters.byName("Oakheart");
    const client = new ColyseusClient(`ws://localhost:${server!.port}`);
    await expect(client.joinOrCreate(ROOM_NAME, { token: a.data.token, characterId: victim!.id })).rejects.toBeTruthy();
  });
});

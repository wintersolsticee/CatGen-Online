import http from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ROOM_NAME, type WorldMap } from "@catgen/shared";
import { getPool, closePool } from "./db/pool.ts";
import { migrate } from "./db/migrate.ts";
import { createRepos, type Repos } from "./db/index.ts";
import { createApp } from "./http/app.ts";
import { WorldRoom } from "./rooms/WorldRoom.ts";
import { loadWorldMap } from "./services/map-loader.ts";

export interface RunningServer {
  port: number;
  repos: Repos;
  map: WorldMap;
  gameServer: Server;
  close(): Promise<void>;
}

/** Boot HTTP API + Colyseus. Used by index.ts and by integration tests. */
export async function startServer(opts: { port: number; databaseUrl?: string; mapPath?: string; quiet?: boolean }): Promise<RunningServer> {
  const pool = getPool(opts.databaseUrl);
  await migrate(pool, opts.quiet ? () => undefined : console.log);
  const repos = createRepos(pool);
  const map = loadWorldMap(opts.mapPath);
  const app = createApp(repos);
  const server = http.createServer(app);
  const gameServer = new Server({ transport: new WebSocketTransport({ server, pingInterval: 5000, pingMaxRetries: 3 }), greet: false });
  WorldRoom.deps = { repos, map };
  gameServer.define(ROOM_NAME, WorldRoom);
  await gameServer.listen(opts.port);
  const port = (server.address() as AddressInfo).port;
  return {
    port, repos, map, gameServer,
    close: async () => {
      await gameServer.gracefullyShutdown(false).catch(() => undefined);
      await closePool();
    },
  };
}

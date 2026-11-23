import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WorldMap, type TiledMap } from "@catgen/shared";
import { ENV } from "../env.ts";

const DEFAULT_MAP = resolve(dirname(fileURLToPath(import.meta.url)), "../../../client/public/maps/world.json");

export function loadWorldMap(path = ENV.mapPath ?? DEFAULT_MAP): WorldMap {
  const json = JSON.parse(readFileSync(path, "utf8")) as TiledMap;
  return new WorldMap(json);
}

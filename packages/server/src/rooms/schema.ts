/**
 * Colyseus synchronised state. Only data other players need to see lives here;
 * private data (inventory, skills...) is sent to the owning client via messages.
 * Adding a field is backwards compatible; removing or reordering is not (clients
 * decode by reflection, so they adapt automatically on reload).
 */
import { Schema, MapSchema, type } from "@colyseus/schema";

export class PlayerState extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type("string") clan = "";
  @type("string") rank = "warrior";
  /** JSON-encoded Appearance (changes rarely). */
  @type("string") appearance = "{}";
  /** JSON-encoded equipped accessories. */
  @type("string") equipped = "{}";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") facing = 0;
  @type("boolean") moving = false;
  @type("boolean") running = false;
  @type("boolean") stalking = false;
  /** Current emote/pose (sit, lie, groom...) or "" */
  @type("string") pose = "";
  @type("number") health = 100;
  @type("number") stamina = 100;
  @type("number") hunger = 100;
  /** Comma-separated visible condition ids. */
  @type("string") conditions = "";
  /** Comma-separated ids of prey held in the mouth. */
  @type("string") carrying = "";
  /** Last processed input sequence number (for client reconciliation). */
  @type("number") lastSeq = 0;
  @type("boolean") blocking = false;
  @type("string") role = "player";
}

export class PreyState extends Schema {
  @type("string") id = "";
  @type("string") species = "";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") facing = 0;
  /** wander | idle | flee | freeze | fly */
  @type("string") mode = "idle";
}

export class ForageState extends Schema {
  @type("string") id = "";
  @type("string") itemId = "";
  @type("number") x = 0;
  @type("number") y = 0;
}

export class WorldState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: PreyState }) prey = new MapSchema<PreyState>();
  @type({ map: ForageState }) forage = new MapSchema<ForageState>();
  /** Milliseconds of world time (drives day/night & seasons via getWorldClock). */
  @type("number") worldTime = 0;
  @type("string") weather = "clear";
}

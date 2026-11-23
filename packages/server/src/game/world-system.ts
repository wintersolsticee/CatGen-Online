import { GAME_CONFIG, SEASON_NAMES, getClan, getWorldClock, rollWeather, type ClanId, type WorldClock } from "@catgen/shared";
import type { GameContext, PlayerRuntime } from "./context.ts";
import type { ClanService } from "./clan-service.ts";
import { markDirty } from "./players.ts";

/** World clock, weather, discoveries, territory alerts and kit safety. */
export class WorldSystem {
  private lastWeatherAt = 0;
  private lastClock: WorldClock;
  private slowAccum = 0;
  private trespassAlerts = new Map<string, number>();

  constructor(private ctx: GameContext, private clans: ClanService) {
    this.lastClock = getWorldClock(ctx.state.worldTime);
  }

  tick(dtMs: number) {
    const s = this.ctx.state;
    s.worldTime += dtMs;
    const clock = getWorldClock(s.worldTime);
    const now = this.ctx.now();

    if (now - this.lastWeatherAt > GAME_CONFIG.world.weatherChangeMs || clock.season !== this.lastClock.season) {
      this.lastWeatherAt = now;
      s.weather = rollWeather(clock.season, this.ctx.rng);
    }
    if (clock.season !== this.lastClock.season) this.broadcastSystem(`${SEASON_NAMES[clock.season]} has come to the forest.`);
    if (clock.isGathering && !this.lastClock.isGathering) this.broadcastSystem("The moon is full! The Clans gather at Fourtrees under StarClan's truce.");
    if (!clock.isGathering && this.lastClock.isGathering) this.broadcastSystem("The Gathering is over. The truce has ended.");
    this.lastClock = clock;

    this.slowAccum += dtMs;
    if (this.slowAccum >= 1000) {
      this.slowAccum = 0;
      for (const p of this.ctx.players.values()) {
        this.checkDiscovery(p);
        this.checkTerritory(p, now);
        this.checkKitSafety(p, now);
      }
    }
  }

  private broadcastSystem(text: string) {
    for (const p of this.ctx.players.values()) this.ctx.sendChat(p, { channel: "system", from: "", fromId: "", clan: null, text, ts: this.ctx.now() });
  }

  private checkDiscovery(p: PlayerRuntime) {
    for (const loc of this.ctx.map.locationsNear(p.state.x, p.state.y)) {
      if (!["landmark", "camp", "gathering"].includes(loc.kind) || p.char.discovered.includes(loc.id)) continue;
      p.char.discovered = [...p.char.discovered, loc.id];
      this.ctx.awardXp(p, "discoverLocation");
      this.ctx.notify(p, "success", `Discovered: ${loc.name}${loc.description ? ` - ${loc.description}` : ""}`);
      markDirty(p);
    }
  }

  private checkTerritory(p: PlayerRuntime, now: number) {
    const t = this.ctx.map.territoryAt(p.state.x, p.state.y);
    if (t === p.territory) return;
    p.territory = t;
    if (!t) {
      this.ctx.notify(p, "info", "You are on neutral ground.");
      return;
    }
    const name = getClan(t)!.name;
    if (t === p.char.clan) {
      this.ctx.notify(p, "info", `You are back in ${name} territory.`);
      return;
    }
    const rel = p.char.clan ? this.clans.relation(p.char.clan as ClanId, t) : "neutral";
    this.ctx.notify(p, rel === "allied" ? "info" : "warning", `You have crossed into ${name} territory${rel === "allied" ? " (allies)" : ". You are trespassing!"}`);
    if (rel === "allied") return;
    const key = `${p.char.id}:${t}`;
    if ((this.trespassAlerts.get(key) ?? 0) > now - 60_000) return;
    this.trespassAlerts.set(key, now);
    for (const o of this.ctx.players.values()) {
      if (o.char.clan === t) this.ctx.sendChat(o, { channel: "system", from: "", fromId: "", clan: t, text: `You scent an intruder: ${p.char.name} of ${p.char.clan ? getClan(p.char.clan)!.name : "no Clan"} is in your territory!`, ts: now });
    }
  }

  /** Kits must stay near camp unless an older Clanmate is with them. */
  private checkKitSafety(p: PlayerRuntime, now: number) {
    if (p.char.rank !== "kit" || !p.char.clan) return;
    const camp = this.ctx.map.location("camp", p.char.clan);
    if (!camp) return;
    const outside = Math.hypot(camp.x - p.state.x, camp.y - p.state.y) > camp.radius + 500;
    const escorted = [...this.ctx.players.values()].some((o) => o !== p && o.char.clan === p.char.clan && o.char.rank !== "kit" && Math.hypot(o.state.x - p.state.x, o.state.y - p.state.y) < 600);
    if (!outside || escorted) {
      p.outsideCampSince = null;
      return;
    }
    if (p.outsideCampSince === null) {
      p.outsideCampSince = now;
      this.ctx.notify(p, "warning", "Kits shouldn't wander far from camp alone! Head back before someone notices...");
    } else if (now - p.outsideCampSince > 15_000) {
      const pos = this.ctx.map.findOpenSpot(camp.x, camp.y, GAME_CONFIG.movement.collisionRadius, this.ctx.rng);
      p.state.x = pos.x;
      p.state.y = pos.y;
      p.outsideCampSince = null;
      this.ctx.notify(p, "info", "A warrior found you and carried you back to camp by your scruff!");
    }
  }
}

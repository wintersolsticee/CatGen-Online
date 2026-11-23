import Phaser from "phaser";
import {
  C2S, COMBAT_MOVES, GAME_CONFIG, getWorldClock, stepMovement, getPrey, getItem, getHerb, herbDisplayName, isRank,
  type WorldMap, type CombatMoveId, type CombatEvent, type PrivateState, type ClanInfo, type Rank, type ActiveCondition, type Weather, type WorldClock,
} from "@catgen/shared";
import type { Net, NetPlayer } from "./net.ts";
import { CatSprite } from "./CatSprite.ts";
import { ChunkLayer } from "./world/ChunkLayer.ts";
import { ObjectLayer } from "./world/ObjectLayer.ts";
import type { FxScene } from "./FxScene.ts";
import { preyArt, forageArt, pixelate } from "../render/object-textures.ts";
import { WORLD_PIXEL } from "../render/env-assets.ts";
import { ensureCanvasTexture } from "./textures.ts";
import { KEYBINDS, type Keybinds } from "./keybinds.ts";

/** Callbacks from the scene to the DOM HUD (keeps UI and game logic decoupled). */
export interface GameBridge {
  onLocalState(p: NetPlayer, clock: WorldClock, weather: Weather, territory: string | null): void;
  onPrompt(text: string | null): void;
  onSelectCat(key: string | null): void;
  onOpenHerbStore(): void;
  onCooldown(move: CombatMoveId, until: number, duration: number): void;
  isTyping(): boolean;
}

export interface GameSceneData {
  net: Net;
  map: WorldMap;
  bridge: GameBridge;
  graphics: "high" | "low";
}

interface PendingInput { seq: number; dx: number; dy: number; run: boolean; stalk: boolean; dt: number }

const SEND_INTERVAL = 50;
/** Camera zooms where WORLD_PIXEL * zoom is a whole number (crisp pixel art). */
const ZOOM_STEPS = [0.5, 0.625, 0.75, 0.875, 1];

export class GameScene extends Phaser.Scene {
  private net!: Net;
  private map!: WorldMap;
  private bridge!: GameBridge;
  private chunks!: ChunkLayer;
  private objects!: ObjectLayer;
  private cats = new Map<string, CatSprite>();
  private remote = new Map<string, { x: number; y: number }>();
  private preySprites = new Map<string, { img: Phaser.GameObjects.Image; x: number; y: number; flying: boolean }>();
  private forageSprites = new Map<string, Phaser.GameObjects.Image>();
  private keys!: Record<keyof Keybinds, Phaser.Input.Keyboard.Key>;
  private local = { x: 0, y: 0, stamina: 100, facing: 0, moving: false, running: false, stalking: false, ready: false };
  private pending: PendingInput[] = [];
  private bucket = { dx: 0, dy: 0, run: false, stalk: false, dt: 0 };
  private seq = 0;
  private sendTimer = 0;
  private stalkToggle = false;
  private cooldowns: Partial<Record<CombatMoveId, number>> = {};
  private priv: PrivateState | null = null;
  private season = "";
  private hudTimer = 0;
  private graphics: "high" | "low" = "high";
  private zoomTarget = 0.75;
  selected: string | null = null;
  /** Debug/preview only: shifts the displayed time of day (never sent to the server). */
  debugTimeOffset = 0;

  constructor() {
    super("game");
  }

  init(data: GameSceneData) {
    this.net = data.net;
    this.map = data.map;
    this.bridge = data.bridge;
    this.graphics = data.graphics;
  }

  setPrivateState(p: PrivateState) {
    this.priv = p;
  }

  private pileSprites: Phaser.GameObjects.Image[] = [];
  /** Show the Clan's fresh-kill pile contents as actual prey on the pile. */
  private pendingClan: ClanInfo | null = null;
  setClanInfo(info: ClanInfo) {
    if (!this.chunks) {
      this.pendingClan = info; // scene not created yet
      return;
    }
    for (const s of this.pileSprites) s.destroy();
    this.pileSprites = [];
    const pile = this.map.location("fresh_kill_pile", info.clan);
    if (!pile) return;
    const items = Object.entries(info.freshKill).flatMap(([id, n]) => Array(Math.min(n, 12)).fill(id) as string[]).slice(0, 14);
    items.forEach((id, i) => {
      const def = getPrey(id);
      if (!def) return;
      const art = preyArt(def);
      const key = ensureCanvasTexture(this, "preypx_" + def.id, () => pixelate(art.canvas, 0.5, WORLD_PIXEL));
      this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      const ring = Math.floor(i / 6);
      const a = (i % 6) / 6 * Math.PI * 2 + ring;
      const img = this.add.image(pile.x + Math.cos(a) * (26 - ring * 12), pile.y - 6 + Math.sin(a) * 9 - ring * 8, key)
        .setOrigin(art.anchorX, art.anchorY).setScale(WORLD_PIXEL * 0.75).setFlipX(i % 2 === 0).setDepth(pile.y + i);
      this.pileSprites.push(img);
    });
  }

  create() {
    const clock = getWorldClock(this.net.state.worldTime);
    this.season = clock.season;
    this.cameras.main.setBounds(0, 0, this.map.pixelWidth, this.map.pixelHeight);
    this.cameras.main.setBackgroundColor("#1d2a1a");
    this.chunks = new ChunkLayer(this, this.map, clock.season);
    if (this.graphics === "low") this.chunks.maxChunks = 36;
    this.objects = new ObjectLayer(this, this.map, clock.season);
    // Atmosphere runs in its own scene layered above the world (unaffected by zoom).
    const fx = this.scene.get("fx") as FxScene | null;
    if (fx) {
      fx.particlesEnabled = this.graphics === "high";
      this.scene.launch("fx");
      this.scene.bringToTop("fx");
    }

    const kb = this.input.keyboard!;
    kb.disableGlobalCapture();
    this.keys = Object.fromEntries(Object.entries(KEYBINDS).map(([k, code]) => [k, kb.addKey(code, false)])) as Record<keyof Keybinds, Phaser.Input.Keyboard.Key>;

    // Zoom only in steps that keep every art pixel a whole number of screen pixels.
    this.input.on("wheel", (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      const i = ZOOM_STEPS.indexOf(this.zoomTarget);
      this.zoomTarget = ZOOM_STEPS[Phaser.Math.Clamp((i < 0 ? 2 : i) + (dy > 0 ? -1 : 1), 0, ZOOM_STEPS.length - 1)];
    });
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) return;
      const wp = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      let hit: string | null = null;
      for (const [key, cat] of this.cats) if (!cat.isLocal && cat.hitTest(wp.x, wp.y)) hit = key;
      this.selected = hit;
      this.bridge.onSelectCat(hit);
    });
    this.input.mouse?.disableContextMenu();

    this.net.on("playerAdded", (key, p) => this.addCat(key, p));
    this.net.on("playerRemoved", (key) => this.removeCat(key));
    this.net.on("combat", (e) => this.onCombat(e));
    this.net.on("chat", (e) => {
      if (e.channel !== "local" && e.channel !== "emote") return;
      for (const [key, cat] of this.cats) {
        const p = this.net.state.players.get(key);
        if (p && p.id === e.fromId && e.channel === "local") cat.say(e.text);
      }
    });
    this.net.on("reconnected", () => {
      this.pending = [];
      this.local.ready = false;
    });
    this.net.state.players.forEach((p, key) => this.addCat(key, p));

    // Paint the terrain around the spawn synchronously so the first frame is complete.
    const me = this.net.state.players.get(this.net.sessionId);
    if (me) {
      this.cameras.main.centerOn(me.x, me.y);
      this.chunks.update(this.cameras.main.worldView, 0, 0, true);
    }
    this.scale.on("resize", () => this.cameras.main.setSize(this.scale.width, this.scale.height));
    if (this.pendingClan) this.setClanInfo(this.pendingClan);
  }

  private addCat(key: string, p: NetPlayer) {
    if (this.cats.has(key)) return;
    const cat = new CatSprite(this, { name: p.name, clan: p.clan, rank: p.rank, appearance: p.appearance, equipped: p.equipped, isLocal: key === this.net.sessionId });
    this.cats.set(key, cat);
    this.remote.set(key, { x: p.x, y: p.y });
    if (key === this.net.sessionId) this.cameras.main.startFollow(cat, true, 0.12, 0.12);
  }

  private removeCat(key: string) {
    this.cats.get(key)?.destroy();
    this.cats.delete(key);
    this.remote.delete(key);
    if (this.selected === key) {
      this.selected = null;
      this.bridge.onSelectCat(null);
    }
  }

  private catByCharId(id: string): CatSprite | undefined {
    for (const [key, cat] of this.cats) if (this.net.state.players.get(key)?.id === id) return cat;
    return undefined;
  }

  private onCombat(e: CombatEvent) {
    const attacker = this.catByCharId(e.attackerId);
    const me = this.net.state.players.get(this.net.sessionId);
    if (attacker && !(me && e.attackerId === me.id)) attacker.playAttack(e.move);
    if (!e.targetId) return;
    const target = this.catByCharId(e.targetId);
    if (!target) return;
    if (e.hit) target.flashHit();
    const text = e.dodged ? "Dodged!" : e.blocked ? `Blocked ${Math.round(e.damage)}` : `-${Math.round(e.damage)}`;
    const color = e.dodged ? "#9fd8ff" : e.blocked ? "#f2d13a" : "#ff7a5a";
    const t = this.add.text(target.x, target.y - 110 * target.baseScale, text + (e.injury ? " ✦" : ""), {
      fontFamily: "Nunito, system-ui", fontSize: "20px", fontStyle: "800", color, stroke: "#1a1410", strokeThickness: 5,
    }).setOrigin(0.5).setDepth(800000);
    this.tweens.add({ targets: t, y: t.y - 50, alpha: 0, duration: 900, ease: "Cubic.easeOut", onComplete: () => t.destroy() });
    if (me && e.targetId === me.id && e.hit) this.cameras.main.shake(120, 0.004);
  }

  private myRank(): Rank {
    const r = this.net.state.players.get(this.net.sessionId)?.rank;
    return isRank(r) ? r : "warrior";
  }

  private myConditions(): ActiveCondition[] {
    return this.priv?.conditions.map((c) => ({ id: c.id as ActiveCondition["id"], elapsedSec: c.elapsedSec })) ?? [];
  }

  private attackFacing(): number {
    const pointer = this.input.activePointer;
    const wp = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    if (pointer.x > 0 || pointer.y > 0) return Math.atan2(wp.y - this.local.y + 40, wp.x - this.local.x);
    return this.local.facing;
  }

  private tryMove(move: CombatMoveId) {
    const now = this.time.now;
    if ((this.cooldowns[move] ?? 0) > now) return;
    const def = COMBAT_MOVES[move];
    this.cooldowns[move] = now + def.cooldownMs;
    this.bridge.onCooldown(move, now + def.cooldownMs, def.cooldownMs);
    const facing = this.attackFacing();
    this.local.facing = facing;
    this.net.send(C2S.attack, { move, facing });
    this.cats.get(this.net.sessionId)?.playAttack(move);
  }

  /** Interaction prompt + what pressing E will do. */
  private interaction(me: NetPlayer): { text: string; action: () => void } | null {
    const range = GAME_CONFIG.interaction.range;
    if (me.clan) {
      const pile = this.map.location("fresh_kill_pile", me.clan as never);
      if (pile && Math.hypot(pile.x - me.x, pile.y - me.y) <= pile.radius) {
        if (me.carrying) return { text: "Drop your prey on the fresh-kill pile", action: () => this.net.send(C2S.interact) };
      }
    }
    let best: { id: string; d: number; itemId: string } | null = null;
    this.net.state.forage.forEach((f) => {
      const d = Math.hypot(f.x - this.local.x, f.y - this.local.y);
      if (d < range && (!best || d < best.d)) best = { id: f.id, d, itemId: f.itemId };
    });
    if (best) {
      const b = best as { itemId: string };
      const herb = getHerb(b.itemId);
      const name = herb ? herbDisplayName(this.myRank(), this.priv?.knownHerbs ?? [], b.itemId) : getItem(b.itemId)?.name ?? b.itemId;
      return { text: `Gather ${name}`, action: () => this.net.send(C2S.interact) };
    }
    if (me.clan) {
      const pile = this.map.location("fresh_kill_pile", me.clan as never);
      if (pile && Math.hypot(pile.x - me.x, pile.y - me.y) <= pile.radius) return { text: "Eat from the fresh-kill pile", action: () => this.net.send(C2S.eatFromPile) };
      const den = this.map.location("medicine_den", me.clan as never);
      if (den && Math.hypot(den.x - me.x, den.y - me.y) <= den.radius + 60) return { text: "Open the medicine den's herb store", action: () => this.bridge.onOpenHerbStore() };
    }
    return null;
  }

  override update(time: number, _delta: number) {
    // Use real elapsed time (Phaser's smoothed delta is clamped on slow devices,
    // which would make movement and timers run slow and disagree with the server).
    const dt = Math.min(this.game.loop.rawDelta || _delta, 250);
    const state = this.net.state;
    const me = state.players.get(this.net.sessionId);
    const clock = getWorldClock(state.worldTime + this.debugTimeOffset);
    if (clock.season !== this.season) {
      this.season = clock.season;
      this.chunks.setSeason(clock.season);
      this.objects.setSeason(clock.season);
    }

    // ---- Local input & prediction ------------------------------------------
    if (me) {
      if (!this.local.ready) {
        Object.assign(this.local, { x: me.x, y: me.y, stamina: me.stamina, ready: true });
      }
      const typing = this.bridge.isTyping();
      const k = this.keys;
      let dx = 0, dy = 0;
      if (!typing) {
        if (k.left.isDown || k.leftAlt.isDown) dx -= 1;
        if (k.right.isDown || k.rightAlt.isDown) dx += 1;
        if (k.up.isDown || k.upAlt.isDown) dy -= 1;
        if (k.down.isDown || k.downAlt.isDown) dy += 1;
        if (Phaser.Input.Keyboard.JustDown(k.stalk)) this.stalkToggle = !this.stalkToggle;
        if (Phaser.Input.Keyboard.JustDown(k.swipe)) this.tryMove("swipe");
        if (Phaser.Input.Keyboard.JustDown(k.bite)) this.tryMove("bite");
        if (Phaser.Input.Keyboard.JustDown(k.pounce)) this.tryMove("pounce");
        if (Phaser.Input.Keyboard.JustDown(k.block)) this.tryMove("block");
        if (Phaser.Input.Keyboard.JustDown(k.dodge)) this.tryMove("dodge");
      }
      const len = Math.hypot(dx, dy);
      if (len > 0) { dx /= len; dy /= len; }
      const run = !typing && k.run.isDown;
      const stalk = this.stalkToggle;
      if (me.health > 0) {
        const res = stepMovement(this.map, { x: this.local.x, y: this.local.y, stamina: this.local.stamina }, { dx, dy, run, stalk, dt: dt / 1000 }, { rank: this.myRank(), conditions: this.myConditions() });
        this.local.x = res.x;
        this.local.y = res.y;
        this.local.stamina = res.stamina;
        this.local.moving = res.moving;
        this.local.running = res.running;
        this.local.stalking = stalk && res.moving;
        if (len > 0) this.local.facing = Math.atan2(dy, dx);
      }
      // Accumulate into the current input bucket; flush at a fixed rate.
      this.bucket.dt += dt;
      if (len > 0) { this.bucket.dx = dx; this.bucket.dy = dy; }
      this.bucket.run = run;
      this.bucket.stalk = stalk;
      this.sendTimer += dt;
      if (this.sendTimer >= SEND_INTERVAL) {
        this.sendTimer = 0;
        const moving = len > 0 || this.bucket.dx !== 0 || this.bucket.dy !== 0;
        const lastPending = this.pending[this.pending.length - 1];
        const wasMoving = lastPending && (lastPending.dx !== 0 || lastPending.dy !== 0);
        if (moving || wasMoving) {
          const input: PendingInput = { seq: ++this.seq, dx: len > 0 ? dx : 0, dy: len > 0 ? dy : 0, run, stalk, dt: Math.min(250, Math.round(this.bucket.dt)) };
          this.pending.push(input);
          if (this.pending.length > 60) this.pending.shift();
          this.net.send(C2S.input, input);
        }
        this.bucket = { dx: 0, dy: 0, run, stalk, dt: 0 };
      }
      // Reconcile: replay unacknowledged inputs on top of the authoritative position.
      this.pending = this.pending.filter((p) => p.seq > me.lastSeq);
      let pred = { x: me.x, y: me.y, stamina: me.stamina };
      for (const p of this.pending) {
        const r = stepMovement(this.map, pred, { ...p, dt: p.dt / 1000 }, { rank: this.myRank(), conditions: this.myConditions() });
        pred = { x: r.x, y: r.y, stamina: r.stamina };
      }
      const err = Math.hypot(pred.x - this.local.x, pred.y - this.local.y);
      if (err > 260) {
        this.local.x = pred.x;
        this.local.y = pred.y;
      } else if (err > 1 && this.pending.length === 0) {
        const k2 = Math.min(1, dt / 120);
        this.local.x += (pred.x - this.local.x) * k2;
        this.local.y += (pred.y - this.local.y) * k2;
      } else if (err > 40) {
        this.local.x += (pred.x - this.local.x) * 0.1;
        this.local.y += (pred.y - this.local.y) * 0.1;
      }
      this.local.stamina = Math.min(this.local.stamina, me.stamina + 5);

      if (!typing && Phaser.Input.Keyboard.JustDown(this.keys.interact)) this.interaction(me)?.action();
    }

    // ---- Cats ----------------------------------------------------------------
    const lerpK = 1 - Math.exp(-dt / 70);
    state.players.forEach((p, key) => {
      let cat = this.cats.get(key);
      if (!cat) { this.addCat(key, p); cat = this.cats.get(key)!; }
      cat.setAppearance(p.appearance, p.equipped, p.rank);
      if (key === this.net.sessionId) {
        cat.tick(dt, { x: this.local.x, y: this.local.y, facing: this.local.facing, moving: this.local.moving, running: this.local.running, stalking: this.local.stalking, pose: p.pose, health: p.health, blocking: p.blocking, carrying: p.carrying });
      } else {
        const r = this.remote.get(key)!;
        const far = Math.hypot(p.x - r.x, p.y - r.y) > 400;
        r.x = far ? p.x : r.x + (p.x - r.x) * lerpK;
        r.y = far ? p.y : r.y + (p.y - r.y) * lerpK;
        cat.tick(dt, { x: r.x, y: r.y, facing: p.facing, moving: p.moving && Math.hypot(p.x - r.x, p.y - r.y) > 0.5 || p.moving, running: p.running, stalking: p.stalking, pose: p.pose, health: p.health, blocking: p.blocking, carrying: p.carrying });
      }
    });

    // ---- Prey ----------------------------------------------------------------
    const seenPrey = new Set<string>();
    state.prey.forEach((pr, id) => {
      seenPrey.add(id);
      let s = this.preySprites.get(id);
      const def = getPrey(pr.species);
      if (!def) return;
      if (!s) {
        const art = preyArt(def);
        const key = ensureCanvasTexture(this, "preypx_" + def.id, () => pixelate(art.canvas, 0.5, WORLD_PIXEL));
        this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
        const img = this.add.image(pr.x, pr.y, key).setOrigin(art.anchorX, art.anchorY).setScale(WORLD_PIXEL);
        s = { img, x: pr.x, y: pr.y, flying: false };
        this.preySprites.set(id, s);
      }
      s.x += (pr.x - s.x) * lerpK;
      s.y += (pr.y - s.y) * lerpK;
      const moving = pr.mode === "wander" || pr.mode === "flee";
      const hop = def.look.shape === "rabbit" || def.look.shape === "frog" ? Math.abs(Math.sin(time / (pr.mode === "flee" ? 70 : 140))) * 8 : Math.sin(time / 60) * (moving ? 1.5 : 0);
      s.img.setPosition(Math.round(s.x), Math.round(s.y - (moving ? hop : 0)));
      s.img.setFlipX(Math.cos(pr.facing) < 0);
      s.img.setDepth(s.y);
      if (pr.mode === "fly" && !s.flying) {
        s.flying = true;
        this.tweens.add({ targets: s.img, y: s.img.y - 220, x: s.img.x + (Math.random() - 0.5) * 200, alpha: 0, duration: 1100, ease: "Quad.easeIn" });
      }
      // Swimmers are partly submerged.
      if (def.behaviour === "swimmer") s.img.setAlpha(0.65 + Math.sin(time / 400 + s.x) * 0.15);
    });
    for (const [id, s] of this.preySprites) if (!seenPrey.has(id)) { s.img.destroy(); this.preySprites.delete(id); }

    // ---- Forage --------------------------------------------------------------
    const seenForage = new Set<string>();
    state.forage.forEach((f, id) => {
      seenForage.add(id);
      let img = this.forageSprites.get(id);
      if (!img) {
        const item = getItem(f.itemId);
        const art = forageArt(getHerb(f.itemId) ?? null, f.itemId, item?.color ?? "#ccc");
        const key = ensureCanvasTexture(this, "foragepx_" + f.itemId, () => pixelate(art.canvas, 0.75, WORLD_PIXEL));
        this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
        img = this.add.image(f.x, f.y, key).setOrigin(art.anchorX, art.anchorY).setScale(WORLD_PIXEL).setDepth(f.y);
        this.forageSprites.set(id, img);
      }
      // Gentle glint so collectibles are discoverable.
      const near = Math.hypot(f.x - this.local.x, f.y - this.local.y) < 600;
      img.setVisible(near || Math.hypot(f.x - this.cameras.main.midPoint.x, f.y - this.cameras.main.midPoint.y) < 1400);
      img.setAlpha(0.85 + Math.sin(time / 400 + f.x) * 0.15);
    });
    for (const [id, img] of this.forageSprites) if (!seenForage.has(id)) { img.destroy(); this.forageSprites.delete(id); }

    // ---- World ---------------------------------------------------------------
    const cam = this.cameras.main;
    if (cam.zoom !== this.zoomTarget) cam.setZoom(this.zoomTarget);
    this.chunks.update(cam.worldView, time, this.graphics === "high" ? 2 : 1);
    this.objects.wind = state.weather === "storm" ? 3 : state.weather === "rain" ? 1.8 : 1;
    this.objects.update(cam.worldView, time, this.local.ready ? this.local : null);
    const underground = this.map.terrainAt(this.local.x, this.local.y).underground === true;
    const screen = { x: (this.local.x - cam.worldView.x) * cam.zoom, y: (this.local.y - 50 - cam.worldView.y) * cam.zoom };
    (this.scene.get("fx") as FxScene | null)?.effects?.update(clock, state.weather as Weather, underground, [{ x: screen.x, y: screen.y, r: 330 * cam.zoom }], time, dt / 1000);

    // ---- HUD -----------------------------------------------------------------
    this.hudTimer += dt;
    if (me && this.hudTimer > 100) {
      this.hudTimer = 0;
      this.bridge.onLocalState(me, clock, state.weather as Weather, this.map.territoryAt(this.local.x, this.local.y));
      const inter = this.interaction(me);
      this.bridge.onPrompt(inter ? inter.text : null);
    }
  }

  /** Positions for the minimap. */
  localPosition() {
    return { x: this.local.x, y: this.local.y };
  }
}

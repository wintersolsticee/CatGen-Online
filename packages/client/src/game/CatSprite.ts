import Phaser from "phaser";
import { normalizeAppearance, getClan, getPrey, type Appearance, type CombatMoveId } from "@catgen/shared";
import { ANIMS, ANIM_NAMES, CAT_PIXEL_SCALE, FEET_X, FEET_Y, FRAME, catSheet, frameCount, type CatAnim } from "../render/cat-sprites.ts";
import { preyArt, pixelate } from "../render/object-textures.ts";
import { WORLD_PIXEL } from "../render/env-assets.ts";
import { ensureCanvasTexture } from "./textures.ts";

const RANK_SCALE: Record<string, number> = { kit: 0.6, apprentice: 0.85, medicine_apprentice: 0.85 };

/** Everything the sprite needs each frame (from server state or local prediction). */
export interface CatView {
  x: number;
  y: number;
  facing: number;
  moving: boolean;
  running: boolean;
  stalking: boolean;
  pose: string;
  health: number;
  blocking: boolean;
  carrying: string;
}

/** Register Phaser textures + animations for a sprite/coat once. Returns the key prefix. */
function ensureCatAnims(scene: Phaser.Scene, a: Pick<Appearance, "sprite" | "coat">): string {
  const prefix = `cat_${a.sprite}_${a.coat}`;
  for (const anim of ANIM_NAMES) {
    const key = `${prefix}_${anim}`;
    if (scene.textures.exists(key)) continue;
    const sheet = catSheet(a.sprite, a.coat, anim);
    const tex = scene.textures.addCanvas(key, sheet)!;
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    const n = frameCount(sheet);
    for (let i = 0; i < n; i++) tex.add(i, 0, i * FRAME, 0, FRAME, FRAME);
    if (!scene.anims.exists(key)) {
      scene.anims.create({
        key,
        frames: Array.from({ length: n }, (_, i) => ({ key, frame: i })),
        frameRate: ANIMS[anim].fps,
        repeat: ANIMS[anim].loop ? -1 : 0,
      });
    }
  }
  return prefix;
}

/**
 * A player's cat: hand-drawn sprite animations (idle, walk, run, sit, lie,
 * sleep, groom...), plus procedural extras layered on top: attack lunges,
 * pounce arcs, hit flashes, name label, health bar, speech bubbles and carried prey.
 * Rendering only reads CatView, so it never affects game logic.
 */
export class CatSprite extends Phaser.GameObjects.Container {
  private body_: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Ellipse;
  private label: Phaser.GameObjects.Text;
  private hpBar: Phaser.GameObjects.Graphics;
  private carried: Phaser.GameObjects.Image | null = null;
  private carriedId = "";
  private bubble: Phaser.GameObjects.Container | null = null;
  private bubbleUntil = 0;
  private appearanceJson = "";
  private rankScale = 1;
  private prefix = "";
  private currentAnim: CatAnim | null = null;
  private faceSign = 1;
  private attack: { move: CombatMoveId; t: number; dur: number } | null = null;
  private hitFlash = 0;
  private hpShownUntil = 0;
  baseScale = 1;
  readonly isLocal: boolean;

  constructor(scene: Phaser.Scene, opts: { name: string; clan: string; rank: string; appearance: string; equipped: string; isLocal: boolean }) {
    super(scene, 0, 0);
    this.isLocal = opts.isLocal;
    this.shadow = scene.add.ellipse(0, 0, 110, 20, 0x0a0f05, 0.28);
    this.body_ = scene.add.sprite(0, 0, "__DEFAULT").setOrigin(FEET_X / FRAME, FEET_Y / FRAME);
    this.label = scene.add.text(0, 0, opts.name, {
      fontFamily: "Nunito, system-ui, sans-serif", fontSize: "15px", fontStyle: "700", color: opts.isLocal ? "#fff3c4" : "#ffffff",
      stroke: "#1a1410", strokeThickness: 4,
    }).setOrigin(0.5, 1);
    this.label.setShadow(0, 0, getClan(opts.clan)?.color ?? "#e8e2d0", 6, true, true);
    this.hpBar = scene.add.graphics();
    this.add([this.shadow, this.body_, this.label, this.hpBar]);
    this.setAppearance(opts.appearance, opts.equipped, opts.rank);
    scene.add.existing(this);
  }

  setAppearance(appearanceJson: string, _equippedJson: string, rank: string) {
    const rs = RANK_SCALE[rank] ?? 1;
    if (appearanceJson === this.appearanceJson && rs === this.rankScale) return;
    this.appearanceJson = appearanceJson;
    this.rankScale = rs;
    let a: Appearance;
    try { a = normalizeAppearance(JSON.parse(appearanceJson)); } catch { a = normalizeAppearance({}); }
    this.prefix = ensureCatAnims(this.scene, a);
    this.baseScale = a.size * rs;
    this.body_.setScale(CAT_PIXEL_SCALE * this.baseScale);
    const px = CAT_PIXEL_SCALE * this.baseScale;
    this.shadow.setSize(17 * px, 3 * px);
    this.label.setY(-(17 * px + 10));
    this.currentAnim = null; // force re-play with the new textures
  }

  setLabel(name: string, clan: string) {
    this.label.setText(name);
    this.label.setShadow(0, 0, getClan(clan)?.color ?? "#e8e2d0", 6, true, true);
  }

  playAttack(move: CombatMoveId) {
    const dur = move === "pounce" ? 450 : move === "bite" ? 340 : move === "dodge" ? 300 : move === "block" ? 600 : 260;
    this.attack = { move, t: 0, dur };
  }

  flashHit() {
    this.hitFlash = 200;
    this.hpShownUntil = this.scene.time.now + 4000;
  }

  say(text: string) {
    this.bubble?.destroy();
    const t = this.scene.add.text(0, 0, text.length > 90 ? text.slice(0, 88) + "…" : text, {
      fontFamily: "Nunito, system-ui, sans-serif", fontSize: "14px", color: "#2a2018", wordWrap: { width: 220 }, align: "center",
    }).setOrigin(0.5, 1);
    const pad = 8;
    const bg = this.scene.add.graphics();
    bg.fillStyle(0xfffbf0, 0.95);
    bg.fillRoundedRect(-t.width / 2 - pad, -t.height - pad, t.width + pad * 2, t.height + pad * 2, 10);
    bg.fillTriangle(-6, pad - 1, 6, pad - 1, 0, pad + 8);
    this.bubble = this.scene.add.container(0, this.label.y - 24, [bg, t]);
    this.add(this.bubble);
    this.bubbleUntil = this.scene.time.now + 4000 + text.length * 50;
  }

  private play(anim: CatAnim, speed = 1) {
    if (anim !== this.currentAnim) {
      this.currentAnim = anim;
      this.body_.play(`${this.prefix}_${anim}`);
    }
    this.body_.anims.timeScale = speed;
  }

  /** Per-frame update from view data. */
  tick(dtMs: number, v: CatView) {
    this.setPosition(Math.round(v.x), Math.round(v.y));
    this.setDepth(v.y);
    const fx = Math.cos(v.facing);
    if (fx > 0.2) this.faceSign = 1;
    else if (fx < -0.2) this.faceSign = -1;
    this.body_.setFlipX(this.faceSign < 0);

    // Choose the animation.
    let anim: CatAnim = "idle";
    let speed = 1;
    if (v.health <= 0) anim = "lie";
    else if (v.moving) {
      anim = v.running ? "run" : "walk";
      if (v.stalking) speed = 0.55;
    } else {
      switch (v.pose) {
        case "sit": anim = "sit"; break;
        case "lie": anim = "lie"; break;
        case "sleep": anim = "sleep"; break;
        case "groom": case "eat": anim = "groom"; break;
        case "stretch": anim = "stretch"; break;
        case "purr": case "hiss": case "meow": anim = "meow"; break;
        case "nuzzle": case "wag": anim = "itch"; break;
      }
    }

    // Attack overlays: lunges and pounce arcs on top of the sprite.
    let lunge = 0, jump = 0, squash = 1;
    if (this.attack) {
      this.attack.t += dtMs;
      const k = Math.min(1, this.attack.t / this.attack.dur);
      const bell = Math.sin(k * Math.PI);
      switch (this.attack.move) {
        case "swipe": anim = "itch"; lunge = bell * 14; break;
        case "bite": anim = "run"; lunge = bell * 22; break;
        case "pounce": anim = "run"; lunge = bell * 18; jump = bell * 46; break;
        case "block": anim = "sit"; squash = 1 - bell * 0.08; break;
        case "dodge": anim = "run"; break;
      }
      if (k >= 1) this.attack = null;
    }
    this.play(anim, speed);
    this.body_.setPosition(lunge * this.faceSign, -jump);
    this.body_.setScale(CAT_PIXEL_SCALE * this.baseScale, CAT_PIXEL_SCALE * this.baseScale * squash * (v.stalking && v.moving ? 0.88 : 1));
    this.shadow.setScale(1 - jump / 140);
    this.body_.setAlpha(this.attack?.move === "dodge" ? 0.5 : 1);

    // Carried prey, held at the mouth.
    const first = v.carrying.split(",").filter(Boolean)[0] ?? "";
    if (first !== this.carriedId) {
      this.carriedId = first;
      this.carried?.destroy();
      this.carried = null;
      const def = first ? getPrey(first) : undefined;
      if (def) {
        const art = preyArt(def);
        const key = ensureCanvasTexture(this.scene, "preypx_" + def.id, () => pixelate(art.canvas, 0.5, WORLD_PIXEL));
        this.scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
        this.carried = this.scene.add.image(0, 0, key).setOrigin(0.5, 0.4).setScale(WORLD_PIXEL * 0.6);
        this.add(this.carried);
      }
    }
    if (this.carried) {
      const s = CAT_PIXEL_SCALE * this.baseScale;
      this.carried.setPosition((11 * s + lunge) * this.faceSign, -10 * s - jump).setFlipX(this.faceSign < 0).setRotation(0.9 * this.faceSign);
      this.carried.setVisible(anim !== "lie" && anim !== "sleep");
    }

    if (this.hitFlash > 0) {
      this.hitFlash -= dtMs;
      this.body_.setTintFill(0xff6650);
      if (this.hitFlash <= 0) this.body_.clearTint();
    } else if (v.blocking) this.body_.setTint(0xbfe3ff);
    else this.body_.clearTint();

    this.hpBar.clear();
    if (v.health < 100 && (this.scene.time.now < this.hpShownUntil || v.health < 50)) {
      const w = 64, y = this.label.y + 4;
      this.hpBar.fillStyle(0x1a1410, 0.7).fillRoundedRect(-w / 2 - 2, y, w + 4, 8, 4);
      const c = v.health > 60 ? 0x7fd16a : v.health > 30 ? 0xf2c230 : 0xe0503a;
      this.hpBar.fillStyle(c, 1).fillRoundedRect(-w / 2, y + 2, (w * Math.max(0, v.health)) / 100, 4, 2);
    }
    if (this.bubble && this.scene.time.now > this.bubbleUntil) {
      this.bubble.destroy();
      this.bubble = null;
    }
  }

  /** Is a world point over this cat? (for click selection) */
  hitTest(x: number, y: number): boolean {
    const px = CAT_PIXEL_SCALE * this.baseScale;
    return Math.abs(x - this.x) < 12 * px && y < this.y + 10 && y > this.y - 17 * px;
  }
}

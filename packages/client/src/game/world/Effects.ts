import Phaser from "phaser";
import type { WorldClock, Weather } from "@catgen/shared";
import { makeCanvas } from "../../render/color.ts";
import { ensureCanvasTexture } from "../textures.ts";

/**
 * Atmosphere: day/night lighting with a light around the player, weather
 * particles (rain, snow, storm, fog), and ambient particles (leaves, fireflies,
 * pollen). Purely visual: no gameplay state lives here.
 */
export class Effects {
  private night: Phaser.GameObjects.RenderTexture;
  private tint: Phaser.GameObjects.Rectangle;
  private fog: Phaser.GameObjects.TileSprite;
  private rain: Phaser.GameObjects.Particles.ParticleEmitter;
  private snow: Phaser.GameObjects.Particles.ParticleEmitter;
  private leaves: Phaser.GameObjects.Particles.ParticleEmitter;
  private fireflies: Phaser.GameObjects.Particles.ParticleEmitter;
  private motes: Phaser.GameObjects.Particles.ParticleEmitter;
  private lightKey: string;
  private lightImg!: Phaser.GameObjects.Image;
  private nextLightning = 0;
  particlesEnabled = true;

  constructor(private scene: Phaser.Scene) {
    const { width, height } = scene.scale;
    this.lightKey = ensureCanvasTexture(scene, "fx_light", () => {
      const { canvas, ctx } = makeCanvas(512, 512);
      const g = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.45, "rgba(255,255,255,0.75)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 512, 512);
      return canvas;
    });
    ensureCanvasTexture(scene, "fx_drop", () => {
      const { canvas, ctx } = makeCanvas(4, 26);
      const g = ctx.createLinearGradient(0, 0, 0, 26);
      g.addColorStop(0, "rgba(200,220,255,0)");
      g.addColorStop(1, "rgba(220,235,255,0.75)");
      ctx.fillStyle = g;
      ctx.fillRect(1, 0, 2, 26);
      return canvas;
    });
    ensureCanvasTexture(scene, "fx_dot", () => {
      const { canvas, ctx } = makeCanvas(16, 16);
      const g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 16, 16);
      return canvas;
    });
    ensureCanvasTexture(scene, "fx_leaf", () => {
      const { canvas, ctx } = makeCanvas(14, 9);
      ctx.fillStyle = "#d98a2b";
      ctx.beginPath();
      ctx.ellipse(7, 4.5, 6.5, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      return canvas;
    });
    ensureCanvasTexture(scene, "fx_fog", () => {
      const { canvas, ctx } = makeCanvas(512, 512);
      for (let i = 0; i < 40; i++) {
        const x = Math.random() * 512, y = Math.random() * 512, r = 60 + Math.random() * 120;
        for (const ox of [-512, 0, 512]) for (const oy of [-512, 0, 512]) {
          const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
          g.addColorStop(0, "rgba(230,235,240,0.22)");
          g.addColorStop(1, "rgba(230,235,240,0)");
          ctx.fillStyle = g;
          ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
        }
      }
      return canvas;
    });

    this.lightImg = scene.make.image({ key: this.lightKey, add: false }).setOrigin(0.5);
    this.fog = scene.add.tileSprite(0, 0, width, height, "fx_fog").setOrigin(0).setScrollFactor(0).setDepth(900000).setAlpha(0);
    this.tint = scene.add.rectangle(0, 0, width, height, 0xff9040, 0).setOrigin(0).setScrollFactor(0).setDepth(900001);
    this.night = scene.add.renderTexture(0, 0, width, height).setOrigin(0).setScrollFactor(0).setDepth(900002);

    const W = () => scene.scale.width, H = () => scene.scale.height;
    this.rain = scene.add.particles(0, 0, "fx_drop", {
      x: { min: -100, max: W() + 200 }, y: -30, lifespan: 900, speedY: { min: 900, max: 1200 }, speedX: { min: -160, max: -120 },
      quantity: 6, frequency: 16, rotate: 8, alpha: { start: 0.8, end: 0.5 }, emitting: false,
    }).setScrollFactor(0).setDepth(900003);
    this.snow = scene.add.particles(0, 0, "fx_dot", {
      x: { min: -100, max: W() + 100 }, y: -20, lifespan: 7000, speedY: { min: 40, max: 90 }, speedX: { min: -30, max: 30 },
      scale: { min: 0.25, max: 0.6 }, alpha: { start: 0.95, end: 0.7 }, quantity: 2, frequency: 40, emitting: false,
    }).setScrollFactor(0).setDepth(900003);
    this.leaves = scene.add.particles(0, 0, "fx_leaf", {
      x: { min: 0, max: W() + 200 }, y: -20, lifespan: 9000, speedY: { min: 30, max: 70 }, speedX: { min: -70, max: -20 },
      rotate: { start: 0, end: 540 }, scale: { min: 0.8, max: 1.3 }, tint: [0xd98a2b, 0xc9632c, 0xe0a030, 0xa8402a], frequency: 350, emitting: false,
    }).setScrollFactor(0).setDepth(900003);
    this.fireflies = scene.add.particles(0, 0, "fx_dot", {
      x: { min: 0, max: W() }, y: { min: 0, max: H() }, lifespan: 4000, speed: { min: 5, max: 25 },
      scale: { start: 0.3, end: 0.05 }, alpha: { start: 1, end: 0 }, tint: 0xd8ff7a, blendMode: "ADD", frequency: 260, emitting: false,
    }).setScrollFactor(0).setDepth(900004);
    this.motes = scene.add.particles(0, 0, "fx_dot", {
      x: { min: 0, max: W() }, y: { min: 0, max: H() }, lifespan: 6000, speedX: { min: -8, max: 8 }, speedY: { min: -6, max: 4 },
      scale: { start: 0.15, end: 0.05 }, alpha: { start: 0.5, end: 0 }, tint: 0xfff4c8, frequency: 300, emitting: false,
    }).setScrollFactor(0).setDepth(900003);

    scene.scale.on("resize", (size: Phaser.Structs.Size) => this.resize(size.width, size.height));
  }

  private resize(w: number, h: number) {
    this.night.resize(w, h);
    this.tint.setSize(w, h);
    this.fog.setSize(w, h);
  }

  /** Update lighting & weather. `lights` are screen-space light positions (player etc.). */
  update(clock: WorldClock, weather: Weather, underground: boolean, lights: { x: number; y: number; r: number }[], time: number, dt: number) {
    const { width, height } = this.scene.scale;
    const overcast = weather === "rain" || weather === "storm" ? 0.18 : weather === "cloudy" || weather === "fog" || weather === "snow" ? 0.1 : 0;
    let darkness = (1 - clock.daylight) * 0.78 + overcast;
    if (underground) darkness = Math.max(darkness, 0.6);
    darkness = Math.min(0.88, darkness);

    // Dawn/dusk warm tint.
    const h = clock.hour;
    const golden = Math.max(0, 1 - Math.min(Math.abs(h - 6.5), Math.abs(h - 19.5)) / 1.5);
    this.tint.setFillStyle(0xff9040, golden * 0.16);

    this.night.clear();
    if (darkness > 0.02) {
      this.night.fill(0x0a1030, darkness);
      for (const l of lights) {
        this.lightImg.setPosition(l.x, l.y).setScale((l.r * 2) / 512);
        this.night.erase(this.lightImg);
      }
    }
    void width; void height;

    const p = this.particlesEnabled && !underground;
    this.rain.emitting = p && (weather === "rain" || weather === "storm");
    this.rain.frequency = weather === "storm" ? 8 : 16;
    this.snow.emitting = p && weather === "snow";
    this.leaves.emitting = p && clock.season === "leaffall";
    this.fireflies.emitting = p && clock.isNight && clock.season === "greenleaf" && weather === "clear";
    this.motes.emitting = p && !clock.isNight && weather === "clear";
    const fogTarget = weather === "fog" ? 0.9 : weather === "rain" || weather === "storm" ? 0.25 : 0;
    this.fog.setAlpha(this.fog.alpha + (fogTarget - this.fog.alpha) * Math.min(1, dt * 0.5));
    this.fog.tilePositionX += dt * 12;
    this.fog.tilePositionY += dt * 4;
    const world = this.scene.scene.get("game")?.cameras?.main ?? this.scene.cameras.main;
    const cam = this.scene.cameras.main;
    this.fog.tilePositionX = world.scrollX * 0.6 + time * 0.01;
    this.fog.tilePositionY = world.scrollY * 0.6;

    if (weather === "storm" && p && time > this.nextLightning) {
      this.nextLightning = time + 6000 + Math.random() * 12000;
      cam.flash(180, 230, 235, 255);
    }
  }
}

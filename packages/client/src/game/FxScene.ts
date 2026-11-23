import Phaser from "phaser";
import { Effects } from "./world/Effects.ts";

/**
 * Screen-space atmosphere (lighting, weather, ambient particles) drawn in its
 * own scene above the world, so the world camera's zoom never shrinks it.
 */
export class FxScene extends Phaser.Scene {
  effects: Effects | null = null;
  particlesEnabled = true;

  constructor() {
    super("fx");
  }

  create() {
    this.effects = new Effects(this);
    this.effects.particlesEnabled = this.particlesEnabled;
  }
}

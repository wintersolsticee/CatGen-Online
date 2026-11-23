import Phaser from "phaser";

/** Register a canvas as a Phaser texture once (keyed), returning the key. */
export function ensureCanvasTexture(scene: Phaser.Scene, key: string, make: () => HTMLCanvasElement): string {
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, make());
  return key;
}

export function removeTexture(scene: Phaser.Scene, key: string) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
}

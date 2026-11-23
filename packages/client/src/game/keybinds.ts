import Phaser from "phaser";

/** Central keybinding table. Change keys here (or later, from a settings screen). */
const K = Phaser.Input.Keyboard.KeyCodes;
export const KEYBINDS = {
  up: K.W, down: K.S, left: K.A, right: K.D,
  upAlt: K.UP, downAlt: K.DOWN, leftAlt: K.LEFT, rightAlt: K.RIGHT,
  run: K.SHIFT,
  stalk: K.C,
  interact: K.E,
  swipe: K.ONE,
  bite: K.TWO,
  pounce: K.THREE,
  block: K.Q,
  dodge: K.SPACE,
};
export type Keybinds = typeof KEYBINDS;

/** Human-readable labels for the HUD. */
export const KEY_LABELS: Record<string, string> = {
  swipe: "1", bite: "2", pounce: "3", block: "Q", dodge: "Space", interact: "E", run: "Shift", stalk: "C",
};

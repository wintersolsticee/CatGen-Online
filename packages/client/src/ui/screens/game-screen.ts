import Phaser from "phaser";
import { WorldMap, type TiledMap } from "@catgen/shared";
import { h, toast } from "../dom.ts";
import { api, auth, type CharacterSummary } from "../../api.ts";
import { Net } from "../../game/net.ts";
import { GameScene } from "../../game/GameScene.ts";
import { Hud } from "../hud/Hud.ts";
import { DEFAULT_SETTINGS, type HudContext, type Settings } from "../hud/context.ts";

let mapPromise: Promise<WorldMap> | null = null;
function loadMap(): Promise<WorldMap> {
  mapPromise ??= fetch("/maps/world.json").then((r) => {
    if (!r.ok) throw new Error("Could not load the world map.");
    return r.json();
  }).then((json: TiledMap) => new WorldMap(json));
  return mapPromise;
}

export function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem("catgen.settings") ?? "{}") };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Connects to the world, boots Phaser and the HUD. */
export function gameScreen(character: CharacterSummary, nav: { exit: () => void }): { el: HTMLElement; dispose: () => void } {
  const status = h("div", { class: "muted" }, "Entering the forest…");
  const loading = h("div", { class: "loading" }, h("div", { class: "inner" }, h("div", { class: "logo" }, "CatGen ", h("span", {}, "Online")), h("div", { class: "spinner" }), status));
  const gameEl = h("div", { id: "game" });
  const el = h("div", {}, gameEl, loading);
  const net = new Net();
  let game: Phaser.Game | null = null;
  let hud: Hud | null = null;
  let disposed = false;
  const settings = loadSettings();
  document.documentElement.style.fontSize = `${settings.uiScale * 100}%`;

  const exit = async () => {
    await net.leave();
    nav.exit();
  };

  (async () => {
    try {
      const [{ account }, map] = await Promise.all([api.me(), loadMap()]);
      status.textContent = "Finding your Clan…";
      await net.connect(auth.token!, character.id);
      if (disposed) { await net.leave(); return; }
      status.textContent = "Painting the territories…";
      const ctx: HudContext = {
        net, map, character, account, priv: null, clan: null, me: null, settings,
        refreshPanel: () => hud?.refreshPanel(),
        openPanel: (n) => hud?.openPanel(n),
        whisper: (n) => hud?.whisper(n),
      };
      const scene = new GameScene();
      hud = new Hud(ctx, {
        exit,
        applySettings: (s) => { document.documentElement.style.fontSize = `${s.uiScale * 100}%`; },
        localPos: () => scene.localPosition(),
      });
      net.on("chat", (e) => hud?.onChat(e));
      net.on("notice", (e) => hud?.notice(e.kind, e.text));
      net.on("privateState", (p) => { hud?.onPrivate(p); scene.setPrivateState(p); });
      net.on("clanInfo", (c) => { hud?.onClan(c); scene.setClanInfo(c); });
      net.on("kicked", (e) => toast(e.reason, "error", 8000));
      let overlay: HTMLElement | null = null;
      net.on("disconnected", (reconnecting) => {
        overlay?.remove();
        overlay = h("div", { class: "disconnected" }, h("div", { class: "panel", style: "padding:28px;text-align:center" },
          h("h2", {}, reconnecting ? "Connection lost" : "Disconnected"),
          h("p", { class: "muted" }, reconnecting ? "Trying to reconnect…" : "You have left the forest."),
          reconnecting ? h("div", { class: "spinner", style: "margin:12px auto" }) : h("button", { class: "btn btn-primary", onclick: () => nav.exit() }, "Back to cat selection")));
        document.body.append(overlay);
      });
      net.on("reconnected", () => { overlay?.remove(); overlay = null; toast("Reconnected!", "success"); });

      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: gameEl,
        backgroundColor: "#1d2a1a",
        scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
        render: { antialias: true, pixelArt: false, roundPixels: false, powerPreference: "high-performance" },
        fps: { target: 60, smoothStep: false },
        disableContextMenu: true,
        banner: false,
      });
      game.scene.add("game", scene, true, { net, map, bridge: hud, graphics: settings.graphics });
      if (import.meta.env.DEV) (window as unknown as { __catgen?: unknown }).__catgen = { game, scene, net };
      el.append(hud.el);
      setTimeout(() => loading.remove(), 300);
    } catch (e) {
      status.textContent = (e as Error).message || "Could not connect.";
      loading.querySelector(".spinner")?.remove();
      loading.querySelector(".inner")!.append(h("button", { class: "btn btn-primary", style: "margin-top:16px", onclick: () => nav.exit() }, "Back"));
    }
  })();

  return {
    el,
    dispose: () => {
      disposed = true;
      hud?.dispose();
      game?.destroy(true);
      void net.leave();
      document.querySelectorAll(".disconnected, .modal-overlay").forEach((e) => e.remove());
    },
  };
}

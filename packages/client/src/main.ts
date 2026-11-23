import "./styles/main.css";
import { auth, type CharacterSummary } from "./api.ts";
import { landingScreen } from "./ui/screens/landing.ts";
import { authScreen } from "./ui/screens/auth.ts";
import { selectScreen } from "./ui/screens/select.ts";
import { creatorScreen } from "./ui/screens/creator.ts";
import { gameScreen } from "./ui/screens/game-screen.ts";
import { preloadCatSprites } from "./render/cat-sprites.ts";

/** Minimal screen router: each screen returns its element and a dispose function. */
const app = document.getElementById("app")!;
let current: { el: HTMLElement; dispose: () => void } | null = null;

function show(screen: { el: HTMLElement; dispose: () => void }) {
  current?.dispose();
  current?.el.remove();
  current = screen;
  app.append(screen.el);
}

const nav = {
  landing: () => show(landingScreen({ toAuth: nav.auth, toSelect: nav.select })),
  auth: (mode: "login" | "register") => show(authScreen(mode, { done: nav.select, back: nav.landing })),
  select: () => (auth.token ? show(selectScreen({ play: nav.play, create: () => nav.creator(null), edit: (c) => nav.creator(c), logout: nav.landing })) : nav.auth("login")),
  creator: (c: CharacterSummary | null) => show(creatorScreen(c, { done: nav.select, back: nav.select })),
  play: (c: CharacterSummary) => show(gameScreen(c, { exit: nav.select })),
};

// Cat artwork is tiny (~300 KB); load it before the first screen so every preview can draw instantly.
preloadCatSprites()
  .catch((e) => console.error(e))
  .finally(() => nav.landing());

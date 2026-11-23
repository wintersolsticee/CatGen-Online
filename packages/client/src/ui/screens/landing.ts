import { CLANS } from "@catgen/shared";
import { h } from "../dom.ts";
import { runHeroScene } from "../scene-art.ts";
import { auth } from "../../api.ts";
import { icon, type IconName } from "../icons.ts";

export function landingScreen(nav: { toAuth: (mode: "login" | "register") => void; toSelect: () => void }): { el: HTMLElement; dispose: () => void } {
  const heroCanvas = h("canvas");
  const loggedIn = !!auth.token;
  const el = h("div", { class: "screen scenic" },
    h("div", { class: "content" },
      h("div", { class: "topbar" },
        h("div", { class: "logo" }, icon("paw"), "CatGen ", h("span", {}, "Online")),
        h("div", { class: "row" },
          loggedIn
            ? h("button", { class: "btn btn-primary", onclick: nav.toSelect }, "Continue")
            : [h("button", { class: "btn btn-ghost", onclick: () => nav.toAuth("login") }, "Log in"), h("button", { class: "btn btn-primary", onclick: () => nav.toAuth("register") }, "Join the Clans")],
        ),
      ),
      h("section", { class: "hero" },
        h("div", { class: "hero-copy panel" },
          h("h1", {}, "Live the life of a warrior cat."),
          h("p", { class: "lead" }, "Create your own cat, join one of the five Clans and explore a living forest with other players. Hunt prey, gather healing herbs, defend your borders, rise through the ranks, and meet in peace at Fourtrees beneath the full moon."),
          h("div", { class: "cta" },
            h("button", { class: "btn btn-primary", onclick: () => (loggedIn ? nav.toSelect() : nav.toAuth("register")) }, loggedIn ? "Play now" : "Create your cat"),
            !loggedIn && h("button", { class: "btn btn-ghost", onclick: () => nav.toAuth("login") }, "I already have an account"),
          ),
          h("div", { class: "clans-strip" }, CLANS.map((c) => h("span", { class: "chip" }, h("span", { class: "clan-dot", style: `background:${c.color}` }), c.name))),
        ),
        h("div", { class: "hero-art" }, heroCanvas),
      ),
      h("section", { class: "features" },
        feature("emote", "Choose your cat", "Pick one of six hand-drawn cats, then make it yours with coat shades, size, a name and a story."),
        feature("tree", "A living forest", "Day and night, four seasons, rain, snow, fog and storms across forest, moorland, pine, marsh, river and cliffs."),
        feature("pounce", "Real hunting", "Prey notices you. Stalk low through the grass, pounce at the right moment, and carry your catch home to feed your Clan."),
        feature("herbs", "Herbs & healing", "Fourteen herbs, each with its own purpose. Medicine cats keep their Clan alive through wounds, infection, fever and greencough."),
        feature("swipe", "Skill-based combat", "Swipe, bite, pounce, block and dodge. Fights leave injuries that need real treatment. Border skirmishes have consequences."),
        feature("clan", "Clan life", "Ranks from kit to leader, ceremonies, announcements, alliances, rivalries, a shared fresh-kill pile and the Gathering truce."),
      ),
      h("footer", { class: "credits parchment" },
        h("b", {}, "Credits. "),
        "CatGen Online is a non-commercial fan game inspired by the Warriors book series by Erin Hunter. ThunderClan, RiverClan, WindClan, ShadowClan, SkyClan and related names belong to their respective owners. Art: cats by LuizMelo, forest by inkBubi and Vomdrache, interface by Kenney (all CC0), icons from game-icons.net by Lorc, Delapouite, Skoll, Sbed, Lucas and Zeromancer (CC BY 3.0).",
      ),
    ),
  );
  const stop = runHeroScene(heroCanvas);
  return { el, dispose: stop };
}

function feature(ico: IconName, title: string, text: string) {
  return h("div", { class: "feature parchment" }, h("h3", {}, icon(ico), title), h("p", {}, text));
}

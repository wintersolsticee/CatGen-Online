import { CLANS } from "@catgen/shared";
import { h } from "../dom.ts";
import { runHeroScene } from "../scene-art.ts";
import { auth } from "../../api.ts";

export function landingScreen(nav: { toAuth: (mode: "login" | "register") => void; toSelect: () => void }): { el: HTMLElement; dispose: () => void } {
  const heroCanvas = h("canvas");
  const loggedIn = !!auth.token;
  const el = h("div", { class: "screen scenic" },
    h("div", { class: "content" },
      h("div", { class: "topbar" },
        h("div", { class: "logo" }, "CatGen ", h("span", {}, "Online")),
        h("div", { class: "row" },
          loggedIn
            ? h("button", { class: "btn btn-primary", onclick: nav.toSelect }, "Continue")
            : [h("button", { class: "btn btn-ghost", onclick: () => nav.toAuth("login") }, "Log in"), h("button", { class: "btn btn-primary", onclick: () => nav.toAuth("register") }, "Join the Clans")],
        ),
      ),
      h("section", { class: "hero" },
        h("div", {},
          h("h1", {}, "Live the life of a warrior cat."),
          h("p", { class: "lead" }, "Create your own cat, join one of the five Clans and explore a living forest with other players. Hunt prey, gather healing herbs, defend your borders, rise through the ranks, and meet in peace at Fourtrees beneath the full moon."),
          h("div", { class: "cta" },
            h("button", { class: "btn btn-primary", onclick: () => (loggedIn ? nav.toSelect() : nav.toAuth("register")) }, loggedIn ? "Play now" : "Create your cat"),
            !loggedIn && h("button", { class: "btn btn-ghost", onclick: () => nav.toAuth("login") }, "I already have an account"),
          ),
          h("div", { class: "clans-strip" }, CLANS.map((c) => h("span", { class: "chip", style: `background:${c.color}33;color:${c.color}` }, h("span", { class: "clan-dot", style: `background:${c.color}` }), c.name))),
        ),
        h("div", { class: "hero-art" }, heroCanvas),
      ),
      h("section", { class: "features" },
        feature("Design your cat", "Fur colours, eleven patterns, white markings, eyes, ears, tails, fur length, body shape, scars and accessories."),
        feature("A living forest", "Day and night, four seasons, rain, snow, fog and storms across forest, moorland, pine, marsh, river and cliffs."),
        feature("Real hunting", "Prey notices you. Stalk low through the grass, pounce at the right moment, and carry your catch home to feed your Clan."),
        feature("Herbs & healing", "Fourteen herbs, each with its own purpose. Medicine cats keep their Clan alive through wounds, infection, fever and greencough."),
        feature("Skill-based combat", "Swipe, bite, pounce, block and dodge. Fights leave injuries that need real treatment. Border skirmishes have consequences."),
        feature("Clan life", "Ranks from kit to leader, ceremonies, announcements, alliances, rivalries, a shared fresh-kill pile and the Gathering truce."),
      ),
      h("footer", { class: "credits" },
        h("b", {}, "Credits. "),
        "CatGen Online is a non-commercial fan game inspired by the Warriors book series by Erin Hunter. ThunderClan, RiverClan, WindClan, ShadowClan, SkyClan and related names belong to their respective owners. Cat sprites: \"Pet Cats Pack\" by LuizMelo (CC0).",
      ),
    ),
  );
  const stop = runHeroScene(heroCanvas);
  return { el, dispose: stop };
}

function feature(title: string, text: string) {
  return h("div", { class: "feature panel" }, h("h3", {}, title), h("p", {}, text));
}

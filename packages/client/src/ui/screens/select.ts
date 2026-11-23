import { getClan, RANKS, normalizeAppearance } from "@catgen/shared";
import { h, modal, toast } from "../dom.ts";
import { api, auth, type CharacterSummary } from "../../api.ts";
import { drawCatCard } from "../scene-art.ts";
import { icon } from "../icons.ts";

export function selectScreen(nav: { play: (c: CharacterSummary) => void; create: () => void; edit: (c: CharacterSummary) => void; logout: () => void }): { el: HTMLElement; dispose: () => void } {
  const grid = h("div", { class: "char-grid" });
  const status = h("p", { class: "muted" }, "Loading your cats…");
  const el = h("div", { class: "screen scenic" },
    h("div", { class: "content" },
      h("div", { class: "topbar" },
        h("div", { class: "logo" }, icon("paw"), "CatGen ", h("span", {}, "Online")),
        h("button", { class: "btn btn-ghost", onclick: () => { auth.token = null; nav.logout(); } }, icon("exit"), "Log out"),
      ),
      h("div", { class: "select-wrap" }, h("div", { class: "title-banner" }, "Choose your cat"), status, grid),
    ),
  );
  const load = async () => {
    try {
      const { characters, max } = await api.characters();
      status.textContent = characters.length ? `${characters.length} of ${max} cats.` : "You don't have any cats yet. Create one to begin!";
      grid.replaceChildren();
      for (const c of characters) {
        const canvas = h("canvas");
        const clan = getClan(c.clan);
        grid.append(h("div", { class: "char-card panel" },
          canvas,
          h("div", { class: "name" }, c.name),
          h("div", { class: "row" },
            h("span", { class: "clan-badge", style: `color:${clan?.color ?? "#c8bd9f"}` }, h("span", { class: "clan-dot", style: `background:${clan?.color ?? "#8e866f"}` }), clan?.name ?? "Loner"),
            h("span", { class: "chip" }, RANKS[c.rank]?.name ?? c.rank),
          ),
          h("div", { class: "row" },
            h("button", { class: "btn btn-primary grow", onclick: () => nav.play(c) }, icon("paw"), "Play"),
            h("button", { class: "btn btn-ghost btn-sm", onclick: () => nav.edit(c) }, "Edit"),
            h("button", { class: "btn btn-ghost btn-sm", "data-tip": "Retire this cat", "aria-label": "Retire this cat", onclick: () => confirmDelete(c) }, "✕"),
          ),
        ));
        requestAnimationFrame(() => drawCatCard(canvas, normalizeAppearance(c.appearance), "sit"));
      }
      if (characters.length < max) grid.append(h("div", { class: "char-card panel new", onclick: nav.create }, icon("paw"), "Create a new cat"));
    } catch (e) {
      status.textContent = (e as Error).message;
      if (!auth.token) nav.logout();
    }
  };
  const confirmDelete = (c: CharacterSummary) => {
    modal(`Retire ${c.name}?`, h("p", { class: "muted" }, `${c.name} will leave the forest for good. This cannot be undone from the game.`), [
      { label: "Cancel", onClick: () => undefined },
      { label: "Retire", kind: "danger", onClick: async () => {
        try { await api.deleteCharacter(c.id); toast(`${c.name} has been retired.`); load(); } catch (e) { toast((e as Error).message, "error"); }
      } },
    ]);
  };
  load();
  return { el, dispose: () => undefined };
}

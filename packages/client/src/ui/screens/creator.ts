import {
  CLANS, RANKS, STARTING_RANKS, CAT_SPRITES, COAT_OPTIONS, normalizeAppearance, randomAppearance,
  validateCharacterName, type Appearance, type ClanId, type Rank,
} from "@catgen/shared";
import { h, toast } from "../dom.ts";
import { api, type CharacterSummary } from "../../api.ts";
import { drawCatAnimated, type CatAnim } from "../../render/cat-sprites.ts";
import { drawCatCard } from "../scene-art.ts";

const label = (s: string) => s.replace(/_/g, " ");

/** Character creator / editor. In edit mode only appearance and description can change. */
export function creatorScreen(existing: CharacterSummary | null, nav: { done: () => void; back: () => void }): { el: HTMLElement; dispose: () => void } {
  let a: Appearance = existing ? normalizeAppearance(existing.appearance) : randomAppearance();
  let name = existing?.name ?? "";
  let description = existing?.description ?? "";
  let clan: ClanId | null = existing ? existing.clan : "thunderclan";
  let rank: Rank = existing?.rank ?? "apprentice";
  let tab = existing ? "cat" : "identity";
  let previewAnim: CatAnim = "idle";
  const thumbs: { canvas: HTMLCanvasElement; a: () => Appearance }[] = [];
  const set = (patch: Partial<Appearance>) => {
    a = normalizeAppearance({ ...a, ...patch });
    renderTab();
  };

  const preview = h("canvas");
  const body = h("div", { class: "tab-body scroll" });
  const tabbar = h("div", { class: "tabbar" });
  const err = h("div", { class: "error-text", style: "padding: 0 18px" });

  const pills = <T extends string>(current: T | readonly T[], options: readonly T[], onPick: (v: T) => void) => h("div", { class: "pills" },
    options.map((o) => h("button", { class: `pill${(Array.isArray(current) ? current.includes(o) : current === o) ? " active" : ""}`, onclick: () => onPick(o) }, label(o))));
  const group = (title: string, content: Node, extra?: string) => h("div", { class: "opt-group" }, h("div", { class: "opt-label" }, h("span", {}, title), extra ? h("span", {}, extra) : null), content);
  const slider = (value: number, min: number, max: number, step: number, onChange: (v: number) => void) => {
    const input = h("input", { type: "range", min, max, step, value }) as HTMLInputElement;
    input.addEventListener("input", () => onChange(Number(input.value)));
    return input;
  };

  const tabs: Record<string, () => Node[]> = {
    identity: () => [
      group("Name", (() => {
        const input = h("input", { class: "input", value: name, maxlength: 24, placeholder: "e.g. Firepaw, Mistyfoot, Rowanclaw", disabled: !!existing }) as HTMLInputElement;
        input.addEventListener("input", () => { name = input.value; });
        return input;
      })()),
      existing ? null : group("Clan", h("div", { class: "clan-choices" },
        [...CLANS.map((c) => h("button", { class: `clan-choice${clan === c.id ? " active" : ""}`, style: clan === c.id ? `border-color:${c.color}` : "", onclick: () => { clan = c.id; renderTab(); } },
          h("b", { style: `color:${c.color}` }, c.name), h("small", {}, c.description))),
        h("button", { class: `clan-choice${clan === null ? " active" : ""}`, onclick: () => { clan = null; renderTab(); } }, h("b", {}, "Loner"), h("small", {}, "Live free outside the Clans. You can ask to join a Clan later."))],
      )),
      existing || clan === null ? null : group("Starting rank", pills(rank, STARTING_RANKS, (r) => { rank = r; renderTab(); }), RANKS[rank].description),
      group("Description", (() => {
        const ta = h("textarea", { class: "input", rows: 4, maxlength: 500, placeholder: "Personality, history, quirks…" }, description) as HTMLTextAreaElement;
        ta.addEventListener("input", () => { description = ta.value; });
        return ta;
      })()),
    ].filter(Boolean) as Node[],
    cat: () => {
      thumbs.length = 0;
      const cards = CAT_SPRITES.map((c) => {
        const canvas = h("canvas", { style: "width:100%;height:84px;display:block" }) as HTMLCanvasElement;
        thumbs.push({ canvas, a: () => normalizeAppearance({ ...a, sprite: c.id }) });
        return h("button", { class: `clan-choice${a.sprite === c.id ? " active" : ""}`, style: "text-align:center;padding:6px", onclick: () => set({ sprite: c.id }) }, canvas, h("b", { style: "margin:4px 0 0" }, c.name));
      });
      return [
        group("Choose your cat", h("div", { style: "display:grid;grid-template-columns:repeat(3,1fr);gap:8px" }, cards)),
        group("Coat shade", pills(a.coat, COAT_OPTIONS, (v) => set({ coat: v }))),
        group("Size", slider(a.size, 0.85, 1.15, 0.01, (v) => set({ size: v })), `${Math.round(a.size * 100)}%`),
      ];
    },
  };
  const tabNames: Record<string, string> = { identity: "Identity", cat: "Your cat" };

  function renderTab() {
    tabbar.replaceChildren(...Object.keys(tabs).map((t) => h("button", { class: tab === t ? "active" : "", onclick: () => { tab = t; renderTab(); } }, tabNames[t])));
    const scroll = body.scrollTop;
    body.replaceChildren(...tabs[tab]());
    body.scrollTop = scroll;
  }
  renderTab();

  const save = async () => {
    err.textContent = "";
    try {
      if (existing) {
        await api.updateCharacter(existing.id, { appearance: a, description });
        toast(`${existing.name} looks wonderful.`, "success");
      } else {
        const nameErr = validateCharacterName(name);
        if (nameErr) { tab = "identity"; renderTab(); err.textContent = nameErr; return; }
        await api.createCharacter({ name: name.trim(), clan, rank: clan ? rank : "warrior", appearance: a, description });
        toast(`${name.trim()} has joined ${clan ? CLANS.find((c) => c.id === clan)!.name : "the wild as a loner"}!`, "success");
      }
      nav.done();
    } catch (e) {
      err.textContent = (e as Error).message;
    }
  };

  const poseBtn = (p: CatAnim, text: string) => h("button", { class: "btn btn-ghost btn-sm", onclick: () => { previewAnim = p; animStart = performance.now(); } }, text);
  let animStart = performance.now();
  const el = h("div", { class: "screen scenic" },
    h("div", { class: "content" },
      h("div", { class: "topbar" },
        h("div", { class: "title-banner", style: "margin:0" }, existing ? `Editing ${existing.name}` : "Create your cat"),
        h("button", { class: "btn btn-ghost", onclick: nav.back }, "Back"),
      ),
      h("div", { class: "creator" },
        h("div", { class: "preview panel" }, preview,
          h("div", { class: "preview-controls" }, poseBtn("idle", "Stand"), poseBtn("walk", "Walk"), poseBtn("run", "Run"), poseBtn("sit", "Sit"), poseBtn("lie", "Lie"), poseBtn("sleep", "Sleep"), poseBtn("groom", "Groom"),
            h("button", { class: "btn btn-ghost btn-sm", onclick: () => { a = randomAppearance(); renderTab(); } }, "🎲 Random"))),
        h("div", { class: "options panel" }, tabbar, body, err,
          h("div", { class: "footer" }, h("button", { class: "btn btn-ghost", onclick: nav.back }, "Cancel"), h("div", { class: "grow" }), h("button", { class: "btn btn-primary", onclick: save }, existing ? "Save changes" : "Enter the forest"))),
      ),
    ),
  );

  // Animated preview.
  let raf = 0;
  const t0 = performance.now();
  const frame = (now: number) => {
    const t = (now - t0) / 1000;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = preview.clientWidth * dpr, H = preview.clientHeight * dpr;
    if (W > 0 && H > 0) {
      if (preview.width !== W || preview.height !== H) { preview.width = W; preview.height = H; }
      const ctx = preview.getContext("2d")!;
      ctx.clearRect(0, 0, W, H);
      const g = ctx.createRadialGradient(W / 2, H * 0.78, 0, W / 2, H * 0.78, W * 0.5);
      g.addColorStop(0, "rgba(120,160,90,0.55)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      const scale = Math.max(2, Math.floor(Math.min(W / 46, H / 34) * a.size));
      drawCatAnimated(ctx, a, previewAnim, (now - animStart) / 1000, W / 2, H * 0.8, scale);
    }
    for (const th of thumbs) if (th.canvas.isConnected) drawCatCard(th.canvas, th.a(), "idle", t);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return { el, dispose: () => cancelAnimationFrame(raf) };
}

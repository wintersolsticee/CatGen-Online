import {
  C2S, CLANS, RANKS, RECIPES, EMOTES, CONDITIONS, SKILL_IDS, getClan, getItem, getHerb, getPrey, herbDisplayName, knowsHerb, canCraft,
  countItem, skillLevel, levelProgress, hasPermission, isRank, isConditionId, type Rank, type ClanRelation, type AccessorySlot,
} from "@catgen/shared";
import { h, modal, toast } from "../dom.ts";
import { api } from "../../api.ts";
import type { HudContext, PanelName } from "./context.ts";
import { itemIcon } from "./item-icon.ts";

const myRank = (ctx: HudContext): Rank => (isRank(ctx.me?.rank) ? (ctx.me!.rank as Rank) : "warrior");

function itemName(ctx: HudContext, itemId: string) {
  return getHerb(itemId) ? herbDisplayName(myRank(ctx), ctx.priv?.knownHerbs ?? [], itemId) : getItem(itemId)?.name ?? itemId;
}

export function panel(title: string, ctx: HudContext, ...content: (Node | null)[]): HTMLElement {
  return h("div", { class: "side-panel panel" },
    h("header", {}, h("h2", { class: "display" }, title), h("button", { class: "close-x", onclick: () => ctx.openPanel(null) }, "✕")),
    h("div", { class: "body scroll" }, ...content),
  );
}

// ---------------------------------------------------------------- Inventory
let selectedItem: string | null = null;
export function inventoryPanel(ctx: HudContext): HTMLElement {
  const inv = ctx.priv?.inventory ?? [];
  const equipped = ctx.priv?.equipped ?? {};
  const slots: HTMLElement[] = [];
  for (let i = 0; i < 25; i++) {
    const s = inv[i];
    const isEq = s && Object.values(equipped).includes(s.itemId);
    slots.push(h("div", { class: `slot${isEq ? " equipped" : ""}${s && s.itemId === selectedItem ? " equipped" : ""}`, title: s ? itemName(ctx, s.itemId) : "", onclick: () => { selectedItem = s?.itemId ?? null; ctx.refreshPanel(); } },
      s ? itemIcon(s.itemId) : null, s && s.qty > 1 ? h("span", { class: "qty" }, s.qty) : null));
  }
  let detail: HTMLElement | null = null;
  if (selectedItem && countItem(inv, selectedItem) > 0) {
    const item = getItem(selectedItem)!;
    const id = selectedItem;
    const known = item.category !== "herb" || knowsHerb(myRank(ctx), ctx.priv?.knownHerbs ?? [], id);
    const herb = getHerb(id);
    const actions: HTMLElement[] = [];
    if (item.category === "prey") actions.push(h("button", { class: "btn btn-sm btn-primary", onclick: () => ctx.net.send(C2S.useItem, { itemId: id }) }, `Eat (+${getPrey(id)?.foodValue} hunger)`));
    if (item.category === "herb") {
      actions.push(h("button", { class: "btn btn-sm btn-primary", onclick: () => ctx.net.send(C2S.useItem, { itemId: id }) }, "Use on myself"));
      actions.push(h("button", { class: "btn btn-sm btn-ghost", onclick: () => ctx.net.send(C2S.depositHerb, { itemId: id, qty: countItem(inv, id) }) }, "Store in den"));
    }
    if (item.category === "accessory" && item.slot) {
      const on = equipped[item.slot] === id;
      actions.push(h("button", { class: "btn btn-sm btn-primary", onclick: () => ctx.net.send(C2S.equip, { slot: item.slot, itemId: on ? null : id }) }, on ? "Take off" : "Wear"));
    }
    actions.push(h("button", { class: "btn btn-sm btn-ghost", onclick: () => ctx.net.send(C2S.dropItem, { itemId: id }) }, "Drop one"));
    detail = h("div", { class: "item-detail" },
      h("div", { class: "row" }, itemIcon(id, 40), h("div", {}, h("b", {}, itemName(ctx, id)), h("div", { class: "faint", style: "font-size:12px;text-transform:capitalize" }, item.category))),
      h("p", { class: "muted", style: "font-size:13.5px" }, known ? item.description : "You don't know what this plant does yet. A medicine cat would."),
      known && herb && herb.treats.length ? h("p", { style: "font-size:13px" }, "Treats: ", herb.treats.map((c) => CONDITIONS[c].name).join(", ")) : null,
      h("div", { class: "row", style: "flex-wrap:wrap" }, actions),
    );
  }
  const crafts = RECIPES.map((r) => {
    const ok = canCraft(inv, r);
    return h("div", { class: "list-item" }, itemIcon(r.result, 32),
      h("div", { class: "grow" }, h("b", {}, getItem(r.result)!.name), h("div", { class: "faint", style: "font-size:12px" }, Object.entries(r.ingredients).map(([i, n]) => `${n}× ${itemName(ctx, i)}`).join(", "))),
      h("button", { class: "btn btn-sm " + (ok ? "btn-primary" : "btn-ghost"), disabled: !ok, onclick: () => ctx.net.send(C2S.craft, { itemId: r.result }) }, "Make"));
  });
  const skills = SKILL_IDS.map((s) => {
    const xp = ctx.priv?.skills[s] ?? 0;
    return h("div", { class: "skill" }, h("div", { class: "row" }, h("b", { style: "text-transform:capitalize;font-size:13px" }, s), h("span", { class: "faint grow", style: "text-align:right;font-size:12px" }, `Level ${skillLevel(xp)}`)),
      h("div", { class: "bar" }, h("i", { style: `width:${levelProgress(xp) * 100}%` })));
  });
  const eqSlots: AccessorySlot[] = ["head", "neck", "back", "tail"];
  return panel("Inventory", ctx,
    h("div", { class: "inv-grid" }, slots),
    detail,
    h("h3", { style: "margin-top:16px;font-size:15px" }, "Wearing"),
    h("div", { class: "row", style: "flex-wrap:wrap" }, eqSlots.map((s) => h("span", { class: "chip" }, `${s}: ${equipped[s] ? getItem(equipped[s]!)?.name : "—"}`))),
    h("h3", { style: "margin-top:16px;font-size:15px" }, "Crafting"),
    h("div", { class: "list" }, crafts),
    h("h3", { style: "margin-top:16px;font-size:15px" }, "Skills"),
    ...skills,
  );
}

// ---------------------------------------------------------------- Clan
export function clanPanel(ctx: HudContext): HTMLElement {
  const me = ctx.me;
  const rank = myRank(ctx);
  if (!me?.clan || !ctx.clan) {
    return panel("Loner", ctx,
      h("p", { class: "muted" }, "You live outside the Clans. Travel to a Clan's camp to ask to join."),
      h("div", { class: "list" }, CLANS.map((c) => h("div", { class: "list-item" }, h("span", { class: "clan-dot", style: `background:${c.color}` }), h("b", { class: "grow" }, c.name),
        h("button", { class: "btn btn-sm btn-ghost", onclick: () => ctx.net.send(C2S.joinClan, { clan: c.id }) }, "Ask to join")))),
    );
  }
  const info = ctx.clan;
  const clanDef = getClan(info.clan)!;
  const canPromote = hasPermission(rank, "promote");
  const canRelate = hasPermission(rank, "set_relations");
  const canAnnounce = hasPermission(rank, "announce");
  const hasLeader = info.members.some((m) => m.rank === "leader");
  const members = [...info.members].sort((a, b) => RANKS[b.rank].authority - RANKS[a.rank].authority || a.name.localeCompare(b.name));
  const totalPrey = Object.values(info.freshKill).reduce((s, n) => s + n, 0);
  const totalHerbs = Object.values(info.herbStore).reduce((s, n) => s + n, 0);
  const announce = h("input", { class: "input", placeholder: "Make an announcement to the Clan…", maxlength: 240 }) as HTMLInputElement;
  announce.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter" && announce.value.trim()) { ctx.net.send(C2S.announce, { text: announce.value.trim() }); announce.value = ""; } });
  return panel(clanDef.name, ctx,
    h("p", { class: "muted", style: "margin-top:0" }, clanDef.description),
    h("div", { class: "row", style: "flex-wrap:wrap" },
      h("span", { class: "chip" }, `🍖 Fresh-kill: ${totalPrey}`), h("span", { class: "chip" }, `🌿 Herb store: ${totalHerbs}`), h("span", { class: "chip" }, `🐾 ${members.length} cats`)),
    !hasLeader && (rank === "deputy" || rank === "warrior") ? h("div", { class: "item-detail" }, h("p", { style: "margin-top:0" }, "Your Clan has no leader!"), h("button", { class: "btn btn-sm btn-primary", onclick: () => ctx.net.send(C2S.claimLeadership) }, "Seek StarClan's blessing (claim leadership)")) : null,
    h("h3", { style: "margin-top:14px;font-size:15px" }, "Announcements"),
    canAnnounce ? announce : null,
    h("div", { class: "list", style: "margin-top:6px" }, info.announcements.length ? info.announcements.slice(0, 5).map((a) => h("div", { class: "list-item", style: "display:block" }, h("b", {}, a.author), h("div", { class: "muted", style: "font-size:13px" }, a.text))) : [h("div", { class: "faint" }, "No announcements yet.")]),
    h("h3", { style: "margin-top:14px;font-size:15px" }, "Other Clans"),
    h("div", { class: "list" }, CLANS.filter((c) => c.id !== info.clan).map((c) => {
      const rel = (info.relations[c.id] ?? "neutral") as ClanRelation;
      return h("div", { class: "list-item" }, h("span", { class: "clan-dot", style: `background:${c.color}` }), h("b", { class: "grow" }, c.name),
        canRelate
          ? (() => { const sel = h("select", { class: "input", style: "width:auto;padding:4px 8px" }, ...(["neutral", "allied", "rival"] as const).map((r) => h("option", { value: r, selected: r === rel }, r))) as HTMLSelectElement; sel.addEventListener("change", () => ctx.net.send(C2S.setRelation, { clan: c.id, relation: sel.value })); return sel; })()
          : h("span", { class: rel === "rival" ? "chip chip-danger" : "chip" }, rel));
    })),
    h("h3", { style: "margin-top:14px;font-size:15px" }, "Members"),
    h("div", { class: "list" }, members.map((m) => h("div", { class: "list-item" },
      h("span", { class: `online-dot${m.online ? " on" : ""}` }),
      h("div", { class: "grow" }, h("b", {}, m.name), h("div", { class: "faint", style: "font-size:12px" }, RANKS[m.rank].name)),
      canPromote && m.id !== ctx.character.id && RANKS[m.rank].authority < RANKS[rank].authority ? h("button", { class: "btn btn-sm btn-ghost", onclick: () => rankDialog(ctx, m.id, m.name, m.rank) }, "Ceremony") : null,
      rank === "leader" && m.id !== ctx.character.id && (m.rank === "deputy" || m.rank === "warrior") ? h("button", { class: "btn btn-sm btn-ghost", title: "Pass on leadership", onclick: () => modal(`Make ${m.name} leader?`, h("p", { class: "muted" }, "You will retire to the elders' den."), [{ label: "Cancel", onClick: () => undefined }, { label: "Pass on leadership", kind: "danger", onClick: () => ctx.net.send(C2S.transferLeadership, { targetId: m.id }) }]) }, "👑") : null,
    ))),
    rank !== "leader" ? h("button", { class: "btn btn-sm btn-ghost", style: "margin-top:16px", onclick: () => modal("Leave your Clan?", h("p", { class: "muted" }, "You will become a loner."), [{ label: "Stay", onClick: () => undefined }, { label: "Leave", kind: "danger", onClick: () => ctx.net.send(C2S.leaveClan) }]) }, "Leave Clan") : null,
  );
}

function rankDialog(ctx: HudContext, targetId: string, name: string, current: Rank) {
  const options = (Object.keys(RANKS) as Rank[]).filter((r) => r !== current && r !== "leader");
  let pick: Rank = options[0];
  const sel = h("select", { class: "input" }, ...options.map((r) => h("option", { value: r }, RANKS[r].name))) as HTMLSelectElement;
  sel.addEventListener("change", () => { pick = sel.value as Rank; });
  modal(`Ceremony for ${name}`, h("div", {}, h("p", { class: "muted" }, `${name} is currently a ${RANKS[current].name}.`), h("label", { class: "field" }, "New rank", sel)), [
    { label: "Cancel", onClick: () => undefined },
    { label: "Hold ceremony", kind: "primary", onClick: () => ctx.net.send(C2S.setRank, { targetId, rank: pick }) },
  ]);
}

// ---------------------------------------------------------------- Herb store
export function herbStorePanel(ctx: HudContext): HTMLElement {
  const info = ctx.clan;
  const rank = myRank(ctx);
  const canTake = hasPermission(rank, "access_herb_store");
  const inv = ctx.priv?.inventory ?? [];
  const myHerbs = inv.filter((s) => getHerb(s.itemId));
  return panel("Medicine Den", ctx,
    h("p", { class: "muted", style: "margin-top:0" }, canTake ? "The Clan's herb store. Take what you need to treat your Clanmates." : "Anyone may bring herbs to the den. Only medicine cats and the leader may take them."),
    h("h3", { style: "font-size:15px" }, "Herb store"),
    h("div", { class: "list" }, info && Object.keys(info.herbStore).length
      ? Object.entries(info.herbStore).map(([id, n]) => h("div", { class: "list-item" }, itemIcon(id, 32), h("div", { class: "grow" }, h("b", {}, itemName(ctx, id)), h("div", { class: "faint", style: "font-size:12px" }, getHerb(id) && knowsHerb(rank, ctx.priv?.knownHerbs ?? [], id) ? getHerb(id)!.description : "")), h("span", { class: "chip" }, `×${n}`),
        canTake ? h("button", { class: "btn btn-sm btn-ghost", onclick: () => ctx.net.send(C2S.withdrawHerb, { itemId: id, qty: 1 }) }, "Take") : null))
      : [h("div", { class: "faint" }, "The store is empty.")]),
    h("h3", { style: "margin-top:14px;font-size:15px" }, "Your herbs"),
    h("div", { class: "list" }, myHerbs.length ? myHerbs.map((s) => h("div", { class: "list-item" }, itemIcon(s.itemId, 32), h("b", { class: "grow" }, itemName(ctx, s.itemId)), h("span", { class: "chip" }, `×${s.qty}`),
      h("button", { class: "btn btn-sm btn-primary", onclick: () => ctx.net.send(C2S.depositHerb, { itemId: s.itemId, qty: s.qty }) }, "Store"))) : [h("div", { class: "faint" }, "You aren't carrying any herbs.")]),
  );
}

// ---------------------------------------------------------------- Social
export function socialPanel(ctx: HudContext): HTMLElement {
  const listEl = h("div", { class: "list" }, h("div", { class: "faint" }, "Loading…"));
  const blockedEl = h("div", { class: "list" });
  const input = h("input", { class: "input", placeholder: "Cat name", maxlength: 24 }) as HTMLInputElement;
  input.addEventListener("keydown", (e) => e.stopPropagation());
  const charId = ctx.character.id;
  const load = async () => {
    try {
      const s = await api.social(charId);
      const online = new Set<string>();
      ctx.net.state.players.forEach((p) => online.add(p.id));
      listEl.replaceChildren(...(s.friends.length ? s.friends.map((f) => h("div", { class: "list-item" },
        h("span", { class: `online-dot${online.has(f.id) ? " on" : ""}` }),
        h("div", { class: "grow" }, h("b", {}, f.name), h("div", { class: "faint", style: "font-size:12px" }, f.status === "accepted" ? getClan(f.clan)?.name ?? "Loner" : f.status === "incoming" ? "wants to be friends" : "request sent")),
        f.status === "incoming" ? h("button", { class: "btn btn-sm btn-primary", onclick: async () => { await api.addFriend(charId, f.name); load(); } }, "Accept") : null,
        f.status === "accepted" && online.has(f.id) ? h("button", { class: "btn btn-sm btn-ghost", onclick: () => ctx.whisper(f.name) }, "Whisper") : null,
        h("button", { class: "btn btn-sm btn-ghost", title: "Remove", onclick: async () => { await api.removeFriend(charId, f.id); load(); } }, "✕"),
      )) : [h("div", { class: "faint" }, "No friends yet. Add a cat by name, or click a cat in the world.")]));
      blockedEl.replaceChildren(...s.blocked.map((b) => h("div", { class: "list-item" }, h("b", { class: "grow" }, b.name), h("button", { class: "btn btn-sm btn-ghost", onclick: async () => { await api.unblock(charId, b.id); toast(`Unblocked ${b.name}. Rejoin to see their messages again.`); load(); } }, "Unblock"))));
    } catch (e) {
      listEl.replaceChildren(h("div", { class: "error-text" }, (e as Error).message));
    }
  };
  load();
  return panel("Friends", ctx,
    h("div", { class: "row" }, input, h("button", { class: "btn btn-sm btn-primary", onclick: async () => {
      if (!input.value.trim()) return;
      try { const r = await api.addFriend(charId, input.value.trim()); toast(r.status === "accepted" ? "You are now friends!" : "Friend request sent."); input.value = ""; load(); } catch (e) { toast((e as Error).message, "error"); }
    } }, "Add")),
    h("h3", { style: "margin-top:14px;font-size:15px" }, "Friends"), listEl,
    h("h3", { style: "margin-top:14px;font-size:15px" }, "Blocked"), blockedEl,
  );
}

// ---------------------------------------------------------------- Emotes, settings, help
export function emotesPanel(ctx: HudContext): HTMLElement {
  return panel("Emotes", ctx, h("div", { class: "pills" }, Object.entries(EMOTES).map(([id, e]) => h("button", { class: "pill", onclick: () => ctx.net.send(C2S.emote, { emote: id }) }, `${id} · ${e.text}`))),
    h("p", { class: "faint", style: "font-size:13px" }, "Tip: type /sit, /groom, /purr… in chat."));
}

export function settingsPanel(ctx: HudContext, apply: () => void, exit: () => void): HTMLElement {
  const s = ctx.settings;
  const save = () => { localStorage.setItem("catgen.settings", JSON.stringify(s)); api.saveSettings(s as unknown as Record<string, unknown>).catch(() => undefined); apply(); ctx.refreshPanel(); };
  const pills = <T extends string | boolean>(cur: T, opts: [T, string][], set: (v: T) => void) => h("div", { class: "pills" }, opts.map(([v, l]) => h("button", { class: `pill${cur === v ? " active" : ""}`, onclick: () => { set(v); save(); } }, l)));
  return panel("Settings", ctx,
    h("div", { class: "opt-group" }, h("div", { class: "opt-label" }, "Graphics"), pills(s.graphics, [["high", "High"], ["low", "Performance"]], (v) => { s.graphics = v; toast("Graphics changes apply next time you enter the world."); })),
    h("div", { class: "opt-group" }, h("div", { class: "opt-label" }, "Interface size"), pills(String(s.uiScale), [["0.85", "Small"], ["1", "Normal"], ["1.15", "Large"]], (v) => { s.uiScale = Number(v); })),
    h("button", { class: "btn btn-ghost", style: "margin-top:20px;width:100%", onclick: exit }, "Return to cat selection"),
  );
}

export function helpPanel(ctx: HudContext): HTMLElement {
  const row = (k: string, t: string) => h("div", { class: "list-item" }, h("span", { class: "kbd" }, k), h("span", {}, t));
  return panel("How to play", ctx,
    h("div", { class: "list" },
      row("WASD", "Move"), row("Shift", "Run (uses stamina)"), row("C", "Stalk: crouch low so prey notice you less"),
      row("E", "Interact: gather herbs, drop prey, eat"), row("1 / 2 / 3", "Swipe · Bite · Pounce (aim with the mouse)"),
      row("Q", "Block attacks from the front"), row("Space", "Dodge"), row("Enter", "Chat"), row("Click", "Select a cat"),
      row("Scroll", "Zoom"), row("I / K / O / M", "Inventory · Clan · Friends · Map"), row("Esc", "Close panels / settings")),
    h("h3", { style: "margin-top:16px;font-size:15px" }, "Getting started"),
    h("p", { class: "muted", style: "font-size:13.5px;line-height:1.5" }, "Hunt by stalking (C) toward prey and pouncing (3). Carry your catch to your Clan's fresh-kill pile and press E. Gather herbs you find; use the right herb on an injury to cure it. Visit the medicine den to store herbs. Wounds left untreated can turn infected. At every full moon, the Clans meet at Fourtrees under a truce."),
    h("h3", { style: "margin-top:16px;font-size:15px" }, "Credits"),
    h("p", { class: "faint", style: "font-size:12.5px;line-height:1.5" }, "Inspired by the Warriors series by Erin Hunter. Clan names belong to their respective owners. Cat sprites: \"Pet Cats Pack\" by LuizMelo (luizmelo.itch.io, CC0). A non-commercial fan project."),
  );
}

// ---------------------------------------------------------------- Selected cat card
export function catCard(ctx: HudContext, key: string, close: () => void): HTMLElement | null {
  const p = ctx.net.state.players.get(key);
  if (!p) return null;
  const clan = getClan(p.clan);
  const rank = isRank(p.rank) ? RANKS[p.rank as Rank].name : p.rank;
  const conds = p.conditions.split(",").filter(isConditionId);
  const my = myRank(ctx);
  const herbs = (ctx.priv?.inventory ?? []).filter((s) => getHerb(s.itemId));
  const sameClan = ctx.me?.clan && ctx.me.clan === p.clan;
  const canPromote = sameClan && hasPermission(my, "promote");
  const treat = herbs.length ? (() => {
    const sel = h("select", { class: "input", style: "padding:5px 8px" }, ...herbs.map((s) => h("option", { value: s.itemId }, `${itemName(ctx, s.itemId)} (${s.qty})`))) as HTMLSelectElement;
    return h("div", { class: "row", style: "margin-top:8px" }, sel, h("button", { class: "btn btn-sm btn-primary", onclick: () => ctx.net.send(C2S.useItem, { itemId: sel.value, targetId: p.id }) }, "Treat"));
  })() : null;
  return h("div", { class: "cat-card panel" },
    h("div", { class: "row" }, h("div", { class: "grow" }, h("div", { style: "font-weight:900;font-size:18px" }, p.name), h("div", { class: "clan-badge", style: `color:${clan?.color ?? "#c8bd9f"}` }, `${clan?.name ?? "Loner"} · ${rank}`)), h("button", { class: "close-x", onclick: close }, "✕")),
    h("div", { class: "bar hp", style: "margin-top:8px" }, h("i", { style: `width:${p.health}%` }), h("span", {}, `${Math.round(p.health)}`)),
    conds.length ? h("div", { class: "conditions" }, conds.map((c) => h("span", { class: "chip chip-danger", title: CONDITIONS[c].description }, CONDITIONS[c].name))) : h("div", { class: "faint", style: "font-size:12px;margin-top:4px" }, "Looks healthy."),
    treat,
    h("div", { class: "actions" },
      h("button", { class: "btn btn-sm btn-ghost", onclick: () => ctx.whisper(p.name) }, "Whisper"),
      h("button", { class: "btn btn-sm btn-ghost", onclick: async () => { try { const r = await api.addFriend(ctx.character.id, p.name); toast(r.status === "accepted" ? `You and ${p.name} are now friends!` : `Friend request sent to ${p.name}.`, "success"); } catch (e) { toast((e as Error).message, "error"); } } }, "Add friend"),
      h("button", { class: "btn btn-sm btn-ghost", onclick: async () => { try { const pr = await api.profile(p.name); modal(pr.profile.name, h("div", {}, h("p", { class: "muted" }, pr.profile.description || "No description."), h("div", { class: "row", style: "flex-wrap:wrap" }, Object.entries(pr.profile.skills).map(([k, v]) => h("span", { class: "chip" }, `${k} ${skillLevel(v)}`)), h("span", { class: "chip" }, `${pr.profile.discoveredCount} places discovered`))), [{ label: "Close", onClick: () => undefined }]); } catch (e) { toast((e as Error).message, "error"); } } }, "Profile"),
      canPromote ? h("button", { class: "btn btn-sm btn-ghost", onclick: () => rankDialog(ctx, p.id, p.name, (isRank(p.rank) ? p.rank : "warrior") as Rank) }, "Ceremony") : null,
      h("button", { class: "btn btn-sm btn-ghost", onclick: async () => { await api.block(ctx.character.id, p.name).catch(() => undefined); toast(`${p.name} is blocked. Rejoin to hide their messages.`); close(); } }, "Block"),
      h("button", { class: "btn btn-sm btn-ghost", onclick: () => reportDialog(ctx, p.name) }, "Report"),
      ctx.account.role !== "player" ? h("button", { class: "btn btn-sm btn-danger", onclick: () => modDialog(ctx, p.name) }, "Moderate") : null,
    ),
  );
}

function reportDialog(ctx: HudContext, name: string) {
  const ta = h("textarea", { class: "input", rows: 4, maxlength: 500, placeholder: "What happened?" }) as HTMLTextAreaElement;
  ta.addEventListener("keydown", (e) => e.stopPropagation());
  modal(`Report ${name}`, h("div", {}, h("p", { class: "muted" }, "Recent chat from this player is attached for the moderators."), ta), [
    { label: "Cancel", onClick: () => undefined },
    { label: "Send report", kind: "danger", onClick: () => { if (!ta.value.trim()) return false; ctx.net.send(C2S.report, { targetName: name, reason: ta.value.trim() }); } },
  ]);
}

function modDialog(ctx: HudContext, name: string) {
  const minutes = h("input", { class: "input", type: "number", value: 60, min: 1 }) as HTMLInputElement;
  const reason = h("input", { class: "input", placeholder: "Reason" }) as HTMLInputElement;
  [minutes, reason].forEach((i) => i.addEventListener("keydown", (e) => e.stopPropagation()));
  const act = (action: string) => () => ctx.net.send(C2S.moderate, { action, targetName: name, minutes: Number(minutes.value) || 60, reason: reason.value || undefined });
  modal(`Moderate ${name}`, h("div", {}, h("label", { class: "field" }, "Minutes (mute/ban)", minutes), h("label", { class: "field" }, "Reason", reason)), [
    { label: "Mute", onClick: act("mute") }, { label: "Kick", onClick: act("kick") }, { label: "Ban", kind: "danger", onClick: act("ban") },
  ]);
}

export type { PanelName };

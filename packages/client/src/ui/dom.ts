/** Tiny DOM helpers: no framework needed for CatGen's UI. */
type Attrs = Record<string, string | number | boolean | EventListener | undefined | null> & { class?: string; style?: string };
type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el: Element) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function $(sel: string, root: ParentNode = document): HTMLElement {
  const el = root.querySelector(sel);
  if (!el) throw new Error(`Missing element ${sel}`);
  return el as HTMLElement;
}

/** Show a transient toast message. */
export function toast(text: string, kind: "info" | "success" | "warning" | "error" = "info", ms = 4200) {
  let host = document.getElementById("toasts");
  if (!host) {
    host = h("div", { id: "toasts" });
    document.body.append(host);
  }
  const t = h("div", { class: `toast toast-${kind}` }, text);
  host.append(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 400);
  }, ms);
  while (host.children.length > 5) host.firstElementChild?.remove();
}

export function modal(title: string, body: Node, actions: { label: string; kind?: "primary" | "danger" | "ghost"; onClick: () => void | boolean | Promise<void | boolean> }[] = []): () => void {
  const close = () => overlay.remove();
  const overlay = h("div", { class: "modal-overlay", onclick: (e: Event) => { if (e.target === overlay) close(); } },
    h("div", { class: "modal panel" },
      h("h2", {}, title),
      body,
      h("div", { class: "modal-actions" }, actions.map((a) => h("button", { class: `btn btn-${a.kind ?? "ghost"}`, onclick: async () => { const r = await a.onClick(); if (r !== false) close(); } }, a.label))),
    ),
  );
  document.body.append(overlay);
  return close;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

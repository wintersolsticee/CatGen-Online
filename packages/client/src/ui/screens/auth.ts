import { h } from "../dom.ts";
import { api, auth } from "../../api.ts";

export function authScreen(mode: "login" | "register", nav: { done: () => void; back: () => void }): { el: HTMLElement; dispose: () => void } {
  let current = mode;
  const user = h("input", { class: "input", autocomplete: "username", placeholder: "e.g. Bramblestar", maxlength: 20 });
  const pass = h("input", { class: "input", type: "password", autocomplete: "current-password", placeholder: "At least 8 characters", maxlength: 128 });
  const err = h("div", { class: "error-text" });
  const submit = h("button", { class: "btn btn-primary", style: "width:100%", type: "submit" });
  const tabs = h("div", { class: "tabs" });
  const render = () => {
    tabs.replaceChildren(
      h("button", { type: "button", class: current === "login" ? "active" : "", onclick: () => { current = "login"; render(); } }, "Log in"),
      h("button", { type: "button", class: current === "register" ? "active" : "", onclick: () => { current = "register"; render(); } }, "Register"),
    );
    submit.textContent = current === "login" ? "Enter the forest" : "Create account";
    pass.setAttribute("autocomplete", current === "login" ? "current-password" : "new-password");
  };
  render();
  const form = h("form", {
    onsubmit: async (e: Event) => {
      e.preventDefault();
      err.textContent = "";
      submit.setAttribute("disabled", "");
      try {
        const res = current === "login" ? await api.login(user.value.trim(), pass.value) : await api.register(user.value.trim(), pass.value);
        auth.token = res.token;
        nav.done();
      } catch (ex) {
        err.textContent = (ex as Error).message;
      } finally {
        submit.removeAttribute("disabled");
      }
    },
  },
    h("label", { class: "field" }, "Username", user),
    h("label", { class: "field" }, "Password", pass),
    err,
    submit,
  );
  const el = h("div", { class: "screen scenic" },
    h("div", { class: "content" },
      h("div", { class: "topbar" }, h("div", { class: "logo", style: "cursor:pointer", onclick: nav.back }, "CatGen ", h("span", {}, "Online"))),
      h("div", { class: "auth-card panel" }, h("h2", { class: "display" }, "Welcome, traveller"), h("p", { class: "muted" }, "Your account holds all of your cats."), tabs, form),
    ),
  );
  setTimeout(() => user.focus(), 50);
  return { el, dispose: () => undefined };
}

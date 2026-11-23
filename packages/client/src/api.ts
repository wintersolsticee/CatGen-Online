/** REST API client. The auth token is kept in localStorage. */
import type { Appearance, ClanId, Rank } from "@catgen/shared";

const TOKEN_KEY = "catgen.token";
export const API_BASE = import.meta.env.VITE_API_URL ?? "";

export interface AccountInfo {
  id: string;
  username: string;
  role: "player" | "moderator" | "admin";
  settings: Record<string, unknown>;
}

export interface CharacterSummary {
  id: string;
  name: string;
  clan: ClanId | null;
  rank: Rank;
  appearance: Appearance;
  description: string;
}

export class ApiError extends Error {}

export const auth = {
  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },
  set token(v: string | null) {
    if (v) localStorage.setItem(TOKEN_KEY, v);
    else localStorage.removeItem(TOKEN_KEY);
  },
};

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth.token) headers.authorization = `Bearer ${auth.token}`;
  let res: Response;
  try {
    res = await fetch(API_BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError("Can't reach the server. Is it running?");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) auth.token = null;
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  register: (username: string, password: string) => call<{ token: string; account: AccountInfo }>("POST", "/api/auth/register", { username, password }),
  login: (username: string, password: string) => call<{ token: string; account: AccountInfo }>("POST", "/api/auth/login", { username, password }),
  me: () => call<{ account: AccountInfo }>("GET", "/api/me"),
  saveSettings: (settings: Record<string, unknown>) => call<{ ok: true }>("PUT", "/api/me/settings", { settings }),
  characters: () => call<{ characters: CharacterSummary[]; max: number }>("GET", "/api/characters"),
  createCharacter: (c: { name: string; clan: ClanId | null; rank: Rank; appearance: Appearance; description: string }) => call<{ character: CharacterSummary }>("POST", "/api/characters", c),
  updateCharacter: (id: string, c: { appearance?: Appearance; description?: string }) => call<{ ok: true }>("PATCH", `/api/characters/${id}`, c),
  deleteCharacter: (id: string) => call<{ ok: true }>("DELETE", `/api/characters/${id}`),
  profile: (name: string) => call<{ profile: CharacterSummary & { skills: Record<string, number>; discoveredCount: number } }>("GET", `/api/profiles/${encodeURIComponent(name)}`),
  clans: () => call<{ clans: { id: ClanId; name: string; color: string; description: string; memberCount: number; leader: string | null }[] }>("GET", "/api/clans"),
  social: (charId: string) => call<{ friends: { id: string; name: string; clan: string | null; status: string }[]; blocked: { id: string; name: string }[] }>("GET", `/api/characters/${charId}/social`),
  addFriend: (charId: string, name: string) => call<{ status: string }>("POST", `/api/characters/${charId}/friends`, { name }),
  removeFriend: (charId: string, friendId: string) => call<{ ok: true }>("DELETE", `/api/characters/${charId}/friends/${friendId}`),
  block: (charId: string, name: string) => call<{ ok: true }>("POST", `/api/characters/${charId}/blocks`, { name }),
  unblock: (charId: string, blockedId: string) => call<{ ok: true }>("DELETE", `/api/characters/${charId}/blocks/${blockedId}`),
};

import { GAME_CONFIG } from "../config.ts";

export type ChatChannel = "local" | "global" | "clan" | "whisper" | "system" | "announcement" | "emote";

/** Minimal word list; extend via moderation tooling. Matched on word boundaries, case-insensitive. */
const BLOCKED_WORDS = ["fuck", "shit", "bitch", "cunt", "nigger", "faggot", "retard", "whore", "slut", "dick", "pussy", "asshole"];

const blockedRegex = new RegExp(`\\b(${BLOCKED_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\w*`, "gi");

/** Strip control chars, collapse whitespace, enforce length. Returns null if empty. */
export function sanitizeChat(text: unknown): string | null {
  if (typeof text !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const clean = text.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e]/g, "").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return clean.slice(0, GAME_CONFIG.chat.maxLength);
}

/** Replace blocked words with asterisks. */
export function filterChat(text: string): string {
  return text.replace(blockedRegex, (m) => m[0] + "*".repeat(m.length - 1));
}

/** Emotes: id -> [third-person text, animation hint]. */
export const EMOTES: Record<string, { text: string; anim: "sit" | "lie" | "groom" | "stretch" | "purr" | "hiss" | "wag" | "nuzzle" }> = {
  sit: { text: "sits down", anim: "sit" },
  lie: { text: "lies down", anim: "lie" },
  sleep: { text: "curls up to sleep", anim: "lie" },
  groom: { text: "grooms their fur", anim: "groom" },
  stretch: { text: "stretches", anim: "stretch" },
  purr: { text: "purrs", anim: "purr" },
  hiss: { text: "hisses", anim: "hiss" },
  wag: { text: "flicks their tail", anim: "wag" },
  nuzzle: { text: "nuzzles affectionately", anim: "nuzzle" },
};

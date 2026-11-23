import { RANKS, type Rank, type ClanPermission } from "../data/ranks.ts";

export function hasPermission(rank: Rank, permission: ClanPermission): boolean {
  return RANKS[rank].permissions.includes(permission);
}

export type PromotionCheck = { ok: true } | { ok: false; reason: string };

/** Valid rank transitions (ceremonies). Leadership is transferred separately. */
const ALLOWED_TRANSITIONS: Record<Rank, Rank[]> = {
  kit: ["apprentice", "medicine_apprentice"],
  apprentice: ["warrior", "medicine_apprentice"],
  medicine_apprentice: ["medicine_cat", "apprentice"],
  warrior: ["deputy", "elder", "apprentice"],
  medicine_cat: ["elder"],
  deputy: ["warrior", "elder"],
  elder: ["warrior"],
  leader: [],
};

/**
 * Can `actor` change `target`'s rank to `newRank`? Rules:
 *  - actor needs the "promote" permission and must be in the same Clan;
 *  - actor must outrank the target, and cannot grant a rank at or above their own
 *    authority (except the leader naming a deputy);
 *  - only one deputy per Clan (enforced by the caller with `clanHasDeputy`).
 */
export function canChangeRank(
  actor: { rank: Rank; clan: string | null; id: string },
  target: { rank: Rank; clan: string | null; id: string },
  newRank: Rank,
  clanHasDeputy: boolean,
): PromotionCheck {
  if (!actor.clan || actor.clan !== target.clan) return { ok: false, reason: "That cat is not in your Clan." };
  if (actor.id === target.id) return { ok: false, reason: "You cannot change your own rank." };
  if (!hasPermission(actor.rank, "promote")) return { ok: false, reason: "Your rank cannot hold ceremonies." };
  if (newRank === "leader") return { ok: false, reason: "Leadership can only be passed on by the leader." };
  if (!ALLOWED_TRANSITIONS[target.rank].includes(newRank)) return { ok: false, reason: `A ${RANKS[target.rank].name} cannot become a ${RANKS[newRank].name}.` };
  const actorAuth = RANKS[actor.rank].authority;
  if (RANKS[target.rank].authority >= actorAuth) return { ok: false, reason: "You cannot change the rank of a cat of equal or higher rank." };
  if (RANKS[newRank].authority >= actorAuth && !(actor.rank === "leader" && newRank === "deputy")) {
    return { ok: false, reason: "You cannot grant that rank." };
  }
  if (newRank === "deputy" && clanHasDeputy) return { ok: false, reason: "The Clan already has a deputy." };
  return { ok: true };
}

/** Clan membership: whether a cat may join a Clan directly. Leaders hold their position. */
export function canLeaveClan(rank: Rank): PromotionCheck {
  if (rank === "leader") return { ok: false, reason: "A leader must pass on leadership before leaving." };
  return { ok: true };
}

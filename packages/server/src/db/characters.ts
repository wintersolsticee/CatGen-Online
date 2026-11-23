import type pg from "pg";
import { normalizeCharacterState, type CharacterData, type ClanId, type Rank } from "@catgen/shared";

export interface CharacterSummary {
  id: string;
  name: string;
  clan: ClanId | null;
  rank: Rank;
  appearance: CharacterData["appearance"];
  description: string;
  lastPlayedAt: string | null;
}

/** Fields stored in the `state` JSON column. */
type StoredState = Omit<CharacterData, "id" | "accountId" | "name" | "description" | "clan" | "rank" | "appearance">;

function toCharacter(r: Record<string, unknown>): CharacterData {
  const state = (r.state as Record<string, unknown>) ?? {};
  const norm = normalizeCharacterState({ ...state, name: r.name, description: r.description, clan: r.clan, rank: r.rank, appearance: r.appearance } as never);
  return { id: r.id as string, accountId: r.account_id as string, ...norm };
}

function stateOf(c: CharacterData): StoredState {
  return {
    health: c.health, stamina: c.stamina, hunger: c.hunger, conditions: c.conditions, inventory: c.inventory,
    equipped: c.equipped, knownHerbs: c.knownHerbs, skills: c.skills, discovered: c.discovered, x: c.x, y: c.y,
  };
}

export const MAX_CHARACTERS_PER_ACCOUNT = 5;

export class CharacterRepo {
  constructor(private db: pg.Pool) {}

  async listForAccount(accountId: string): Promise<CharacterSummary[]> {
    const r = await this.db.query(
      `SELECT id, name, clan, rank, appearance, description, last_played_at FROM characters
       WHERE account_id = $1 AND deleted_at IS NULL ORDER BY created_at`,
      [accountId],
    );
    return r.rows.map((x) => {
      const c = toCharacter({ ...x, account_id: accountId, state: {} });
      return { id: c.id, name: c.name, clan: c.clan, rank: c.rank, appearance: c.appearance, description: c.description, lastPlayedAt: x.last_played_at ? new Date(x.last_played_at).toISOString() : null };
    });
  }

  async countForAccount(accountId: string): Promise<number> {
    const r = await this.db.query(`SELECT count(*)::int AS n FROM characters WHERE account_id = $1 AND deleted_at IS NULL`, [accountId]);
    return r.rows[0].n;
  }

  async create(c: Omit<CharacterData, "id">): Promise<CharacterData | "name_taken"> {
    try {
      const r = await this.db.query(
        `INSERT INTO characters (account_id, name, description, clan, rank, appearance, state)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [c.accountId, c.name, c.description, c.clan, c.rank, c.appearance, stateOf(c as CharacterData)],
      );
      return toCharacter(r.rows[0]);
    } catch (e) {
      if ((e as { code?: string }).code === "23505") return "name_taken";
      throw e;
    }
  }

  async get(id: string): Promise<CharacterData | null> {
    const r = await this.db.query(`SELECT * FROM characters WHERE id = $1 AND deleted_at IS NULL`, [id]);
    return r.rows[0] ? toCharacter(r.rows[0]) : null;
  }

  async getOwned(id: string, accountId: string): Promise<CharacterData | null> {
    const c = await this.get(id);
    return c && c.accountId === accountId ? c : null;
  }

  async byName(name: string): Promise<CharacterData | null> {
    const r = await this.db.query(`SELECT * FROM characters WHERE lower(name) = lower($1) AND deleted_at IS NULL`, [name]);
    return r.rows[0] ? toCharacter(r.rows[0]) : null;
  }

  /** Persist the full character (called on leave / autosave). */
  async save(c: CharacterData): Promise<void> {
    await this.db.query(
      `UPDATE characters SET description=$2, clan=$3, rank=$4, appearance=$5, state=$6, updated_at=now(), last_played_at=now() WHERE id=$1`,
      [c.id, c.description, c.clan, c.rank, c.appearance, stateOf(c)],
    );
  }

  async updateProfile(id: string, fields: { appearance?: CharacterData["appearance"]; description?: string }): Promise<void> {
    if (fields.appearance) await this.db.query(`UPDATE characters SET appearance=$2, updated_at=now() WHERE id=$1`, [id, fields.appearance]);
    if (fields.description !== undefined) await this.db.query(`UPDATE characters SET description=$2, updated_at=now() WHERE id=$1`, [id, fields.description]);
  }

  async setClanRank(id: string, clan: ClanId | null, rank: Rank): Promise<void> {
    await this.db.query(`UPDATE characters SET clan=$2, rank=$3, updated_at=now() WHERE id=$1`, [id, clan, rank]);
  }

  /** Soft delete: player data is never silently destroyed. */
  async softDelete(id: string, accountId: string): Promise<boolean> {
    const r = await this.db.query(`UPDATE characters SET deleted_at = now() WHERE id=$1 AND account_id=$2 AND deleted_at IS NULL`, [id, accountId]);
    return (r.rowCount ?? 0) > 0;
  }

  async clanMembers(clan: ClanId): Promise<{ id: string; name: string; rank: Rank }[]> {
    const r = await this.db.query(`SELECT id, name, rank FROM characters WHERE clan = $1 AND deleted_at IS NULL ORDER BY name`, [clan]);
    return r.rows;
  }

  async clanHasRank(clan: ClanId, rank: Rank): Promise<boolean> {
    const r = await this.db.query(`SELECT 1 FROM characters WHERE clan=$1 AND rank=$2 AND deleted_at IS NULL LIMIT 1`, [clan, rank]);
    return (r.rowCount ?? 0) > 0;
  }
}

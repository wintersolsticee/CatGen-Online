import type pg from "pg";

export type AccountRole = "player" | "moderator" | "admin";

export interface Account {
  id: string;
  username: string;
  passwordHash: string;
  role: AccountRole;
  settings: Record<string, unknown>;
  mutedUntil: Date | null;
  bannedUntil: Date | null;
  banReason: string | null;
}

const COLS = `id, username, password_hash, role, settings, muted_until, banned_until, ban_reason`;

function row(r: Record<string, unknown>): Account {
  return {
    id: r.id as string,
    username: r.username as string,
    passwordHash: r.password_hash as string,
    role: r.role as AccountRole,
    settings: (r.settings as Record<string, unknown>) ?? {},
    mutedUntil: (r.muted_until as Date | null) ?? null,
    bannedUntil: (r.banned_until as Date | null) ?? null,
    banReason: (r.ban_reason as string | null) ?? null,
  };
}

export class AccountRepo {
  constructor(private db: pg.Pool) {}

  async create(username: string, passwordHash: string): Promise<Account | null> {
    try {
      const r = await this.db.query(`INSERT INTO accounts (username, password_hash) VALUES ($1, $2) RETURNING ${COLS}`, [username, passwordHash]);
      return row(r.rows[0]);
    } catch (e) {
      if ((e as { code?: string }).code === "23505") return null; // unique violation
      throw e;
    }
  }

  async byUsername(username: string): Promise<Account | null> {
    const r = await this.db.query(`SELECT ${COLS} FROM accounts WHERE lower(username) = lower($1)`, [username]);
    return r.rows[0] ? row(r.rows[0]) : null;
  }

  async byId(id: string): Promise<Account | null> {
    const r = await this.db.query(`SELECT ${COLS} FROM accounts WHERE id = $1`, [id]);
    return r.rows[0] ? row(r.rows[0]) : null;
  }

  async touchLogin(id: string): Promise<void> {
    await this.db.query(`UPDATE accounts SET last_login_at = now() WHERE id = $1`, [id]);
  }

  async updateSettings(id: string, settings: Record<string, unknown>): Promise<void> {
    await this.db.query(`UPDATE accounts SET settings = $2 WHERE id = $1`, [id, settings]);
  }

  async setMute(id: string, until: Date | null): Promise<void> {
    await this.db.query(`UPDATE accounts SET muted_until = $2 WHERE id = $1`, [id, until]);
  }

  async setBan(id: string, until: Date | null, reason: string | null): Promise<void> {
    await this.db.query(`UPDATE accounts SET banned_until = $2, ban_reason = $3 WHERE id = $1`, [id, until, reason]);
  }

  async setRole(id: string, role: AccountRole): Promise<void> {
    await this.db.query(`UPDATE accounts SET role = $2 WHERE id = $1`, [id, role]);
  }

  async logModeration(moderatorId: string, targetId: string | null, action: string, minutes: number | null, reason: string | null): Promise<void> {
    await this.db.query(`INSERT INTO moderation_log (moderator_id, target_id, action, minutes, reason) VALUES ($1,$2,$3,$4,$5)`, [moderatorId, targetId, action, minutes, reason]);
  }
}

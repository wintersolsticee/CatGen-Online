import type pg from "pg";
import type { ClanId, ClanRelation } from "@catgen/shared";

export interface ClanRecord {
  id: ClanId;
  freshKill: Record<string, number>;
  herbStore: Record<string, number>;
  relations: Partial<Record<ClanId, ClanRelation>>;
}

export class ClanRepo {
  constructor(private db: pg.Pool) {}

  async all(): Promise<ClanRecord[]> {
    const r = await this.db.query(`SELECT id, fresh_kill, herb_store, relations FROM clans`);
    return r.rows.map((x) => ({ id: x.id, freshKill: x.fresh_kill ?? {}, herbStore: x.herb_store ?? {}, relations: x.relations ?? {} }));
  }

  async save(c: ClanRecord): Promise<void> {
    await this.db.query(`UPDATE clans SET fresh_kill=$2, herb_store=$3, relations=$4, updated_at=now() WHERE id=$1`, [c.id, c.freshKill, c.herbStore, c.relations]);
  }

  async addAnnouncement(clan: ClanId, author: string, text: string): Promise<void> {
    await this.db.query(`INSERT INTO clan_announcements (clan_id, author_name, text) VALUES ($1,$2,$3)`, [clan, author, text]);
  }

  async announcements(clan: ClanId, limit = 10): Promise<{ text: string; author: string; ts: number }[]> {
    const r = await this.db.query(`SELECT author_name, text, created_at FROM clan_announcements WHERE clan_id=$1 ORDER BY created_at DESC LIMIT $2`, [clan, limit]);
    return r.rows.map((x) => ({ text: x.text, author: x.author_name, ts: new Date(x.created_at).getTime() }));
  }
}

import type pg from "pg";

export class WorldRepo {
  constructor(private db: pg.Pool) {}

  async load(id: string): Promise<{ worldTime: number; data: Record<string, unknown> }> {
    const r = await this.db.query(`SELECT world_time, data FROM world_state WHERE id=$1`, [id]);
    if (!r.rows[0]) return { worldTime: 0, data: {} };
    return { worldTime: Number(r.rows[0].world_time), data: r.rows[0].data ?? {} };
  }

  async save(id: string, worldTime: number, data: Record<string, unknown>): Promise<void> {
    await this.db.query(
      `INSERT INTO world_state (id, world_time, data) VALUES ($1,$2,$3)
       ON CONFLICT (id) DO UPDATE SET world_time=EXCLUDED.world_time, data=EXCLUDED.data, updated_at=now()`,
      [id, Math.floor(worldTime), data],
    );
  }
}

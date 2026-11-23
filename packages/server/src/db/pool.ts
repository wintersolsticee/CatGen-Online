import pg from "pg";
import { ENV } from "../env.ts";

export type Db = pg.Pool;

let pool: pg.Pool | null = null;

export function getPool(url = ENV.databaseUrl): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString: url, max: 10 });
    pool.on("error", (err) => console.error("[db] idle client error", err));
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

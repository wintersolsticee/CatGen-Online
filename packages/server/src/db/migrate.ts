/**
 * Versioned SQL migrations. Files in ./migrations named NNN_description.sql are
 * applied in order, each in its own transaction, and recorded in schema_migrations.
 * Never edit an applied migration - add a new one instead.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";
import { getPool, closePool } from "./pool.ts";

const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "migrations");

export async function migrate(pool: pg.Pool, log = console.log): Promise<string[]> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const applied = new Set((await pool.query<{ version: string }>("SELECT version FROM schema_migrations")).rows.map((r) => r.version));
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  const ran: string[] = [];
  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    if (applied.has(version)) continue;
    const sql = readFileSync(resolve(MIGRATIONS_DIR, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Serialise concurrent migrators.
      await client.query("SELECT pg_advisory_xact_lock(4242)");
      const again = await client.query("SELECT 1 FROM schema_migrations WHERE version = $1", [version]);
      if (again.rowCount === 0) {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
        ran.push(version);
        log(`[migrate] applied ${version}`);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`Migration ${version} failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
  return ran;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  migrate(getPool())
    .then((ran) => console.log(ran.length ? `[migrate] ${ran.length} migration(s) applied` : "[migrate] up to date"))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => closePool());
}

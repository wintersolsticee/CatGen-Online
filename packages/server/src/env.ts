/** Server configuration from environment variables (with development defaults). */
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Relative paths in env vars are resolved from the repository root. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const repoPath = (p: string | undefined) => (p ? (isAbsolute(p) ? p : resolve(REPO_ROOT, p)) : undefined);

const isProd = process.env.NODE_ENV === "production";

function required(name: string, devDefault: string): string {
  const v = process.env[name];
  if (v) return v;
  if (isProd) throw new Error(`Missing required environment variable ${name}`);
  return devDefault;
}

export const ENV = {
  isProd,
  port: Number(process.env.PORT ?? 2567),
  databaseUrl: required("DATABASE_URL", "postgres://catgen:catgen@localhost:5432/catgen"),
  jwtSecret: required("JWT_SECRET", "dev-only-insecure-secret-change-me"),
  /** Comma-separated list of allowed browser origins (CORS). */
  clientOrigins: (process.env.CLIENT_ORIGIN ?? "http://localhost:5173").split(",").map((s) => s.trim()),
  /** Path to the world map JSON shared with the client. */
  mapPath: repoPath(process.env.MAP_PATH),
  /** Serve the built client from this directory (production). */
  clientDist: repoPath(process.env.CLIENT_DIST),
};

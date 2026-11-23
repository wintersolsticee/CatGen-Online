import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import {
  CLANS, STARTING_RANKS, isClanId, isRank, normalizeAppearance, validateCharacterName, normalizeCharacterState,
  RANKS, type CharacterData,
} from "@catgen/shared";
import type { Repos } from "../db/index.ts";
import { MAX_CHARACTERS_PER_ACCOUNT } from "../db/characters.ts";
import { hashPassword, signToken, validateCredentials, verifyPassword, verifyToken } from "../services/auth.ts";
import { ENV } from "../env.ts";
import type { Account } from "../db/accounts.ts";

declare module "express-serve-static-core" {
  interface Request {
    account?: Account;
  }
}

/** Simple in-memory rate limiter per IP+route (protects auth endpoints from brute force). */
function rateLimit(max: number, windowMs: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const h = hits.get(key);
    if (!h || h.reset < now) hits.set(key, { n: 1, reset: now + windowMs });
    else if (++h.n > max) return res.status(429).json({ error: "Too many attempts. Please wait a moment." });
    next();
  };
}

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

export function createApp(repos: Repos): express.Express {
  const app = express();
  app.set("trust proxy", 1);
  app.use(cors({ origin: ENV.clientOrigins, credentials: false }));
  app.use(express.json({ limit: "64kb" }));

  /** Authenticate the bearer token and attach the account to the request. */
  const authed = (req: Request, res: Response, next: NextFunction) => {
    (async () => {
      const header = req.headers.authorization ?? "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : "";
      const payload = verifyToken(token);
      const account = payload ? await repos.accounts.byId(payload.sub) : null;
      if (!account) return void res.status(401).json({ error: "Please log in." });
      if (account.bannedUntil && account.bannedUntil > new Date()) {
        return void res.status(403).json({ error: `Banned until ${account.bannedUntil.toISOString()}: ${account.banReason ?? ""}` });
      }
      req.account = account;
      next();
    })().catch(next);
  };

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  // ---- Auth ---------------------------------------------------------------
  app.post("/api/auth/register", rateLimit(10, 60_000), wrap(async (req, res) => {
    const { username, password } = req.body ?? {};
    const err = validateCredentials(username, password);
    if (err) return res.status(400).json({ error: err });
    const account = await repos.accounts.create(username, await hashPassword(password));
    if (!account) return res.status(409).json({ error: "That username is taken." });
    res.json({ token: signToken({ sub: account.id, username: account.username }), account: publicAccount(account) });
  }));

  app.post("/api/auth/login", rateLimit(20, 60_000), wrap(async (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== "string" || typeof password !== "string") return res.status(400).json({ error: "Missing credentials." });
    const account = await repos.accounts.byUsername(username);
    if (!account || !(await verifyPassword(password, account.passwordHash))) return res.status(401).json({ error: "Wrong username or password." });
    if (account.bannedUntil && account.bannedUntil > new Date()) return res.status(403).json({ error: `This account is banned until ${account.bannedUntil.toLocaleString()}.` });
    await repos.accounts.touchLogin(account.id);
    res.json({ token: signToken({ sub: account.id, username: account.username }), account: publicAccount(account) });
  }));

  app.get("/api/me", authed, (req, res) => res.json({ account: publicAccount(req.account!) }));

  app.put("/api/me/settings", authed, wrap(async (req, res) => {
    const s = req.body?.settings;
    if (!s || typeof s !== "object" || JSON.stringify(s).length > 4000) return res.status(400).json({ error: "Invalid settings." });
    await repos.accounts.updateSettings(req.account!.id, s);
    res.json({ ok: true });
  }));

  // ---- Characters ---------------------------------------------------------
  app.get("/api/characters", authed, wrap(async (req, res) => {
    res.json({ characters: await repos.characters.listForAccount(req.account!.id), max: MAX_CHARACTERS_PER_ACCOUNT });
  }));

  app.post("/api/characters", authed, wrap(async (req, res) => {
    const b = req.body ?? {};
    const nameErr = validateCharacterName(b.name);
    if (nameErr) return res.status(400).json({ error: nameErr });
    if (b.clan !== null && !isClanId(b.clan)) return res.status(400).json({ error: "Choose a Clan (or the loner life)." });
    const rank = isRank(b.rank) && STARTING_RANKS.includes(b.rank) ? b.rank : "apprentice";
    if ((await repos.characters.countForAccount(req.account!.id)) >= MAX_CHARACTERS_PER_ACCOUNT) {
      return res.status(400).json({ error: `You can have at most ${MAX_CHARACTERS_PER_ACCOUNT} cats.` });
    }
    const base = normalizeCharacterState({});
    const created = await repos.characters.create({
      ...base,
      accountId: req.account!.id,
      name: (b.name as string).trim().replace(/\s+/g, " "),
      description: typeof b.description === "string" ? b.description.slice(0, 500) : "",
      clan: b.clan,
      rank: b.clan === null ? "warrior" : rank,
      appearance: normalizeAppearance(b.appearance),
      knownHerbs: rank === "medicine_apprentice" ? ["cobweb", "marigold", "dock", "poppy_seed"] : ["cobweb"],
      inventory: rank === "medicine_apprentice" ? [{ itemId: "cobweb", qty: 3 }] : [],
    });
    if (created === "name_taken") return res.status(409).json({ error: "A cat with that name already exists." });
    res.json({ character: summary(created) });
  }));

  app.patch("/api/characters/:id", authed, wrap(async (req, res) => {
    const c = await repos.characters.getOwned(req.params.id, req.account!.id);
    if (!c) return res.status(404).json({ error: "Character not found." });
    const fields: { appearance?: CharacterData["appearance"]; description?: string } = {};
    if (req.body?.appearance) {
      // Preserve scars earned in-game: players can't remove them via the editor.
      const next = normalizeAppearance(req.body.appearance);
      next.scars = Array.from(new Set([...c.appearance.scars, ...next.scars])).slice(0, 4);
      fields.appearance = next;
    }
    if (typeof req.body?.description === "string") fields.description = req.body.description.slice(0, 500);
    await repos.characters.updateProfile(c.id, fields);
    res.json({ ok: true });
  }));

  app.delete("/api/characters/:id", authed, wrap(async (req, res) => {
    const c = await repos.characters.getOwned(req.params.id, req.account!.id);
    if (!c) return res.status(404).json({ error: "Character not found." });
    if (c.rank === "leader") return res.status(400).json({ error: "Pass on leadership before retiring this cat." });
    await repos.characters.softDelete(c.id, req.account!.id);
    res.json({ ok: true });
  }));

  // ---- Profiles & clans (public) -----------------------------------------
  app.get("/api/profiles/:name", authed, wrap(async (req, res) => {
    const c = await repos.characters.byName(req.params.name);
    if (!c) return res.status(404).json({ error: "No cat by that name." });
    res.json({ profile: { ...summary(c), skills: c.skills, discoveredCount: c.discovered.length } });
  }));

  app.get("/api/clans", wrap(async (_req, res) => {
    const records = await repos.clans.all();
    const out = await Promise.all(CLANS.map(async (c) => {
      const members = await repos.characters.clanMembers(c.id);
      return { ...c, memberCount: members.length, leader: members.find((m) => m.rank === "leader")?.name ?? null, relations: records.find((r) => r.id === c.id)?.relations ?? {} };
    }));
    res.json({ clans: out, ranks: RANKS });
  }));

  // ---- Social --------------------------------------------------------------
  const ownedChar = async (req: Request, res: Response) => {
    const c = await repos.characters.getOwned(String(req.params.charId), req.account!.id);
    if (!c) res.status(404).json({ error: "Character not found." });
    return c;
  };

  app.get("/api/characters/:charId/social", authed, wrap(async (req, res) => {
    const c = await ownedChar(req, res);
    if (!c) return;
    res.json({ friends: await repos.social.friends(c.id), blocked: await repos.social.blocked(c.id) });
  }));

  app.post("/api/characters/:charId/friends", authed, wrap(async (req, res) => {
    const c = await ownedChar(req, res);
    if (!c) return;
    const target = typeof req.body?.name === "string" ? await repos.characters.byName(req.body.name) : null;
    if (!target || target.id === c.id) return res.status(404).json({ error: "No cat by that name." });
    const blocked = (await repos.social.blocked(target.id)).some((b) => b.id === c.id);
    if (blocked) return res.status(403).json({ error: "That cat is not accepting requests." });
    res.json({ status: await repos.social.addFriend(c.id, target.id) });
  }));

  app.delete("/api/characters/:charId/friends/:friendId", authed, wrap(async (req, res) => {
    const c = await ownedChar(req, res);
    if (!c) return;
    await repos.social.removeFriend(c.id, req.params.friendId);
    res.json({ ok: true });
  }));

  app.post("/api/characters/:charId/blocks", authed, wrap(async (req, res) => {
    const c = await ownedChar(req, res);
    if (!c) return;
    const target = typeof req.body?.name === "string" ? await repos.characters.byName(req.body.name) : null;
    if (!target || target.id === c.id) return res.status(404).json({ error: "No cat by that name." });
    await repos.social.block(c.id, target.id);
    res.json({ ok: true });
  }));

  app.delete("/api/characters/:charId/blocks/:blockedId", authed, wrap(async (req, res) => {
    const c = await ownedChar(req, res);
    if (!c) return;
    await repos.social.unblock(c.id, req.params.blockedId);
    res.json({ ok: true });
  }));

  // ---- Moderation ----------------------------------------------------------
  const requireMod = (req: Request, res: Response, next: NextFunction) =>
    req.account && req.account.role !== "player" ? next() : res.status(403).json({ error: "Moderators only." });

  app.get("/api/mod/reports", authed, requireMod, wrap(async (_req, res) => res.json({ reports: await repos.social.openReports() })));
  app.post("/api/mod/reports/:id/resolve", authed, requireMod, wrap(async (req, res) => {
    await repos.social.resolveReport(Number(req.params.id));
    res.json({ ok: true });
  }));

  // ---- Static client (production) -----------------------------------------
  if (ENV.clientDist) {
    app.use(express.static(ENV.clientDist, { maxAge: "1h", index: "index.html" }));
    app.get(/^(?!\/api|\/matchmake).*/, (_req, res) => res.sendFile("index.html", { root: ENV.clientDist }));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[http]", err);
    if (!res.headersSent) res.status(500).json({ error: "Something went wrong." });
  });

  return app;
}

function publicAccount(a: Account) {
  return { id: a.id, username: a.username, role: a.role, settings: a.settings };
}

function summary(c: CharacterData) {
  return { id: c.id, name: c.name, clan: c.clan, rank: c.rank, appearance: c.appearance, description: c.description };
}

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ENV } from "../env.ts";

export interface TokenPayload {
  sub: string; // account id
  username: string;
}

const TOKEN_TTL = "7d";

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, ENV.jwtSecret, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const p = jwt.verify(token, ENV.jwtSecret);
    if (typeof p === "object" && p && typeof p.sub === "string" && typeof p.username === "string") return { sub: p.sub, username: p.username };
    return null;
  } catch {
    return null;
  }
}

export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

export function validateCredentials(username: unknown, password: unknown): string | null {
  if (typeof username !== "string" || !USERNAME_RE.test(username)) return "Username must be 3-20 letters, numbers or underscores.";
  if (typeof password !== "string" || password.length < 8 || password.length > 128) return "Password must be 8-128 characters.";
  return null;
}

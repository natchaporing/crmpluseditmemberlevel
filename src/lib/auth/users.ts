import "server-only";

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

const KEY_LENGTH = 64;

/** Defaults used when hashing a new password. */
export const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;

export type User = {
  username: string;
  /** Display name shown in the app header. */
  name: string;
  passwordHash: string;
};

type ParsedHash = {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
};

/**
 * Serialised form: `scrypt:N:r:p:<salt base64>:<hash base64>`.
 *
 * Generate one with `npm run auth:hash`.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(
    password.normalize("NFKC"),
    salt,
    KEY_LENGTH,
    SCRYPT_PARAMS,
  );

  return [
    "scrypt",
    SCRYPT_PARAMS.N,
    SCRYPT_PARAMS.r,
    SCRYPT_PARAMS.p,
    salt.toString("base64"),
    hash.toString("base64"),
  ].join(":");
}

function parseHash(serialised: string): ParsedHash | null {
  const parts = serialised.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;

  const [, rawN, rawR, rawP, rawSalt, rawHash] = parts;
  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);

  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return null;
  }

  const salt = Buffer.from(rawSalt, "base64");
  const hash = Buffer.from(rawHash, "base64");
  if (salt.length === 0 || hash.length === 0) return null;

  return { N, r, p, salt, hash };
}

async function matchesHash(
  password: string,
  serialised: string,
): Promise<boolean> {
  const parsed = parseHash(serialised);
  if (!parsed) return false;

  const derived = await scryptAsync(
    password.normalize("NFKC"),
    parsed.salt,
    parsed.hash.length,
    { N: parsed.N, r: parsed.r, p: parsed.p },
  );

  return (
    derived.length === parsed.hash.length && timingSafeEqual(derived, parsed.hash)
  );
}

/**
 * Reads the configured operators from `AUTH_USERS`.
 *
 * Entries are separated by `;` or a newline, fields by `|`:
 *
 *     AUTH_USERS="admin|ผู้ดูแลระบบ|scrypt:16384:8:1:<salt>:<hash>"
 *
 * The display-name field is optional and falls back to the username.
 */
export function getConfiguredUsers(): User[] {
  const raw = process.env.AUTH_USERS;
  if (!raw?.trim()) return [];

  return raw
    .split(/[;\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const [username, ...rest] = entry.split("|").map((part) => part.trim());
      // Two fields means the name was omitted: `username|hash`.
      const passwordHash = rest.length > 1 ? rest[1] : rest[0];
      const name = rest.length > 1 && rest[0] ? rest[0] : username;

      if (!username || !passwordHash) return [];
      return [{ username, name, passwordHash }];
    });
}

/**
 * Verifies credentials against the configured operators.
 *
 * Always runs one scrypt derivation so that an unknown username takes the same
 * time as a known one with a wrong password.
 */
export async function verifyCredentials(
  username: string,
  password: string,
): Promise<User | null> {
  const users = getConfiguredUsers();
  const candidate = users.find(
    (user) => user.username.toLowerCase() === username.trim().toLowerCase(),
  );

  if (!candidate) {
    // Burn comparable CPU time against a throwaway hash.
    await matchesHash(password, await hashPassword("no-such-user"));
    return null;
  }

  const ok = await matchesHash(password, candidate.passwordHash);
  return ok ? candidate : null;
}

#!/usr/bin/env node
/**
 * Generates an `AUTH_USERS` entry for a new operator.
 *
 *   npm run auth:hash -- <username> [display name]
 *
 * The password is read from stdin (or the PASSWORD env var) so it never lands
 * in shell history. Paste the printed line into `.env.local`.
 */
import { randomBytes, scrypt } from "node:crypto";
import { createInterface } from "node:readline";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;

async function readPassword() {
  if (process.env.PASSWORD) return process.env.PASSWORD;

  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return await new Promise((resolve) => {
      rl.question("Password: ", resolve);
    });
  } finally {
    rl.close();
  }
}

const [username, ...nameParts] = process.argv.slice(2);

if (!username) {
  console.error("Usage: npm run auth:hash -- <username> [display name]");
  process.exit(1);
}

const displayName = nameParts.join(" ").trim() || username;
const password = (await readPassword()).trim();

if (password.length < 12) {
  console.error("Password must be at least 12 characters.");
  process.exit(1);
}

const salt = randomBytes(16);
const hash = await scryptAsync(
  password.normalize("NFKC"),
  salt,
  KEY_LENGTH,
  PARAMS,
);

const serialised = [
  "scrypt",
  PARAMS.N,
  PARAMS.r,
  PARAMS.p,
  salt.toString("base64"),
  hash.toString("base64"),
].join(":");

console.error("\nAdd this to AUTH_USERS in .env.local:\n");
console.log(`${username}|${displayName}|${serialised}`);

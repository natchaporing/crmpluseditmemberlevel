import { SignJWT, jwtVerify } from "jose";

/**
 * Pure token helpers, free of `next/headers` so that Proxy can import them.
 * Cookie reading and writing lives in `./session`.
 */

export const SESSION_COOKIE = "crmplus_session";

/** How long a login stays valid. */
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export type SessionPayload = {
  /** Username of the signed-in operator. */
  sub: string;
  /** Display name shown in the header. */
  name: string;
};

let cachedKey: Uint8Array | undefined;

function secretKey(): Uint8Array {
  if (cachedKey) return cachedKey;

  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET is missing or too short. Set it to a random string of at least 32 characters (see .env.example).",
    );
  }

  cachedKey = new TextEncoder().encode(secret);
  return cachedKey;
}

export async function encryptSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ name: payload.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

export async function decryptSession(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
    });

    if (typeof payload.sub !== "string" || typeof payload.name !== "string") {
      return null;
    }

    return { sub: payload.sub, name: payload.name };
  } catch {
    // Expired, tampered with, or signed by a different secret.
    return null;
  }
}

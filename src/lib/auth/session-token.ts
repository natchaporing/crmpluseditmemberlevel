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
  /**
   * The till the operator signed in at. Typed on the login form rather than
   * configured per deployment, and carried in the session so the app knows
   * where a level change happened without asking again on every action.
   */
  terminalId: string;
  branchId: string;
  brandId: string;
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
  return new SignJWT({
    name: payload.name,
    terminalId: payload.terminalId,
    branchId: payload.branchId,
    brandId: payload.brandId,
  })
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

    const { sub, name, terminalId, branchId, brandId } = payload;

    // A session minted before the till fields existed fails this check and is
    // treated as signed out, which is the safe direction.
    if (
      typeof sub !== "string" ||
      typeof name !== "string" ||
      typeof terminalId !== "string" ||
      typeof branchId !== "string" ||
      typeof brandId !== "string"
    ) {
      return null;
    }

    return { sub, name, terminalId, branchId, brandId };
  } catch {
    // Expired, tampered with, or signed by a different secret.
    return null;
  }
}

import "server-only";

import {
  appId,
  merchantBaseUrl,
  merchantCredentials,
  secretValues,
} from "@/lib/buzzebees/config";

/**
 * Merchant authentication against `POST /merchant/login`.
 *
 * The endpoint takes multipart/form-data and returns a token used to authorise
 * subsequent merchant calls. Its exact response shape has not been confirmed
 * against the live service yet, so the token is looked up under the usual key
 * spellings and the decoded body is handed back untouched as `raw`.
 */

const LOGIN_PATH = "/merchant/login";

/**
 * How long a token is reused before logging in again. The service does not
 * document an expiry, so this is deliberately short; call
 * `invalidateMerchantToken()` when a downstream call rejects a token early.
 */
const TOKEN_TTL_MS = 30 * 60 * 1000;

/** Error bodies are echoed for debugging, but only a bounded prefix. */
const MAX_BODY_SNIPPET = 500;

export class BuzzebeesAuthError extends Error {
  /** HTTP status, or 0 when the request never completed. */
  readonly status: number;
  /** Truncated response body, for diagnostics. */
  readonly body: string;

  constructor(
    message: string,
    options: { status?: number; body?: string; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "BuzzebeesAuthError";
    this.status = options.status ?? 0;
    this.body = redact(options.body ?? "").slice(0, MAX_BODY_SNIPPET);
  }
}

/** Strips credential values in case the service echoes the request back. */
function redact(text: string): string {
  let output = text;

  for (const value of secretValues()) {
    output = output.split(value).join("***");
  }

  return output;
}

export type MerchantLogin = {
  token: string;
  /** The full decoded response, so no field is lost to an incomplete model. */
  raw: Record<string, unknown>;
};

const TOKEN_KEYS = ["token", "Token", "access_token", "accessToken"] as const;

function extractToken(payload: Record<string, unknown>): string | null {
  for (const key of TOKEN_KEYS) {
    const value = payload[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

/**
 * Performs a fresh merchant login. Prefer `getMerchantToken()`, which caches.
 */
export async function merchantLogin(): Promise<MerchantLogin> {
  const form = new FormData();
  for (const [field, value] of Object.entries(merchantCredentials())) {
    form.append(field, value);
  }

  let response: Response;
  try {
    response = await fetch(`${merchantBaseUrl()}${LOGIN_PATH}`, {
      method: "POST",
      // Content-Type is intentionally omitted: fetch derives it from the
      // FormData body along with the multipart boundary. Setting it by hand
      // produces a boundary-less header and the server rejects the request.
      headers: { "app-id": appId() },
      body: form,
      cache: "no-store",
    });
  } catch (cause) {
    throw new BuzzebeesAuthError(
      "Could not reach the Buzzebees merchant login endpoint.",
      { cause },
    );
  }

  const text = await response.text();

  if (!response.ok) {
    throw new BuzzebeesAuthError(
      `Merchant login failed with HTTP ${response.status}.`,
      { status: response.status, body: text },
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new BuzzebeesAuthError("Merchant login returned a non-JSON body.", {
      status: response.status,
      body: text,
    });
  }

  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new BuzzebeesAuthError(
      "Merchant login returned an unexpected JSON shape.",
      { status: response.status, body: text },
    );
  }

  const raw = payload as Record<string, unknown>;
  const token = extractToken(raw);

  if (!token) {
    throw new BuzzebeesAuthError(
      `Merchant login succeeded but no token field was found (keys: ${Object.keys(raw).join(", ") || "none"}).`,
      { status: response.status, body: text },
    );
  }

  return { token, raw };
}

type TokenCache = { token: string; expiresAt: number };

// Kept on globalThis so dev-server hot reloads do not force a new login.
const globalForAuth = globalThis as unknown as {
  __buzzebeesToken?: TokenCache;
  __buzzebeesLogin?: Promise<string>;
};

/**
 * Returns a merchant token, reusing the cached one until it ages out.
 *
 * Concurrent callers share a single in-flight login rather than each opening
 * their own.
 */
export async function getMerchantToken(
  options: { forceRefresh?: boolean } = {},
): Promise<string> {
  if (options.forceRefresh) invalidateMerchantToken();

  const cached = globalForAuth.__buzzebeesToken;
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  globalForAuth.__buzzebeesLogin ??= merchantLogin()
    .then(({ token }) => {
      globalForAuth.__buzzebeesToken = {
        token,
        expiresAt: Date.now() + TOKEN_TTL_MS,
      };
      return token;
    })
    .finally(() => {
      globalForAuth.__buzzebeesLogin = undefined;
    });

  return globalForAuth.__buzzebeesLogin;
}

/** Drops the cached token, so the next call logs in again. */
export function invalidateMerchantToken(): void {
  globalForAuth.__buzzebeesToken = undefined;
}

/**
 * The Authorization header value for a token.
 *
 * The scheme is the literal word `token`, not `Bearer` — see the `/pos/profile`
 * contract.
 */
export function authorizationHeader(token: string): string {
  return `token ${token}`;
}

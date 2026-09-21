import "server-only";

import {
  appId,
  merchantBaseUrl,
  merchantCredentials,
  operatorLoginPath,
  secretValues,
} from "@/lib/buzzebees/config";
import { logCurl } from "@/lib/buzzebees/curl-log";

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
    options: {
      status?: number;
      body?: string;
      cause?: unknown;
      /** Extra values to scrub, e.g. a password typed into the login form. */
      secrets?: string[];
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "BuzzebeesAuthError";
    this.status = options.status ?? 0;
    this.body = redact(options.body ?? "", options.secrets).slice(
      0,
      MAX_BODY_SNIPPET,
    );
  }
}

/** Strips credential values in case the service echoes the request back. */
function redact(text: string, extraSecrets: string[] = []): string {
  let output = text;

  for (const value of [...secretValues(), ...extraSecrets]) {
    if (!value) continue;
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
 * Posts one set of credentials to a Buzzebees login endpoint and pulls the
 * token out of the reply.
 *
 * Shared by the service-account login and operator login — they differ only in
 * which credentials they send and which path they post to. Credentials that
 * the service rejects come back as `null`; anything else throws, so a
 * misconfigured deploy is loud instead of looking like a typed-wrong password.
 */
async function performLogin(
  path: string,
  fields: Record<string, string>,
  extraSecrets: string[] = [],
): Promise<MerchantLogin | null> {
  const form = new FormData();
  for (const [field, value] of Object.entries(fields)) {
    form.append(field, value);
  }

  const url = `${merchantBaseUrl()}${path}`;

  logCurl(`POST ${path}`, {
    method: "POST",
    url,
    headers: { "app-id": appId() },
    form: fields,
  }, [...extraSecrets, ...secretValues()]);

  let response: Response;
  try {
    response = await fetch(url, {
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
      `Could not reach the Buzzebees login endpoint ${path}.`,
      { cause, secrets: extraSecrets },
    );
  }

  const text = await response.text();

  // Only an explicit auth rejection counts as "wrong credentials". A 400 is
  // deliberately not in this set: it usually means a malformed request, and
  // reporting that as a bad password would hide the real fault.
  if (response.status === 401 || response.status === 403) return null;

  if (!response.ok) {
    throw new BuzzebeesAuthError(
      `Login to ${path} failed with HTTP ${response.status}.`,
      { status: response.status, body: text, secrets: extraSecrets },
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new BuzzebeesAuthError(`Login to ${path} returned a non-JSON body.`, {
      status: response.status,
      body: text,
      secrets: extraSecrets,
    });
  }

  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new BuzzebeesAuthError(
      `Login to ${path} returned an unexpected JSON shape.`,
      { status: response.status, body: text, secrets: extraSecrets },
    );
  }

  const raw = payload as Record<string, unknown>;
  const token = extractToken(raw);

  if (!token) {
    throw new BuzzebeesAuthError(
      `Login to ${path} succeeded but no token field was found (keys: ${Object.keys(raw).join(", ") || "none"}).`,
      { status: response.status, body: text, secrets: extraSecrets },
    );
  }

  return { token, raw };
}

/**
 * Performs a fresh service-account login. Prefer `getMerchantToken()`, which
 * caches.
 *
 * The service account drives the app's own API calls. Operators signing in is
 * a separate flow — see `operatorLogin()`.
 */
export async function merchantLogin(): Promise<MerchantLogin> {
  const result = await performLogin(LOGIN_PATH, merchantCredentials());

  if (!result) {
    throw new BuzzebeesAuthError(
      "Merchant login was rejected. Check BUZZEBEES_USERNAME and BUZZEBEES_PASSWORD.",
      { status: 401 },
    );
  }

  return result;
}

/** The till an operator is signing in at, as typed on the login form. */
export type PosContext = {
  terminalId: string;
  branchId: string;
  brandId: string;
};

/** An operator who has just proved their identity to Buzzebees. */
export type OperatorIdentity = {
  username: string;
  /** Display name from the reply, falling back to the username. */
  name: string;
};

/** Keys the reply might carry a human-readable name under. */
const NAME_KEYS = [
  "name",
  "Name",
  "fullname",
  "fullName",
  "FullName",
  "full_name",
  "displayname",
  "displayName",
  "DisplayName",
  "display_name",
] as const;

function extractName(payload: Record<string, unknown>): string | null {
  for (const key of NAME_KEYS) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Verifies an operator's own credentials against Buzzebees.
 *
 * Returns their identity when the service accepts them, or `null` when it
 * rejects them. There is no local user list: whoever the API vouches for can
 * sign in. The terminal, branch and brand identify the till and are typed on
 * the login form alongside the username and password.
 *
 * Which endpoint authenticates operators varies per deployment, hence
 * `BUZZEBEES_LOGIN_PATH`.
 */
export async function operatorLogin(
  username: string,
  password: string,
  pos: PosContext,
): Promise<OperatorIdentity | null> {
  const result = await performLogin(
    operatorLoginPath(),
    {
      username,
      password,
      terminalid: pos.terminalId,
      branchid: pos.branchId,
      brandid: pos.brandId,
    },
    [password],
  );

  if (!result) return null;

  return { username, name: extractName(result.raw) ?? username };
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

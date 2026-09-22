import "server-only";

import { appId, ssoBaseUrl, ssoLoginPath } from "@/lib/buzzebees/config";
import { logCurl } from "@/lib/buzzebees/curl-log";

/**
 * Operator authentication against single sign-on.
 *
 * One login, two tokens. `POST /auth/bzbs_login` returns the CRM Plus token as
 * `token` and the wallet token as `ewallet_token`, so the separate call to
 * `/merchant/login` this used to make is gone: it fetched a token that this
 * reply already carries.
 */

/** Appended when the configured endpoint names a host but no path. */
const DEFAULT_SSO_PATH = "/auth/bzbs_login";

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

  for (const value of extraSecrets) {
    if (!value) continue;
    output = output.split(value).join("***");
  }

  return output;
}

/**
 * The URL to post a login to, from whatever `BUZZEBEES_SSO_LOGIN_PATH` holds.
 *
 * Three forms are accepted, because all three are natural things to put there:
 * a path, joined onto the single sign-on base URL; a whole URL including the
 * path, used as given; and a bare host, which is a base to send the login to
 * rather than the endpoint itself, so the default path is appended instead of
 * posting to the root.
 */
function loginUrl(configured: string): string {
  if (!/^https?:\/\//i.test(configured)) {
    return `${ssoBaseUrl()}${configured}`;
  }

  const url = new URL(configured);
  if (url.pathname === "" || url.pathname === "/") {
    url.pathname = DEFAULT_SSO_PATH;
  }

  return url.toString();
}

export type LoginReply = {
  /** The CRM Plus token. */
  token: string;
  /** The full decoded response, so no field is lost to an incomplete model. */
  raw: Record<string, unknown>;
};

const TOKEN_KEYS = ["token", "Token", "access_token", "accessToken"] as const;

/** Where the reply carries the wallet token, which lookups are made with. */
const WALLET_TOKEN_KEYS = [
  "ewallet_token",
  "ewalletToken",
  "eWalletToken",
  "EwalletToken",
] as const;

/** Keys the reply might carry the operator's agency under. */
const AGENCY_KEYS = [
  "agencyId",
  "AgencyId",
  "AgencyID",
  "agency_id",
  "agencyid",
] as const;

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

function firstStringUnder(
  payload: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function extractToken(payload: Record<string, unknown>): string | null {
  return firstStringUnder(payload, TOKEN_KEYS);
}

function extractWalletToken(payload: Record<string, unknown>): string | null {
  return firstStringUnder(payload, WALLET_TOKEN_KEYS);
}

function extractName(payload: Record<string, unknown>): string | null {
  return firstStringUnder(payload, NAME_KEYS);
}

/**
 * The agency the operator belongs to.
 *
 * Looked for at the top level and one level down, since login replies often
 * nest the account under `data` or `user`.
 */
function extractAgencyId(payload: Record<string, unknown>): string | null {
  const top = firstStringUnder(payload, AGENCY_KEYS);
  if (top) return top;

  for (const nested of Object.values(payload)) {
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const found = firstStringUnder(nested as Record<string, unknown>, AGENCY_KEYS);
      if (found) return found;
    }
  }

  return null;
}

/**
 * The fields single sign-on expects beyond the credentials.
 *
 * Constant per request: the back office sends the literal string "null" for
 * the device details a browser has none of, rather than omitting them.
 */
function ssoFields(): Record<string, string> {
  return {
    contact_number: "null",
    uuid: "null",
    app_id: appId(),
    os: "web",
    info: JSON.stringify({ service: "crmplus" }),
    platform: "web",
    mac_address: "null",
    device_noti_enable: "false",
    client_version: "null",
    device_token: "null",
  };
}

/** An operator who has just proved their identity to Buzzebees. */
export type OperatorIdentity = {
  username: string;
  /** Display name from the reply, falling back to the username. */
  name: string;
  /** The wallet token from `ewallet_token`, which lookups are made with. */
  token: string;
  /** The single sign-on token, which the CRM Plus endpoints accept. */
  ssoToken: string;
  /** The agency the login placed them in, where it says so. */
  agencyId: string | null;
};

/**
 * Verifies an operator's credentials.
 *
 * Returns their identity when the service accepts them, or `null` when it
 * rejects them. There is no local user list: whoever the API vouches for can
 * sign in. Credentials the service rejects come back as `null`; anything else
 * throws, so a misconfigured deploy is loud instead of looking like a
 * typed-wrong password.
 */
export async function operatorLogin(
  username: string,
  password: string,
): Promise<OperatorIdentity | null> {
  const fields = { username, password, ...ssoFields() };
  const url = loginUrl(ssoLoginPath());
  const secrets = [password];

  const form = new FormData();
  for (const [field, value] of Object.entries(fields)) form.append(field, value);

  logCurl(
    `POST ${url}`,
    { method: "POST", url, headers: { "app-id": appId() }, form: fields },
    secrets,
  );

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
      `Could not reach the Buzzebees login endpoint ${url}.`,
      { cause, secrets },
    );
  }

  const text = await response.text();

  // Only an explicit auth rejection counts as "wrong credentials". A 400 is
  // deliberately not in this set: it usually means a malformed request, and
  // reporting that as a bad password would hide the real fault.
  if (response.status === 401 || response.status === 403) return null;

  if (!response.ok) {
    throw new BuzzebeesAuthError(
      `Login to ${url} failed with HTTP ${response.status}.`,
      { status: response.status, body: text, secrets },
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new BuzzebeesAuthError(`Login to ${url} returned a non-JSON body.`, {
      status: response.status,
      body: text,
      secrets,
    });
  }

  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new BuzzebeesAuthError(
      `Login to ${url} returned an unexpected JSON shape.`,
      { status: response.status, body: text, secrets },
    );
  }

  const raw = payload as Record<string, unknown>;
  const token = extractToken(raw);

  if (!token) {
    throw new BuzzebeesAuthError(
      `Login to ${url} succeeded but no token field was found (keys: ${Object.keys(raw).join(", ") || "none"}).`,
      { status: response.status, body: text, secrets },
    );
  }

  return {
    username,
    name: extractName(raw) ?? username,
    // The wallet token rides in the same reply. Its absence is left empty
    // rather than guessed at: a lookup will say so plainly.
    token: extractWalletToken(raw) ?? "",
    ssoToken: token,
    agencyId: extractAgencyId(raw),
  };
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

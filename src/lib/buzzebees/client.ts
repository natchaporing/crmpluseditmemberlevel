import "server-only";

import { authorizationHeader } from "@/lib/buzzebees/auth";
import { logCurl } from "@/lib/buzzebees/curl-log";

/** Error bodies are echoed for debugging, but only a bounded prefix. */
const MAX_BODY_SNIPPET = 500;

export class BuzzebeesApiError extends Error {
  /** HTTP status, or 0 when the request never completed. */
  readonly status: number;
  /** Truncated response body, for diagnostics. */
  readonly body: string;

  constructor(
    message: string,
    options: { status?: number; body?: string; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "BuzzebeesApiError";
    this.status = options.status ?? 0;
    this.body = (options.body ?? "").slice(0, MAX_BODY_SNIPPET);
  }
}

export type BuzzebeesResponse = {
  status: number;
  /** Decoded JSON body, or null when the response had no body. */
  json: unknown;
  /** The body as text, for error reporting. */
  text: string;
};

/**
 * Calls a Buzzebees endpoint with an operator's token attached.
 *
 * The token comes from the caller — it is the one that operator received when
 * they signed in. There is nothing to refresh on a 401, since minting a new
 * token would need their password, so a rejected token surfaces as an error
 * and the operator signs in again.
 *
 * Any header the endpoint wants beyond `Authorization` is the caller's to
 * supply: `/pos/profile` takes only the token, while the CRM Plus endpoints
 * also expect `app-id`. Non-2xx responses other than 404 raise
 * `BuzzebeesApiError`; the caller decides what a 404 means.
 */
export async function buzzebeesFetch(
  url: string,
  init: RequestInit = {},
  token?: string,
): Promise<BuzzebeesResponse> {
  const response = await send(url, init, token);

  const text = await response.text();

  if (!response.ok && response.status !== 404) {
    throw new BuzzebeesApiError(
      `Buzzebees request failed with HTTP ${response.status}.`,
      { status: response.status, body: text },
    );
  }

  let json: unknown = null;
  if (text.trim()) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new BuzzebeesApiError("Buzzebees returned a non-JSON body.", {
        status: response.status,
        body: text,
      });
    }
  }

  return { status: response.status, json, text };
}

async function send(
  url: string,
  init: RequestInit,
  token: string | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = authorizationHeader(token);

  // A multipart body is logged as -F fields; anything else as --data.
  const form =
    init.body instanceof FormData
      ? Object.fromEntries(
          Array.from(init.body.entries(), ([name, value]) => [
            name,
            typeof value === "string" ? value : "<binary>",
          ]),
        )
      : undefined;

  logCurl(
    `${init.method ?? "GET"} ${url}`,
    {
      method: init.method ?? "GET",
      url,
      headers,
      form,
      body: typeof init.body === "string" ? init.body : undefined,
    },
    token ? [token] : [],
  );

  try {
    return await fetch(url, {
      ...init,
      headers,
      cache: "no-store",
    });
  } catch (cause) {
    throw new BuzzebeesApiError(`Could not reach ${url}.`, { cause });
  }
}

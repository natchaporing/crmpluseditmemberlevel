import "server-only";

import {
  authorizationHeader,
  getMerchantToken,
  invalidateMerchantToken,
} from "@/lib/buzzebees/auth";
import { appId } from "@/lib/buzzebees/config";
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
 * Calls a Buzzebees endpoint with the merchant token attached.
 *
 * A 401 is retried once against a freshly minted token, since the cached one
 * may have expired before its assumed TTL ran out. Non-2xx responses other
 * than that raise `BuzzebeesApiError`; the caller decides what a 404 means.
 */
export async function buzzebeesFetch(
  url: string,
  init: RequestInit = {},
): Promise<BuzzebeesResponse> {
  let response = await send(url, init, await getMerchantToken());

  if (response.status === 401) {
    invalidateMerchantToken();
    response = await send(url, init, await getMerchantToken());
  }

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
  token: string,
): Promise<Response> {
  const headers = {
    // Every Buzzebees endpoint expects the app id, authenticated calls
    // included — not just the login POST.
    "app-id": appId(),
    ...(init.headers as Record<string, string> | undefined),
    Authorization: authorizationHeader(token),
  };

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
    [token],
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

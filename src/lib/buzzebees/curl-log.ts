import "server-only";

/**
 * Echoes outgoing Buzzebees requests to the console as `curl` commands, so a
 * failing call can be replayed by hand against the live service.
 *
 * Off unless `BUZZEBEES_LOG_CURL` is set, and read on every call rather than
 * cached, so the flag takes effect on the next deploy without a code change.
 *
 * Credential values are masked. The point of the log is to confirm the shape
 * of a request — endpoint, method, headers, field names — and that survives
 * masking, whereas a password written to a log outlives the debugging session
 * in whatever collects stdout. Fill the masked fields in by hand before
 * replaying.
 */

export function curlLoggingEnabled(): boolean {
  const raw = process.env.BUZZEBEES_LOG_CURL?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export type CurlRequest = {
  method: string;
  url: string;
  headers?: Record<string, string>;
  /** Sent as `-F` fields, for a multipart body. */
  form?: Record<string, string>;
  /** Sent as `--data`, for anything else. */
  body?: string;
};

/** Header names whose value is a credential, matched case-insensitively. */
const SECRET_HEADERS = ["authorization", "cookie", "set-cookie"];

/** Form field names whose value is a credential. */
const SECRET_FIELDS = ["password", "pwd", "pass", "secret", "token"];

function shellQuote(value: string): string {
  // A single-quoted shell word ends at the first quote, so each one is closed,
  // escaped and reopened.
  return `'${value.split("'").join(`'\\''`)}'`;
}

function isSecretName(name: string, known: readonly string[]): boolean {
  const lower = name.toLowerCase();
  return known.some((candidate) => lower.includes(candidate));
}

/**
 * Builds the `curl` command for a request. Exported for testing; call
 * `logCurl` to actually emit it.
 */
export function buildCurl(
  request: CurlRequest,
  secretValues: readonly string[] = [],
): string {
  const secrets = secretValues.filter(Boolean);

  /** A value is masked by its field name, or by matching a known secret. */
  const mask = (name: string, value: string, known: readonly string[]) =>
    isSecretName(name, known) || secrets.includes(value) ? "***" : value;

  const parts = [
    `curl -X ${request.method.toUpperCase()} ${shellQuote(request.url)}`,
  ];

  for (const [name, value] of Object.entries(request.headers ?? {})) {
    parts.push(`  -H ${shellQuote(`${name}: ${mask(name, value, SECRET_HEADERS)}`)}`);
  }

  for (const [name, value] of Object.entries(request.form ?? {})) {
    parts.push(`  -F ${shellQuote(`${name}=${mask(name, value, SECRET_FIELDS)}`)}`);
  }

  if (request.body !== undefined) {
    const masked = secrets.reduce(
      (acc, secret) => acc.split(secret).join("***"),
      request.body,
    );
    parts.push(`  --data ${shellQuote(masked)}`);
  }

  return parts.join(" \\\n");
}

export function logCurl(
  label: string,
  request: CurlRequest,
  secretValues: readonly string[] = [],
): void {
  if (!curlLoggingEnabled()) return;

  console.info(
    `[buzzebees:curl] ${label} (credentials masked)\n${buildCurl(request, secretValues)}`,
  );
}

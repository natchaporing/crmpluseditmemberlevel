import "server-only";

/**
 * Helpers for reading payloads whose shape is not yet confirmed.
 *
 * The CRM Plus endpoints have not been pinned down field by field, so their
 * readers accept the usual spellings rather than one guessed contract. Shared
 * here so each endpoint does not carry its own copy.
 */

/** Keys a wrapper object might nest its array under. */
export const ARRAY_KEYS = ["levels", "data", "items", "result", "results", "logs"];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The first key holding a non-empty string, trimmed. */
export function firstString(
  row: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    // Timestamps and ids often arrive as numbers where a string is expected.
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

/** The first key holding a finite number, accepting numeric strings. */
export function firstNumber(
  row: Record<string, unknown>,
  keys: readonly string[],
): number | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

/**
 * The array in a payload: the value itself when it is one, otherwise the first
 * array found under a usual wrapper key. Anything else yields an empty array,
 * so an unrecognised payload degrades rather than throws.
 */
export function unwrapArray(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;

  if (isRecord(json)) {
    for (const key of ARRAY_KEYS) {
      const value = json[key];
      if (Array.isArray(value)) return value;
    }
  }

  return [];
}

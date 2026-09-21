import "server-only";

import { buzzebeesFetch } from "@/lib/buzzebees/client";
import { stampWalletBaseUrl } from "@/lib/buzzebees/config";

/**
 * Customer lookup against `GET /pos/profile?contactNumber=...`.
 *
 * The response fields have not been confirmed against the live service yet, so
 * the decoded body is returned untouched rather than mapped onto a guessed
 * shape. Map it onto `Member` once the real payload is known.
 */
export async function fetchPosProfile(
  contactNumber: string,
  token: string,
): Promise<Record<string, unknown> | null> {
  const url = new URL("/pos/profile", stampWalletBaseUrl());
  url.searchParams.set("contactNumber", contactNumber);

  // Only the token: this endpoint does not take an app-id header.
  const { status, json } = await buzzebeesFetch(
    url.toString(),
    { method: "GET" },
    token,
  );

  // 404, an empty body, or an empty array all mean "no such customer".
  if (status === 404 || json === null) return null;
  if (Array.isArray(json)) {
    const first = json[0];
    return isRecord(first) ? first : null;
  }
  if (!isRecord(json)) return null;

  return json;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

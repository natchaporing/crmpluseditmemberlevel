import "server-only";

import { buzzebeesFetch } from "@/lib/buzzebees/client";
import { agencyId, appId, crmPlusBaseUrl } from "@/lib/buzzebees/config";
import {
  firstNumber,
  firstString,
  isRecord,
  unwrapArray,
} from "@/lib/buzzebees/payload";

/**
 * The member levels available to an agency, from
 * `GET /crmplusoffice/profile?device_app_id=…&agencyId=…`.
 *
 * `src/lib/members/levels.ts` holds the same list as a hard-coded constant.
 * That list is what the UI still renders; this is the live source it should be
 * replaced by once the response shape is confirmed against the service.
 */

const PROFILE_PATH = "/crmplusoffice/profile";

export type CrmPlusLevel = {
  /** The value `levelName` takes when updating a profile, e.g. `Plus2_69`. */
  name: string;
  /** Numeric id where the service supplies one. */
  id: number | null;
};

/** Keys the level name might arrive under. */
const NAME_KEYS = ["levelName", "level_name", "name", "code", "levelCode"];

/** Keys the numeric id might arrive under. */
const ID_KEYS = ["levelId", "level_id", "id"];

/**
 * Pulls the level list out of a response whose shape is not yet confirmed.
 *
 * Deliberately tolerant: a bare array, or one nested under any of the usual
 * wrapper keys, and the name and id read under their usual spellings. An
 * unrecognised payload yields an empty list rather than throwing — the caller
 * still has `raw` to fall back on.
 */
export function extractLevels(json: unknown): CrmPlusLevel[] {
  const levels: CrmPlusLevel[] = [];

  for (const row of unwrapArray(json)) {
    // A plain array of strings is a valid shape too.
    if (typeof row === "string" && row.trim()) {
      levels.push({ name: row.trim(), id: null });
      continue;
    }
    if (!isRecord(row)) continue;

    const name = firstString(row, NAME_KEYS);
    if (!name) continue;

    levels.push({ name, id: firstNumber(row, ID_KEYS) });
  }

  return levels;
}

/**
 * Fetches the agency's levels.
 *
 * `raw` is returned alongside the parsed list so an unrecognised payload can
 * be inspected rather than guessed at.
 */
export async function fetchUserLevels(
  token: string,
  agency: string = agencyId(),
): Promise<{ levels: CrmPlusLevel[]; raw: unknown }> {
  const url = new URL(PROFILE_PATH, crmPlusBaseUrl());
  // Sent as a query parameter here, unlike the update endpoint which takes it
  // as a form field.
  url.searchParams.set("device_app_id", appId());
  url.searchParams.set("agencyId", agency);

  const { json } = await buzzebeesFetch(
    url.toString(),
    { method: "GET", headers: { "app-id": appId() } },
    token,
  );

  return { levels: extractLevels(json), raw: json };
}

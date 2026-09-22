import "server-only";

import { buzzebeesFetch } from "@/lib/buzzebees/client";
import { agencyId, appId, crmPlusModuleBaseUrl } from "@/lib/buzzebees/config";
import { firstNumber, firstString, isRecord, unwrapArray } from "@/lib/buzzebees/payload";

/**
 * The member levels an agency offers, from
 * `GET /crmpluslevel/list?agencyId=…&mode=point`.
 *
 * `src/lib/members/levels.ts` holds the same list as a hard-coded constant,
 * which stands in when this returns nothing recognisable — an empty level
 * picker would leave an operator unable to do the one thing the app is for.
 */

const LIST_PATH = "/crmpluslevel/list";

/**
 * Which set of levels to list. The back office asks for the point-based ones;
 * no other mode has been seen, so it is fixed rather than configurable.
 */
const LEVEL_MODE = "point";

export type CrmPlusLevel = {
  /** The value `levelName` takes when updating a profile, e.g. `Plus2_69`. */
  name: string;
  /** Numeric id where the service supplies one. */
  id: number | null;
};

/** Keys the level name might arrive under. */
const NAME_KEYS = ["levelName", "level_name", "name", "code", "levelCode"];

/** Keys the numeric id might arrive under. */
const ID_KEYS = ["levelId", "level_id", "id", "level"];

/**
 * Pulls the level list out of a response whose shape is not yet confirmed.
 *
 * Deliberately tolerant: a bare array, or one nested under any of the usual
 * wrapper keys, with the name and id read under their usual spellings. An
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
  const url = new URL(LIST_PATH, crmPlusModuleBaseUrl());
  url.searchParams.set("agencyId", agency);
  url.searchParams.set("mode", LEVEL_MODE);

  const { json } = await buzzebeesFetch(
    url.toString(),
    { method: "GET", headers: { "app-id": appId() } },
    token,
  );

  return { levels: extractLevels(json), raw: json };
}

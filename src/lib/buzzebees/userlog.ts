import "server-only";

import { buzzebeesFetch } from "@/lib/buzzebees/client";
import { agencyId, appId, crmPlusBaseUrl } from "@/lib/buzzebees/config";
import { firstString, isRecord, unwrapArray } from "@/lib/buzzebees/payload";

/**
 * A member's change log, from
 * `GET /crmplusoffice/userlog?device_app_id=…&agencyId=…&userId=…`.
 *
 * `userId` takes either the CRM's own id (`BPAXX68_…`) or a contact number —
 * the service resolves both — which is why the parameter here is named for
 * what it accepts rather than for the key it is sent under.
 *
 * `src/lib/members/service.ts` keeps its own in-memory history; this is the
 * CRM's version of the same thing, and the source the history panel should
 * read once the response shape is confirmed.
 */

const USERLOG_PATH = "/crmplusoffice/userlog";

const AT_KEYS = [
  "createDate",
  "created_date",
  "createdAt",
  "updateDate",
  "updated_date",
  "updatedAt",
  "logDate",
  "timestamp",
  "date",
];

const BY_KEYS = [
  "createBy",
  "created_by",
  "updateBy",
  "updated_by",
  "operatorName",
  "operator",
  "adminName",
  "userName",
  "by",
];

const FROM_KEYS = [
  "oldLevelName",
  "old_level_name",
  "fromLevelName",
  "previousLevelName",
  "oldLevel",
  "from",
];

const TO_KEYS = [
  "newLevelName",
  "new_level_name",
  "toLevelName",
  "levelName",
  "newLevel",
  "to",
];

export type CrmPlusUserLogEntry = {
  /** Timestamp exactly as the service gave it — format unconfirmed. */
  at: string | null;
  /** Who made the change. */
  by: string | null;
  /** Level before the change. */
  from: string | null;
  /** Level after the change. */
  to: string | null;
  /**
   * The untouched row. Kept per entry because the field names above are
   * guesses: whatever the readers miss is still here to be read.
   */
  raw: Record<string, unknown>;
};

/**
 * Reads log entries out of a response whose shape is not yet confirmed.
 *
 * A row that yields nothing recognisable is still returned, carrying only its
 * `raw`, so a shape mismatch shows up as empty columns rather than a silently
 * shorter list.
 */
export function extractUserLog(json: unknown): CrmPlusUserLogEntry[] {
  const entries: CrmPlusUserLogEntry[] = [];

  for (const row of unwrapArray(json)) {
    if (!isRecord(row)) continue;

    entries.push({
      at: firstString(row, AT_KEYS),
      by: firstString(row, BY_KEYS),
      from: firstString(row, FROM_KEYS),
      to: firstString(row, TO_KEYS),
      raw: row,
    });
  }

  return entries;
}

/**
 * Fetches a member's change log.
 *
 * @param user The CRM user id or the member's contact number.
 */
export async function fetchUserLog(
  user: string,
  agency: string = agencyId(),
): Promise<{ entries: CrmPlusUserLogEntry[]; raw: unknown }> {
  const url = new URL(USERLOG_PATH, crmPlusBaseUrl());
  url.searchParams.set("device_app_id", appId());
  url.searchParams.set("agencyId", agency);
  url.searchParams.set("userId", user);

  const { json } = await buzzebeesFetch(url.toString(), { method: "GET" });

  return { entries: extractUserLog(json), raw: json };
}

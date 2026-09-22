import "server-only";

import { buzzebeesFetch } from "@/lib/buzzebees/client";
import { agencyId, appId, crmPlusBaseUrl } from "@/lib/buzzebees/config";

/**
 * Member level changes against `POST /crmplusoffice/user`.
 *
 * **The endpoint replaces the whole record.** A field left out of the request
 * comes back null, which was established the hard way: a request carrying only
 * the level, point and active flag returned 200 and blanked the customer's
 * name, contact number, email, birth date and gender. A 200 here means the
 * request was accepted, not that it was harmless.
 *
 * So every field that must survive is sent, read from the profile rather than
 * invented. The consents are the exception: they are not accepted as
 * parameters and the service preserves them by itself, which is the safer
 * outcome — a level change cannot alter what somebody agreed to.
 */

const UPDATE_PATH = "/crmplusoffice/user";

/**
 * The fields the endpoint requires, plus every field that would otherwise be
 * lost. `point` and `active` are required outright — omitting either is a 400.
 */
export type MemberRecord = {
  userId: string;
  levelName: string;
  point: string;
  active: string;
  firstName: string;
  lastName: string;
  contactNumber: string;
  email: string;
  gender: string;
  /**
   * Unix seconds. The service rewrites this on write — a value went in as
   * 1994-12-01T00:00:00Z and came back 21 hours later — but omitting it clears
   * the date entirely, so it is sent and the shift accepted as the lesser harm.
   */
  birthDate: string;
  referenceInfo: string;
  referenceInfo2: string;
};

const FIELDS = [
  "userId",
  "levelName",
  "point",
  "active",
  "firstName",
  "lastName",
  "contactNumber",
  "email",
  "gender",
  "birthDate",
  "referenceInfo",
  "referenceInfo2",
] as const satisfies readonly (keyof MemberRecord)[];

export class IncompleteRecordError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(
      `Refusing to change the level: ${missing.join(", ")} missing from the profile. The endpoint replaces the whole record, so sending it without them would blank them on the customer.`,
    );
    this.name = "IncompleteRecordError";
    this.missing = missing;
  }
}

/** The same record with a different level, so the call site reads plainly. */
export function withLevelName(
  current: MemberRecord,
  levelName: string,
): MemberRecord {
  return { ...current, levelName };
}

/**
 * Sends a member's record back with its new level.
 *
 * An empty string is a legitimate value — `email` and the reference fields
 * often are — so only a missing or non-string field is rejected. That check is
 * what stands between a half-built object and a blanked customer record.
 */
export async function updateMemberRecord(
  record: MemberRecord,
  token: string,
  agency?: string,
): Promise<unknown> {
  const missing = FIELDS.filter((field) => typeof record[field] !== "string");
  if (missing.length > 0) throw new IncompleteRecordError(missing);
  if (!record.userId.trim()) throw new IncompleteRecordError(["userId"]);

  const form = new FormData();
  // The app id travels twice: as the header every call carries, and as a
  // field this endpoint expects under its own name.
  form.append("device_app_id", appId());
  form.append("agencyId", agency?.trim() || agencyId());
  for (const field of FIELDS) form.append(field, record[field]);

  const { json } = await buzzebeesFetch(
    `${crmPlusBaseUrl()}${UPDATE_PATH}`,
    {
      method: "POST",
      // Content-Type is omitted on purpose: fetch derives it from the FormData
      // body along with the multipart boundary.
      headers: { "app-id": appId() },
      body: form,
    },
    token,
  );

  return json;
}

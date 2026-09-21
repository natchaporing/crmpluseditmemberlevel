import "server-only";

import { buzzebeesFetch } from "@/lib/buzzebees/client";
import { appId, crmPlusBaseUrl } from "@/lib/buzzebees/config";

/**
 * Profile updates against `POST /crmplusoffice/user`.
 *
 * The endpoint replaces the whole record rather than patching it: every field
 * is sent on every call, and one left out comes back blank on the customer.
 * Changing a level therefore means reading the current profile, swapping
 * `levelName`, and sending all of it back — which is why this module takes a
 * complete `CrmPlusUser` and offers no partial update.
 */

const UPDATE_PATH = "/crmplusoffice/user";

/**
 * Every field the endpoint expects, as multipart strings.
 *
 * Deliberately all `string`: the service takes numbers and booleans in their
 * text form (`point: "0"`, `active: "true"`, `birthDate` as a unix seconds
 * string), and converting here would invite a silent format change.
 */
export type CrmPlusUser = {
  agencyId: string;
  userId: string;
  firstName: string;
  lastName: string;
  /** Unix seconds, as a string. */
  birthDate: string;
  contactNumber: string;
  email: string;
  point: string;
  gender: string;
  referenceInfo: string;
  referenceInfo2: string;
  termAndCondition: string;
  dataPrivacy: string;
  lineMarketing: string;
  smsMarketing: string;
  emailMarketing: string;
  active: string;
  /** The member level, e.g. `Plus2_69`. Matches `MEMBER_LEVELS[].code`. */
  levelName: string;
};

/** Field order follows the documented request, to keep the two comparable. */
const USER_FIELDS = [
  "agencyId",
  "userId",
  "firstName",
  "lastName",
  "birthDate",
  "contactNumber",
  "email",
  "point",
  "gender",
  "referenceInfo",
  "referenceInfo2",
  "termAndCondition",
  "dataPrivacy",
  "lineMarketing",
  "smsMarketing",
  "emailMarketing",
  "active",
  "levelName",
] as const satisfies readonly (keyof CrmPlusUser)[];

export class IncompleteProfileError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(
      `Refusing to update the profile: ${missing.join(", ")} missing. The endpoint replaces the whole record, so a missing field would blank it on the customer.`,
    );
    this.name = "IncompleteProfileError";
    this.missing = missing;
  }
}

/**
 * Returns the same profile with a different level.
 *
 * Going through this rather than editing `levelName` in place keeps the
 * "everything else is unchanged" guarantee visible at the call site.
 */
export function withLevelName(
  current: CrmPlusUser,
  levelName: string,
): CrmPlusUser {
  return { ...current, levelName };
}

/**
 * Sends a complete profile back to the CRM.
 *
 * An empty string is a legitimate value — `email` frequently is one — so only
 * a missing or non-string field is rejected. That check is the guard against
 * wiping data with a half-built object.
 */
export async function updateCrmPlusUser(
  user: CrmPlusUser,
  token: string,
): Promise<unknown> {
  const missing = USER_FIELDS.filter(
    (field) => typeof user[field] !== "string",
  );
  if (missing.length > 0) throw new IncompleteProfileError(missing);

  const form = new FormData();
  // The app id travels twice: as the header every call carries, and as a
  // field this endpoint expects under its own name.
  form.append("device_app_id", appId());
  for (const field of USER_FIELDS) form.append(field, user[field]);

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

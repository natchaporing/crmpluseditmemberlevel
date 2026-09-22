import "server-only";

import { buzzebeesFetch } from "@/lib/buzzebees/client";
import { agencyId, appId, crmPlusBaseUrl } from "@/lib/buzzebees/config";

/**
 * Member level changes against `POST /crmplusoffice/user`.
 *
 * Only the level is sent, alongside the fields that identify whose level it
 * is. The back office's own request carries the whole profile — every name,
 * address and consent field — but repeating that here would mean deciding what
 * a customer's marketing consents are on their behalf, from a profile payload
 * that encodes them differently. Sending only the level leaves every other
 * field to the service.
 */

const UPDATE_PATH = "/crmplusoffice/user";

export type LevelUpdate = {
  /** The customer whose level is changing. */
  userId: string;
  /** The new level, e.g. `Plus2_69`. Matches `MEMBER_LEVELS[].code`. */
  levelName: string;
  /** Defaults to the agency from the operator's login. */
  agency?: string;
};

export class MissingMemberIdError extends Error {
  constructor() {
    super(
      "Refusing to change the level: the profile carries no user id, so there is nothing to identify the customer by.",
    );
    this.name = "MissingMemberIdError";
  }
}

/**
 * Sends a member's new level.
 *
 * The user id is required rather than defaulted: without it the request would
 * name no customer, and what the service would do with that is not worth
 * finding out on live data.
 */
export async function updateMemberLevel(
  update: LevelUpdate,
  token: string,
): Promise<unknown> {
  if (!update.userId.trim()) throw new MissingMemberIdError();

  const form = new FormData();
  // The app id travels twice: as the header every call carries, and as a
  // field this endpoint expects under its own name.
  form.append("device_app_id", appId());
  form.append("agencyId", update.agency?.trim() || agencyId());
  form.append("userId", update.userId);
  form.append("levelName", update.levelName);

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

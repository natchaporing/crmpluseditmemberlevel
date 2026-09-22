import { getSession } from "@/lib/auth/dal";
import { appId, crmPlusBaseUrl } from "@/lib/buzzebees/config";
import { findMemberByPhone } from "@/lib/members/service";

/**
 * TEMPORARY. Finds the smallest set of fields
 * `POST /crmplusoffice/user` accepts.
 *
 *   GET /api/health/token-probe?contactNumber=0901614282
 *
 * The endpoint names one missing parameter at a time, so guessing the whole
 * set costs a deploy per guess. This sends progressively larger sets in one
 * request and reports each result, which finds the boundary in one go.
 *
 * Every attempt sends the member's *current* values — the level they already
 * have, the consents the profile reports — so a request that succeeds changes
 * nothing. Consents are echoed exactly as the profile gives them rather than
 * converted to "Accepted", since guessing that mapping could opt someone into
 * marketing they refused.
 *
 * Requires a session and uses the tokens it already holds. Delete once the
 * accepted set is known.
 */

function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "sign in first" }, { status: 401 });

  const contactNumber = new URL(request.url).searchParams.get("contactNumber") ?? "";
  if (!contactNumber) {
    return Response.json({ error: "contactNumber required" }, { status: 400 });
  }
  if (!session.ssoToken) {
    return Response.json({ error: "no sso token — sign out and in again" }, { status: 400 });
  }

  const member = await findMemberByPhone(contactNumber, session.token);
  if (!member) return Response.json({ error: "member not found" }, { status: 404 });

  const raw = member.raw;
  const ext = (raw.ExtensionJsonProperty ?? {}) as Record<string, unknown>;
  const points = (raw.updated_points ?? {}) as Record<string, unknown>;

  const identity = {
    device_app_id: appId(),
    agencyId: session.agencyId || "",
    userId: member.userId,
    levelName: member.levelCode,
  };
  const withPoint = { ...identity, point: str(points.points ?? raw.Point ?? 0) };
  // Both of the errors so far named a field outright — point, then active —
  // so try exactly those before sending anything the service might rewrite.
  const withActive = { ...withPoint, active: str(raw.Active ?? true) };
  const withRefs = {
    ...withActive,
    referenceInfo: str(ext.reference_info),
    referenceInfo2: str(ext.reference_info2),
  };
  const withNames = {
    ...withRefs,
    firstName: str(raw.FirstName),
    lastName: str(raw.LastName),
    contactNumber: str(raw.Contact_Number),
    email: str(raw.Email),
    gender: str(raw.Gender),
  };
  // Last, and only if the service insists: sending this shifted a birth date
  // by 21 hours once already, so it is the field to avoid if it is optional.
  const withBirthDate = { ...withNames, birthDate: str(raw.BirthDate) };
  // Consents exactly as the profile reports them — not converted to "Accepted".
  const withConsents = {
    ...withBirthDate,
    termAndCondition: str(raw.TermAndCondition),
    dataPrivacy: str(raw.DataPrivacy),
    lineMarketing: str(raw.LineMarketing),
    smsMarketing: str(raw.SMSMarketing),
    emailMarketing: str(raw.EmailMarketing),
  };

  async function attempt(label: string, fields: Record<string, string>) {
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) form.append(name, value);

    try {
      const response = await fetch(`${crmPlusBaseUrl()}/crmplusoffice/user`, {
        method: "POST",
        headers: { "app-id": appId(), Authorization: `token ${session!.ssoToken}` },
        body: form,
        cache: "no-store",
      });

      return {
        label,
        fields: Object.keys(fields),
        status: response.status,
        ok: response.ok,
        body: (await response.text()).slice(0, 300),
      };
    } catch (error) {
      return { label, error: error instanceof Error ? error.message : String(error) };
    }
  }

  const attempts = [];
  for (const [label, fields] of [
    ["A identity + level", identity],
    ["B + point", withPoint],
    ["C + active", withActive],
    ["D + referenceInfo", withRefs],
    ["E + names/contact/email/gender", withNames],
    ["F + birthDate (rewrites it — avoid if optional)", withBirthDate],
    ["G + consents (as the profile reports them)", withConsents],
  ] as const) {
    const result = await attempt(label, fields);
    attempts.push(result);
    // Stop at the first set the endpoint accepts: anything larger is noise.
    if ("ok" in result && result.ok) break;
  }

  return Response.json({
    member: { userId: member.userId, levelCode: member.levelCode },
    agencyId: session.agencyId,
    profileConsents: {
      TermAndCondition: raw.TermAndCondition,
      DataPrivacy: raw.DataPrivacy,
      EmailMarketing: raw.EmailMarketing,
      SMSMarketing: raw.SMSMarketing,
      LineMarketing: raw.LineMarketing,
    },
    attempts,
  });
}

import { getSession } from "@/lib/auth/dal";
import { appId, crmPlusBaseUrl } from "@/lib/buzzebees/config";

/**
 * TEMPORARY. Puts back the fields a six-field update blanked.
 *
 *   GET /api/health/restore?confirm=yes
 *
 * `POST /crmplusoffice/user` replaces the whole record: a field left out of
 * the request comes back null. A probe sent only the level, point and active
 * flag, which wiped this customer's name, contact number, email, birth date,
 * gender and reference fields.
 *
 * The values below are from the `/pos/profile` payload captured before that
 * happened, so this restores the record as it was. Fixed rather than read from
 * the CRM, because the CRM no longer holds them — and the contact number they
 * would be looked up by is one of the fields that was lost.
 *
 * Delete once the record is verified.
 */

/** As `/pos/profile` reported it before the record was damaged. */
const ORIGINAL = {
  userId: "BPAXX68_1789755149139",
  levelName: "Member",
  point: "0",
  active: "true",
  firstName: "Patipan",
  lastName: "Kitti",
  contactNumber: "0901614282",
  email: "",
  gender: "male",
  // 1994-12-01T00:00:00Z. The service shifted this by 21 hours on a previous
  // write, so check it afterwards: it may land on 786315600.
  birthDate: "786240000",
  referenceInfo: "",
  referenceInfo2: "",
} as const;

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "sign in first" }, { status: 401 });
  if (!session.ssoToken) {
    return Response.json({ error: "no sso token — sign out and in again" }, { status: 400 });
  }

  // This writes to a live record, so it does not happen by opening a link.
  if (new URL(request.url).searchParams.get("confirm") !== "yes") {
    return Response.json({
      willSend: { device_app_id: appId(), agencyId: session.agencyId, ...ORIGINAL },
      note: "add ?confirm=yes to send this",
    });
  }

  const form = new FormData();
  form.append("device_app_id", appId());
  form.append("agencyId", session.agencyId || "");
  for (const [name, value] of Object.entries(ORIGINAL)) form.append(name, value);

  try {
    const response = await fetch(`${crmPlusBaseUrl()}/crmplusoffice/user`, {
      method: "POST",
      headers: { "app-id": appId(), Authorization: `token ${session.ssoToken}` },
      body: form,
      cache: "no-store",
    });

    return Response.json({
      status: response.status,
      ok: response.ok,
      body: (await response.text()).slice(0, 800),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}

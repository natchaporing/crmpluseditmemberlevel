import { getSession } from "@/lib/auth/dal";
import { appId, crmPlusBaseUrl } from "@/lib/buzzebees/config";
import { findMemberByPhone } from "@/lib/members/service";

/**
 * TEMPORARY. Answers one question: which token does
 * `POST /crmplusoffice/user` accept?
 *
 *   GET /api/health/token-probe?contactNumber=0901614282
 *
 * Sends the member's *current* level with each token in turn, so a request
 * that succeeds changes nothing. Reports the status and body of each rather
 * than throwing, because the failures are the point.
 *
 * Requires a session: it uses the tokens the signed-in operator already holds,
 * so no credentials are passed around. Delete once the answer is known.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "sign in first" }, { status: 401 });
  }

  const contactNumber =
    new URL(request.url).searchParams.get("contactNumber") ?? "";
  if (!contactNumber) {
    return Response.json({ error: "contactNumber required" }, { status: 400 });
  }

  const member = await findMemberByPhone(contactNumber, session.token);
  if (!member) {
    return Response.json({ error: "member not found" }, { status: 404 });
  }

  async function attempt(label: string, token: string) {
    if (!token) return { label, skipped: "no token in session" };

    const form = new FormData();
    form.append("device_app_id", appId());
    form.append("agencyId", session!.agencyId || "");
    form.append("userId", member!.userId);
    // The level they already have: a request that goes through is a no-op.
    form.append("levelName", member!.levelCode);

    try {
      const response = await fetch(`${crmPlusBaseUrl()}/crmplusoffice/user`, {
        method: "POST",
        headers: { "app-id": appId(), Authorization: `token ${token}` },
        body: form,
        cache: "no-store",
      });

      return {
        label,
        status: response.status,
        ok: response.ok,
        body: (await response.text()).slice(0, 400),
      };
    } catch (error) {
      return {
        label,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return Response.json({
    member: {
      userId: member.userId,
      levelCode: member.levelCode,
      contactNumber: member.contactNumber,
    },
    agencyId: session.agencyId || "(empty — falls back to config)",
    sentLevelName: member.levelCode,
    attempts: [
      await attempt("wallet token (/merchant/login)", session.token),
      await attempt("sso token (/auth/bzbs_login)", session.ssoToken),
    ],
  });
}

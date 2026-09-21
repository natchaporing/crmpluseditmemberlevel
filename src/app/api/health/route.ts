import {
  missingBuzzebeesVars,
  missingLoginVars,
} from "@/lib/buzzebees/config";

/**
 * Deployment health check.
 *
 * Reports whether the runtime configuration is complete. It names which
 * variables are missing but never their values, and is intentionally
 * unauthenticated so a platform probe can reach it before anyone signs in.
 *
 * Returning 503 on a misconfigured deploy is the point: a probe that only
 * checked that the process was listening would mark a broken release healthy,
 * because the login page renders fine right up until someone tries to log in.
 *
 * Only `SESSION_SECRET` fails the probe. The Buzzebees variables are reported
 * instead, so that a deploy missing them still comes up and can say so through
 * this endpoint rather than crash-looping — but note that operators sign in
 * against the Buzzebees API, so **nobody can log in while `login.ready` is
 * false**. Watch that field, not just the status code.
 *
 * No credential is named here, because none is configured: operators sign in
 * with their own and the token they receive carries their later calls.
 */
export async function GET() {
  const missing: string[] = [];

  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) missing.push("SESSION_SECRET");

  const loginMissing = missingLoginVars();
  const buzzebeesMissing = missingBuzzebeesVars();

  const body = {
    ok: missing.length === 0,
    missing,
    login: {
      ready: loginMissing.length === 0,
      missing: loginMissing,
    },
    buzzebees: {
      configured: buzzebeesMissing.length === 0,
      missing: buzzebeesMissing,
    },
  };

  return Response.json(body, { status: missing.length > 0 ? 503 : 200 });
}

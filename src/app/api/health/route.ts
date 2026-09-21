import { missingBuzzebeesVars } from "@/lib/buzzebees/config";

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
 * The Buzzebees variables are reported but do not fail the probe — the UI
 * still reads the placeholder member store, so the app is usable without
 * them. Fold them into `missing` once the UI calls the live API.
 */
export async function GET() {
  const missing: string[] = [];

  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) missing.push("SESSION_SECRET");

  if (!process.env.AUTH_USERS?.trim()) missing.push("AUTH_USERS");

  const buzzebeesMissing = missingBuzzebeesVars();
  const body = {
    ok: missing.length === 0,
    missing,
    buzzebees: {
      configured: buzzebeesMissing.length === 0,
      missing: buzzebeesMissing,
    },
  };

  return Response.json(body, { status: missing.length > 0 ? 503 : 200 });
}

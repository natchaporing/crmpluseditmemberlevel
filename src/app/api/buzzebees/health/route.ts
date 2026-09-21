import { getSession } from "@/lib/auth/dal";
import { BuzzebeesAuthError, merchantLogin } from "@/lib/buzzebees/auth";
import { BuzzebeesApiError } from "@/lib/buzzebees/client";
import { fetchPosProfile } from "@/lib/buzzebees/profile";

/**
 * Diagnostic for the Buzzebees integration.
 *
 *   GET /api/buzzebees/health
 *     Performs a real merchant login. The token is never returned — only its
 *     length and the keys the service sent back.
 *
 *   GET /api/buzzebees/health?contactNumber=0901614282
 *     Also looks the customer up via /pos/profile and returns the payload, so
 *     the real field names can be mapped onto `Member`.
 *
 * Bypasses the token cache so each call exercises the live endpoint, and
 * requires an app login so it is not an unauthenticated probe.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const contactNumber = new URL(request.url).searchParams.get("contactNumber");

  try {
    const { token, raw } = await merchantLogin();

    const login = {
      ok: true,
      tokenLength: token.length,
      responseKeys: Object.keys(raw).sort(),
    };

    if (!contactNumber) return Response.json({ login });

    const profile = await fetchPosProfile(contactNumber);

    return Response.json({
      login,
      profile: {
        found: profile !== null,
        keys: profile ? Object.keys(profile).sort() : [],
        payload: profile,
      },
    });
  } catch (error) {
    if (error instanceof BuzzebeesAuthError || error instanceof BuzzebeesApiError) {
      return Response.json(
        {
          ok: false,
          source: error.name,
          message: error.message,
          status: error.status,
          body: error.body,
        },
        { status: 502 },
      );
    }

    throw error;
  }
}

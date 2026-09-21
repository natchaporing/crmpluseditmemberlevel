import "server-only";

import { cookies } from "next/headers";

/**
 * The till an operator last signed in at, remembered across sessions.
 *
 * Deliberately separate from the session cookie. The session carries the till
 * for whoever is signed in and dies with them after eight hours; this outlives
 * logout, so the next sign-in at the same terminal does not have to retype it.
 *
 * It holds no credentials — only the identifiers already printed on the till —
 * but is still `HttpOnly`, because nothing in the browser needs to read it: the
 * login page is server-rendered and fills the form in itself.
 */
export const POS_COOKIE = "crmplus_pos";

/** Long enough to span shifts and holidays; a till rarely moves. */
const POS_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

export type PosCookie = {
  terminalId: string;
  branchId: string;
  brandId: string;
};

export async function rememberPos(pos: PosCookie): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(POS_COOKIE, JSON.stringify(pos), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: POS_MAX_AGE_SECONDS,
  });
}

/** Drops the remembered till, so the next login starts from empty fields. */
export async function forgetPos(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(POS_COOKIE);
}

/**
 * The remembered till, or `null` when there is none or the cookie is unusable.
 *
 * Anything malformed is treated as absent rather than thrown: a bad cookie
 * should cost an operator three fields to retype, not the whole login page.
 */
export async function readRememberedPos(): Promise<PosCookie | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(POS_COOKIE)?.value;
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  const { terminalId, branchId, brandId } = parsed as Record<string, unknown>;

  if (
    typeof terminalId !== "string" ||
    typeof branchId !== "string" ||
    typeof brandId !== "string"
  ) {
    return null;
  }

  return { terminalId, branchId, brandId };
}

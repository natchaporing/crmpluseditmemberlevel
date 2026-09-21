import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE, decryptSession } from "@/lib/auth/session-token";

/** Reachable without a session. */
const PUBLIC_PATHS = ["/login", "/api/health"];

/**
 * Public paths that a signed-in user should be bounced away from. `/api/health`
 * is deliberately not one: a platform probe must get the same answer whether or
 * not it happens to carry a cookie.
 */
const AUTH_PATHS = ["/login"];

function matches(pathname: string, paths: readonly string[]): boolean {
  return paths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

/**
 * Routes requests based on whether the session cookie carries a valid
 * signature. Verifying — rather than just checking that a cookie exists —
 * matters: an expired or forged cookie would otherwise bounce between `/` and
 * `/login` forever, because the page redirects out and the proxy redirects
 * straight back.
 *
 * This is still not the security boundary. `requireSession()` re-checks inside
 * every page and Server Action that touches member data, per the Next.js
 * guidance that Proxy should not be the only line of defence.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await decryptSession(token);

  if (!session && !matches(pathname, PUBLIC_PATHS)) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") loginUrl.searchParams.set("next", `${pathname}${search}`);

    const response = NextResponse.redirect(loginUrl);
    // Drop a stale cookie so the browser stops sending it.
    if (token) response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  if (session && matches(pathname, AUTH_PATHS)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
};

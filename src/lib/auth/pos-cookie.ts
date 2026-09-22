import "server-only";

import { cookies } from "next/headers";

/**
 * Clean-up for the till cookie.
 *
 * The login form used to ask for a Terminal, Branch and Brand ID and remember
 * them here for 180 days. Single sign-on does not take them, so the fields are
 * gone and nothing reads this cookie — but browsers that signed in before then
 * still hold one and still send it. Clearing it on the next login drops it
 * rather than waiting out its expiry.
 *
 * Delete this file once those cookies have aged out.
 */
export const POS_COOKIE = "crmplus_pos";

/** Drops the remembered till, if this browser still carries one. */
export async function forgetPos(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(POS_COOKIE);
}

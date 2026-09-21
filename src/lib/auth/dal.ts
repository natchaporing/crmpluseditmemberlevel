import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { readSession, type SessionPayload } from "@/lib/auth/session";

/**
 * The authoritative session check.
 *
 * Proxy (`src/proxy.ts`) only does an optimistic redirect, so every page,
 * Server Action and route handler that touches member data must call this.
 */
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  return readSession();
});

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

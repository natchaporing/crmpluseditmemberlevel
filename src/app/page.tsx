import { AppHeader } from "@/components/app-header";
import { LevelConsole } from "@/components/level-console";
import { requireSession } from "@/lib/auth/dal";
import { fetchUserLevels } from "@/lib/buzzebees/levels";
import { MEMBER_LEVELS } from "@/lib/members/levels";
import type { MemberLevel } from "@/lib/members/types";

/**
 * The levels the picker offers.
 *
 * Read from the CRM, falling back to the hard-coded list when it cannot be
 * reached or returns nothing recognisable: an empty picker would leave an
 * operator unable to do the one thing this app is for.
 */
async function levelOptions(token: string, agency: string): Promise<MemberLevel[]> {
  if (!token) return MEMBER_LEVELS;

  try {
    const { levels, raw } = await fetchUserLevels(token, agency || undefined);

    if (levels.length === 0) {
      console.error("Level list returned nothing recognisable:", JSON.stringify(raw)?.slice(0, 500));
      return MEMBER_LEVELS;
    }

    // An id is what maps a member's numeric UserLevel onto a name, so a level
    // without one keeps the id the hard-coded list has for that name.
    return levels.map((level) => ({
      code: level.name,
      id: level.id ?? MEMBER_LEVELS.find((known) => known.code === level.name)?.id ?? 0,
    }));
  } catch (error) {
    console.error(
      "Level list failed, falling back to the built-in levels:",
      error instanceof Error ? error.message : error,
    );
    return MEMBER_LEVELS;
  }
}

export default async function Home() {
  const session = await requireSession();
  const levels = await levelOptions(session.ssoToken, session.agencyId);

  return (
    <>
      <AppHeader userName={session.name} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5">
        <LevelConsole levels={levels} />
      </main>
    </>
  );
}

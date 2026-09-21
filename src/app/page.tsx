import { AppHeader } from "@/components/app-header";
import { LevelConsole } from "@/components/level-console";
import { requireSession } from "@/lib/auth/dal";

export default async function Home() {
  const session = await requireSession();

  return (
    <>
      <AppHeader userName={session.name} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5">
        <LevelConsole />
      </main>
    </>
  );
}

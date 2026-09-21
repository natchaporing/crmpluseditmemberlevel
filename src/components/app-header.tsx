import { logout } from "@/app/actions/auth";
import { BrandMark } from "@/components/brand-mark";

export function AppHeader({ userName }: { userName: string }) {
  return (
    <header className="border-b-[3px] border-brand bg-surface">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3">
        <BrandMark className="h-11 w-11" />

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold leading-tight">
            ปรับ Level ลูกค้า
          </h1>
          <p className="truncate text-sm text-muted">{userName}</p>
        </div>

        <form action={logout}>
          <button
            type="submit"
            className="rounded-lg border border-line px-3 py-2 text-sm font-semibold transition-colors hover:bg-black/5"
          >
            ออกจากระบบ
          </button>
        </form>
      </div>
    </header>
  );
}

import { redirect } from "next/navigation";

import { LoginForm } from "@/app/login/login-form";
import { BrandMark } from "@/components/brand-mark";
import { getSession } from "@/lib/auth/dal";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  // Proxy already bounces cookie-holders away; re-check here because the
  // cookie may be expired or forged.
  if (await getSession()) redirect("/");

  const { next } = await searchParams;
  const target = typeof next === "string" ? next : "/";

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-surface shadow-sm">
        <div className="h-1.5 bg-brand" />
        <div className="flex flex-col gap-6 p-7">
          <div className="flex items-center gap-3">
            <BrandMark className="h-11 w-11" />
            <div>
              <h1 className="text-lg font-bold leading-tight">ปรับ Level ลูกค้า</h1>
              <p className="text-sm text-muted">เข้าสู่ระบบเพื่อใช้งาน</p>
            </div>
          </div>

          <LoginForm next={target} />
        </div>
      </div>
    </main>
  );
}

"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { login, type LoginState } from "@/app/actions/auth";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-ink px-4 py-3 font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
    </button>
  );
}

/** Mirrors `PosCookie`, redeclared so this client file imports no server module. */
type PosDefaults = {
  terminalId: string;
  branchId: string;
  brandId: string;
};

export function LoginForm({
  next,
  remembered,
}: {
  next: string;
  remembered: PosDefaults | null;
}) {
  const [state, formAction] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="username" className="text-sm text-muted">
          ชื่อผู้ใช้
        </label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          autoFocus
          required
          // React resets the form after each submission; this keeps the
          // username in place when a login fails.
          defaultValue={state.username ?? ""}
          className="rounded-lg border border-line bg-surface px-4 py-3 outline-none focus:border-brand"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm text-muted">
          รหัสผ่าน
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-lg border border-line bg-surface px-4 py-3 outline-none focus:border-brand"
        />
      </div>

      <fieldset className="flex flex-col gap-4 rounded-lg border border-line p-4">
        <legend className="px-1 text-sm text-muted">จุดขาย</legend>

        {(
          [
            { name: "terminalId", label: "Terminal ID" },
            { name: "branchId", label: "Branch ID" },
            { name: "brandId", label: "Brand ID" },
          ] as const
        ).map((field) => (
          <div key={field.name} className="flex flex-col gap-1.5">
            <label htmlFor={field.name} className="text-sm text-muted">
              {field.label}
            </label>
            <input
              id={field.name}
              name={field.name}
              inputMode="numeric"
              autoComplete="off"
              required
              // What was just typed wins; otherwise the till remembered from
              // the last successful login here.
              defaultValue={state[field.name] ?? remembered?.[field.name] ?? ""}
              className="rounded-lg border border-line bg-surface px-4 py-3 outline-none focus:border-brand"
            />
          </div>
        ))}
      </fieldset>

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}

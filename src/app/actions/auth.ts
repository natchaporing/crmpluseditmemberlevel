"use server";

import { redirect } from "next/navigation";

import {
  checkLoginAttempts,
  clearLoginAttempts,
  recordFailedLogin,
} from "@/lib/auth/rate-limit";
import { createSession, destroySession } from "@/lib/auth/session";
import { getConfiguredUsers, verifyCredentials } from "@/lib/auth/users";

export type LoginState = {
  error?: string;
  /**
   * Echoed back so the field survives the re-render — React resets the form
   * after a Server Action, which would otherwise clear it on every failure.
   * The password is deliberately never echoed.
   */
  username?: string;
};

/**
 * Only same-origin paths are accepted, so a crafted `?next=` cannot turn the
 * login page into an open redirect. `//evil.example` is a protocol-relative
 * URL, hence the second check.
 */
function safeRedirectTarget(value: FormDataEntryValue | null): string {
  const target = String(value ?? "");
  if (!target.startsWith("/") || target.startsWith("//")) return "/";
  return target;
}

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeRedirectTarget(formData.get("next"));

  if (!username || !password) {
    return { error: "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน", username };
  }

  if (getConfiguredUsers().length === 0) {
    return {
      error: "ยังไม่ได้ตั้งค่าผู้ใช้งาน (AUTH_USERS) — ดูวิธีตั้งค่าที่ README",
      username,
    };
  }

  const throttleKey = username.toLowerCase();
  const limit = checkLoginAttempts(throttleKey);
  if (!limit.allowed) {
    const minutes = Math.ceil(limit.retryAfterSeconds / 60);
    return {
      error: `พยายามเข้าสู่ระบบผิดหลายครั้งเกินไป กรุณารออีก ${minutes} นาที`,
      username,
    };
  }

  const user = await verifyCredentials(username, password);
  if (!user) {
    recordFailedLogin(throttleKey);
    return { error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง", username };
  }

  clearLoginAttempts(throttleKey);
  await createSession({ sub: user.username, name: user.name });

  redirect(next);
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}

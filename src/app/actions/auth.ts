"use server";

import { redirect } from "next/navigation";

import {
  checkLoginAttempts,
  clearLoginAttempts,
  recordFailedLogin,
} from "@/lib/auth/rate-limit";
import { createSession, destroySession } from "@/lib/auth/session";
import { BuzzebeesAuthError, operatorLogin } from "@/lib/buzzebees/auth";
import { missingLoginVars } from "@/lib/buzzebees/config";

export type LoginState = {
  error?: string;
  /**
   * The till fields are echoed back with the username so a failed login does
   * not make the operator retype them. Only the password is withheld.
   */
  terminalId?: string;
  branchId?: string;
  brandId?: string;
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
  const terminalId = String(formData.get("terminalId") ?? "").trim();
  const branchId = String(formData.get("branchId") ?? "").trim();
  const brandId = String(formData.get("brandId") ?? "").trim();
  const next = safeRedirectTarget(formData.get("next"));

  // Echoed back on every early return below.
  const entered = { username, terminalId, branchId, brandId };

  if (!username || !password) {
    return { error: "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน", ...entered };
  }

  if (!terminalId || !branchId || !brandId) {
    return {
      error: "กรุณากรอก Terminal ID, Branch ID และ Brand ID",
      ...entered,
    };
  }

  const missingConfig = missingLoginVars();
  if (missingConfig.length > 0) {
    return {
      error: `ยังไม่ได้ตั้งค่าการเชื่อมต่อ Buzzebees (${missingConfig.join(", ")}) — ดูวิธีตั้งค่าที่ README`,
      ...entered,
    };
  }

  const throttleKey = username.toLowerCase();
  const limit = checkLoginAttempts(throttleKey);
  if (!limit.allowed) {
    const minutes = Math.ceil(limit.retryAfterSeconds / 60);
    return {
      error: `พยายามเข้าสู่ระบบผิดหลายครั้งเกินไป กรุณารออีก ${minutes} นาที`,
      ...entered,
    };
  }

  // Credentials are checked by Buzzebees, not against any local list.
  let operator;
  try {
    operator = await operatorLogin(username, password, {
      terminalId,
      branchId,
      brandId,
    });
  } catch (error) {
    // A login the service could not answer is not the operator's fault, so it
    // neither counts against the throttle nor reports a wrong password.
    if (error instanceof BuzzebeesAuthError) {
      console.error(
        `Operator login failed: ${error.message}`,
        error.status ? { status: error.status, body: error.body } : {},
      );
      return {
        error: "ไม่สามารถเชื่อมต่อระบบยืนยันตัวตนได้ กรุณาลองใหม่อีกครั้ง",
        ...entered,
      };
    }
    throw error;
  }

  if (!operator) {
    recordFailedLogin(throttleKey);
    return { error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง", ...entered };
  }

  clearLoginAttempts(throttleKey);
  await createSession({
    sub: operator.username,
    name: operator.name,
    terminalId,
    branchId,
    brandId,
  });

  redirect(next);
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}

"use server";

import { requireSession } from "@/lib/auth/dal";
import { BuzzebeesAuthError } from "@/lib/buzzebees/auth";
import { BuzzebeesApiError } from "@/lib/buzzebees/client";
import { MissingMemberIdError } from "@/lib/buzzebees/user";
import {
  changeMemberLevel,
  findMemberByPhone,
  isValidPhone,
  listHistory,
} from "@/lib/members/service";
import type { LevelChange, Member } from "@/lib/members/types";

export type SearchResult =
  | { status: "found"; member: Member }
  | { status: "not-found"; phone: string }
  | { status: "invalid"; message: string }
  | { status: "error"; message: string };

export async function searchMember(phone: string): Promise<SearchResult> {
  const session = await requireSession();

  const trimmed = phone.trim();
  if (!trimmed) {
    return { status: "invalid", message: "กรุณากรอกเบอร์โทรลูกค้า" };
  }

  if (!isValidPhone(trimmed)) {
    return { status: "invalid", message: "รูปแบบเบอร์โทรไม่ถูกต้อง" };
  }

  // A CRM that cannot be reached is not the same as a customer who is not
  // there, and must not be reported as one.
  let member;
  try {
    member = await findMemberByPhone(trimmed, session.token);
  } catch (error) {
    if (error instanceof BuzzebeesApiError || error instanceof BuzzebeesAuthError) {
      console.error(`Member lookup failed: ${error.message}`, {
        status: error.status,
        body: error.body,
      });
      return {
        status: "error",
        message: "ไม่สามารถเชื่อมต่อระบบ CRM ได้ กรุณาลองใหม่อีกครั้ง",
      };
    }
    throw error;
  }

  return member ? { status: "found", member } : { status: "not-found", phone: trimmed };
}

export type SaveLevelResult =
  | {
      status: "saved";
      member: Member;
      fromLevelCode: string;
      toLevelCode: string;
    }
  | { status: "error"; message: string };

export async function saveMemberLevel(
  phone: string,
  toLevelCode: string,
): Promise<SaveLevelResult> {
  const session = await requireSession();

  // A CRM that rejects or cannot be reached must not look like a saved change.
  let result;
  try {
    result = await changeMemberLevel({
      phone,
      toLevelCode,
      changedBy: session.sub,
      token: session.token,
      ssoToken: session.ssoToken,
      agencyId: session.agencyId,
    });
  } catch (error) {
    if (error instanceof BuzzebeesApiError || error instanceof BuzzebeesAuthError) {
      console.error(`Level change failed: ${error.message}`, {
        status: error.status,
        body: error.body,
      });
      return {
        status: "error",
        message: "บันทึก Level ไม่สำเร็จ — ระบบ CRM ปฏิเสธหรือเชื่อมต่อไม่ได้ กรุณาลองใหม่",
      };
    }
    if (error instanceof MissingMemberIdError) {
      return {
        status: "error",
        message: "ข้อมูลลูกค้าไม่มีรหัสผู้ใช้ จึงไม่สามารถบันทึก Level ได้",
      };
    }
    throw error;
  }

  if (result.ok) {
    return {
      status: "saved",
      member: result.member,
      fromLevelCode: result.fromLevelCode,
      toLevelCode: result.toLevelCode,
    };
  }

  const messages: Record<typeof result.error, string> = {
    "not-found": "ไม่พบลูกค้ารายนี้ในระบบ",
    "unknown-level": "ไม่รู้จัก Level ที่เลือก",
    "same-level": "Level ที่เลือกตรงกับ Level ปัจจุบันอยู่แล้ว",
    "no-member-id": "ข้อมูลลูกค้าไม่มีรหัสผู้ใช้ จึงไม่สามารถบันทึก Level ได้",
    "no-sso-token":
      "เข้าสู่ระบบ CRM (SSO) ไม่สำเร็จ จึงยังบันทึก Level ไม่ได้ — กรุณาออกจากระบบแล้วเข้าใหม่",
  };

  return { status: "error", message: messages[result.error] };
}

export async function getHistory(): Promise<LevelChange[]> {
  await requireSession();
  return listHistory();
}

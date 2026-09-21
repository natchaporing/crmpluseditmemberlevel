"use server";

import { requireSession } from "@/lib/auth/dal";
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
  | { status: "invalid"; message: string };

export async function searchMember(phone: string): Promise<SearchResult> {
  await requireSession();

  const trimmed = phone.trim();
  if (!trimmed) {
    return { status: "invalid", message: "กรุณากรอกเบอร์โทรลูกค้า" };
  }

  if (!isValidPhone(trimmed)) {
    return { status: "invalid", message: "รูปแบบเบอร์โทรไม่ถูกต้อง" };
  }

  const member = await findMemberByPhone(trimmed);
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

  const result = await changeMemberLevel({
    phone,
    toLevelCode,
    changedBy: session.sub,
  });

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
  };

  return { status: "error", message: messages[result.error] };
}

export async function getHistory(): Promise<LevelChange[]> {
  await requireSession();
  return listHistory();
}

"use server";

import { recordActivity, readActivity } from "@/lib/activity/log";
import { requireSession } from "@/lib/auth/dal";
import { BuzzebeesAuthError } from "@/lib/buzzebees/auth";
import { BuzzebeesApiError } from "@/lib/buzzebees/client";
import { IncompleteRecordError } from "@/lib/buzzebees/user";
import {
  changeMemberLevel,
  findMemberByPhone,
  isValidPhone,
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
      await recordActivity({
        operator: session.sub,
        action: "search",
        outcome: "failure",
        terminalId: session.terminalId,
        branchId: session.branchId,
        brandId: session.brandId,
        contactNumber: trimmed,
        detail: `CRM unreachable: ${error.message}`,
      });
      return {
        status: "error",
        message: "ไม่สามารถเชื่อมต่อระบบ CRM ได้ กรุณาลองใหม่อีกครั้ง",
      };
    }
    throw error;
  }

  await recordActivity({
    operator: session.sub,
    action: "search",
    outcome: member ? "success" : "failure",
    terminalId: session.terminalId,
    branchId: session.branchId,
    brandId: session.brandId,
    contactNumber: trimmed,
    memberName: member
      ? `${member.firstName} ${member.lastName}`.trim()
      : undefined,
    userId: member?.userId,
    detail: member ? undefined : "ไม่พบลูกค้า",
  });

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
      await recordActivity({
        operator: session.sub,
        action: "level-change",
        outcome: "failure",
        terminalId: session.terminalId,
        branchId: session.branchId,
        brandId: session.brandId,
        contactNumber: phone,
        toLevelCode,
        detail: `${error.name} ${error.status}: ${error.message}`,
      });
      return {
        status: "error",
        message: "บันทึก Level ไม่สำเร็จ — ระบบ CRM ปฏิเสธหรือเชื่อมต่อไม่ได้ กรุณาลองใหม่",
      };
    }
    if (error instanceof IncompleteRecordError) {
      console.error(`Refused to save: ${error.message}`);
      return {
        status: "error",
        message:
          "ข้อมูลลูกค้าไม่ครบ จึงไม่บันทึก เพื่อไม่ให้ข้อมูลเดิมถูกลบ — กรุณาแจ้งผู้ดูแลระบบ",
      };
    }
    throw error;
  }

  if (result.ok) {
    await recordActivity({
      operator: session.sub,
      action: "level-change",
      outcome: "success",
      terminalId: session.terminalId,
      branchId: session.branchId,
      brandId: session.brandId,
      contactNumber: result.member.contactNumber,
      memberName: `${result.member.firstName} ${result.member.lastName}`.trim(),
      userId: result.member.userId,
      fromLevelCode: result.fromLevelCode,
      toLevelCode: result.toLevelCode,
    });

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

  await recordActivity({
    operator: session.sub,
    action: "level-change",
    outcome: "failure",
    terminalId: session.terminalId,
    branchId: session.branchId,
    brandId: session.brandId,
    contactNumber: phone,
    toLevelCode,
    detail: result.error,
  });

  return { status: "error", message: messages[result.error] };
}

/**
 * The level changes from the activity log.
 *
 * The log holds every action; this tab is the edit history, so it shows the
 * level changes. Everything else is on the server for whoever needs it.
 */
export async function getHistory(): Promise<LevelChange[]> {
  await requireSession();

  const entries = await readActivity({ action: "level-change", limit: 50 });

  return entries.map((entry) => ({
    id: entry.id,
    changedAt: entry.at,
    changedBy: entry.operator,
    memberName: entry.memberName ?? "",
    contactNumber: entry.contactNumber ?? "",
    fromLevelCode: entry.fromLevelCode ?? "",
    toLevelCode: entry.toLevelCode ?? "",
    status: entry.outcome === "success" ? "success" : "failed",
  }));
}

import "server-only";

import { randomUUID } from "node:crypto";

import { findLevel } from "@/lib/members/levels";
import { store } from "@/lib/members/store";
import type { LevelChange, Member } from "@/lib/members/types";

/** Digits only, so `08-1234-5678` and `0812345678` are the same member. */
export function normalisePhone(input: string): string {
  return input.replace(/\D/g, "");
}

export function isValidPhone(input: string): boolean {
  return /^0\d{8,9}$/.test(normalisePhone(input));
}

export async function findMemberByPhone(phone: string): Promise<Member | null> {
  const normalised = normalisePhone(phone);
  return (
    store.members.find(
      (member) => normalisePhone(member.contactNumber) === normalised,
    ) ?? null
  );
}

export type ChangeLevelResult =
  | { ok: true; member: Member; fromLevelCode: string; toLevelCode: string }
  | { ok: false; error: "not-found" | "unknown-level" | "same-level" };

export async function changeMemberLevel(options: {
  phone: string;
  toLevelCode: string;
  changedBy: string;
}): Promise<ChangeLevelResult> {
  const member = await findMemberByPhone(options.phone);
  if (!member) return { ok: false, error: "not-found" };

  const target = findLevel(options.toLevelCode);
  if (!target) return { ok: false, error: "unknown-level" };

  const fromLevelCode = member.levelCode;
  if (fromLevelCode === target.code) return { ok: false, error: "same-level" };

  member.levelCode = target.code;

  const entry: LevelChange = {
    id: randomUUID(),
    changedAt: new Date().toISOString(),
    changedBy: options.changedBy,
    memberName: `${member.firstName} ${member.lastName}`.trim(),
    contactNumber: member.contactNumber,
    fromLevelCode,
    toLevelCode: target.code,
    status: "success",
  };

  store.history.unshift(entry);

  return { ok: true, member, fromLevelCode, toLevelCode: target.code };
}

export async function listHistory(limit = 50): Promise<LevelChange[]> {
  return store.history.slice(0, limit);
}

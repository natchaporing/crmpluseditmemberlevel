import "server-only";

import { firstNumber, firstString } from "@/lib/buzzebees/payload";
import { fetchPosProfile } from "@/lib/buzzebees/profile";
import { findLevel } from "@/lib/members/levels";
import { store } from "@/lib/members/store";
import type { LevelChange, Member } from "@/lib/members/types";

/**
 * Field names the CRM might use. `/pos/profile` has not been pinned down field
 * by field, so each one is read under its usual spellings and whatever is not
 * recognised still reaches the UI through `raw`.
 */
const USER_ID_KEYS = ["userId", "user_id", "userID", "memberId", "id"];
const FIRST_NAME_KEYS = ["firstName", "first_name", "firstname", "fname"];
const LAST_NAME_KEYS = ["lastName", "last_name", "lastname", "lname"];
const CONTACT_KEYS = [
  "contactNumber",
  "contact_number",
  "contactnumber",
  "mobile",
  "phone",
  "msisdn",
];
const POINT_KEYS = ["point", "points", "pointBalance", "balance"];
const LEVEL_KEYS = ["levelName", "level_name", "level", "levelCode", "memberLevel"];

/** Scalar fields of the payload, for the "ข้อมูลที่ส่งไปพร้อมกัน" list. */
function scalarAttributes(
  raw: Record<string, unknown>,
): Member["attributes"] {
  const attributes: Member["attributes"] = {};

  for (const [key, value] of Object.entries(raw)) {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      attributes[key] = value;
    }
  }

  return attributes;
}

function toMember(raw: Record<string, unknown>, phone: string): Member {
  return {
    userId: firstString(raw, USER_ID_KEYS) ?? "",
    firstName: firstString(raw, FIRST_NAME_KEYS) ?? "",
    lastName: firstString(raw, LAST_NAME_KEYS) ?? "",
    contactNumber: firstString(raw, CONTACT_KEYS) ?? phone,
    point: firstNumber(raw, POINT_KEYS) ?? 0,
    levelCode: firstString(raw, LEVEL_KEYS) ?? "",
    attributes: scalarAttributes(raw),
    raw,
  };
}

/** Digits only, so `08-1234-5678` and `0812345678` are the same member. */
export function normalisePhone(input: string): string {
  return input.replace(/\D/g, "");
}

export function isValidPhone(input: string): boolean {
  return /^0\d{8,9}$/.test(normalisePhone(input));
}

/**
 * Looks a customer up in the CRM, via `GET /pos/profile?contactNumber=…`.
 *
 * Reads the live service rather than the placeholder store, so a number the
 * CRM knows is found and one it does not is not.
 */
export async function findMemberByPhone(phone: string): Promise<Member | null> {
  const normalised = normalisePhone(phone);
  const profile = await fetchPosProfile(normalised);

  return profile ? toMember(profile, normalised) : null;
}

export type ChangeLevelResult =
  | { ok: true; member: Member; fromLevelCode: string; toLevelCode: string }
  | {
      ok: false;
      error: "not-found" | "unknown-level" | "same-level" | "write-not-wired";
    };

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

  // The member now comes from the CRM, so there is no local record to change.
  // Writing the level back means POST /crmplusoffice/user, which replaces the
  // whole profile — see updateCrmPlusUser. Until the /pos/profile payload is
  // mapped onto CrmPlusUser field by field, saying so beats mutating an object
  // that is thrown away, which would report a success that never happened.
  return { ok: false, error: "write-not-wired" };
}

export async function listHistory(limit = 50): Promise<LevelChange[]> {
  return store.history.slice(0, limit);
}

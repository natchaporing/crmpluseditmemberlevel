import "server-only";

import { firstNumber, firstString, isRecord } from "@/lib/buzzebees/payload";
import { fetchPosProfile } from "@/lib/buzzebees/profile";
import { updateMemberLevel } from "@/lib/buzzebees/user";
import { randomUUID } from "node:crypto";

import { findLevel, levelCodeById } from "@/lib/members/levels";
import { store } from "@/lib/members/store";
import type { LevelChange, Member } from "@/lib/members/types";

/**
 * Field names the CRM uses, with the usual variants alongside.
 *
 * The live payload is PascalCase (`FirstName`, `Contact_Number`), but the
 * camelCase spellings are kept so a differently-cased response still reads.
 */
const USER_ID_KEYS = ["UserId", "userId", "user_id", "userID", "memberId", "id"];
const FIRST_NAME_KEYS = ["FirstName", "firstName", "first_name", "firstname"];
const LAST_NAME_KEYS = ["LastName", "lastName", "last_name", "lastname"];
/** Used only when the name is not split into two fields. */
const FULL_NAME_KEYS = ["Name", "DisplayName", "displayName", "name", "fullName"];
const CONTACT_KEYS = [
  "Contact_Number",
  "ContactNumber",
  "contactNumber",
  "contact_number",
  "contactnumber",
  "mobile",
  "phone",
  "msisdn",
];
const POINT_KEYS = ["Point", "point", "Points", "points", "pointBalance", "balance"];
/** The level as a name, where the CRM sends one instead of a numeric id. */
const LEVEL_NAME_KEYS = ["LevelName", "levelName", "level_name", "levelCode", "level"];
/** The level as the CRM's numeric id, e.g. `UserLevel: 1`. */
const LEVEL_ID_KEYS = ["UserLevel", "userLevel", "user_level", "levelId", "level_id"];

/**
 * Points live under `updated_points.points` rather than at the top level, so
 * the nested object is searched before falling back to a flat field.
 */
function readPoint(raw: Record<string, unknown>): number {
  const updated = raw.updated_points ?? raw.updatedPoints;
  if (isRecord(updated)) {
    const nested = firstNumber(updated, ["points", "point"]);
    if (nested !== null) return nested;
  }

  return firstNumber(raw, POINT_KEYS) ?? 0;
}

/**
 * The member level, preferring a name the CRM sends outright and otherwise
 * resolving its numeric id against `MEMBER_LEVELS`. An id with no matching
 * level yields an empty code rather than a guess, so the badge shows nothing
 * instead of the wrong level.
 */
function readLevelCode(raw: Record<string, unknown>): string {
  const named = firstString(raw, LEVEL_NAME_KEYS);
  if (named) return named;

  const id = firstNumber(raw, LEVEL_ID_KEYS);
  if (id !== null) return levelCodeById(id) ?? "";

  return "";
}

/**
 * Scalar fields of the payload, for the "ข้อมูลที่ส่งไปพร้อมกัน" list. Nested
 * objects are left out: they would render as [object Object], and the raw JSON
 * below the list already shows them in full.
 */
function scalarAttributes(raw: Record<string, unknown>): Member["attributes"] {
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
  const first = firstString(raw, FIRST_NAME_KEYS);
  const last = firstString(raw, LAST_NAME_KEYS);
  // Fall back to a single name field, split on the first space, so the card
  // has something to show when the CRM does not send the parts separately.
  const full = firstString(raw, FULL_NAME_KEYS) ?? "";
  const [fallbackFirst, ...fallbackRest] = full.split(" ");

  return {
    userId: firstString(raw, USER_ID_KEYS) ?? "",
    firstName: first ?? fallbackFirst ?? "",
    lastName: last ?? fallbackRest.join(" "),
    contactNumber: firstString(raw, CONTACT_KEYS) ?? phone,
    point: readPoint(raw),
    levelCode: readLevelCode(raw),
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
export async function findMemberByPhone(
  phone: string,
  token: string,
): Promise<Member | null> {
  const normalised = normalisePhone(phone);
  const profile = await fetchPosProfile(normalised, token);

  return profile ? toMember(profile, normalised) : null;
}

export type ChangeLevelResult =
  | { ok: true; member: Member; fromLevelCode: string; toLevelCode: string }
  | {
      ok: false;
      error:
        | "not-found"
        | "unknown-level"
        | "same-level"
        | "no-member-id"
        | "no-sso-token";
    };

export async function changeMemberLevel(options: {
  phone: string;
  toLevelCode: string;
  changedBy: string;
  /** The wallet token, for looking the member up. */
  token: string;
  /** The single sign-on token, which the update endpoint accepts. */
  ssoToken: string;
  /** From the operator's login; falls back to configuration when empty. */
  agencyId?: string;
}): Promise<ChangeLevelResult> {
  const member = await findMemberByPhone(options.phone, options.token);
  if (!member) return { ok: false, error: "not-found" };

  const target = findLevel(options.toLevelCode);
  if (!target) return { ok: false, error: "unknown-level" };

  const fromLevelCode = member.levelCode;
  if (fromLevelCode === target.code) return { ok: false, error: "same-level" };

  if (!member.userId) return { ok: false, error: "no-member-id" };

  // The wallet token is not the one this endpoint takes, and sending it would
  // fail in a way that looks like a bad request rather than a missing sign-in.
  if (!options.ssoToken) return { ok: false, error: "no-sso-token" };

  await updateMemberLevel(
    { userId: member.userId, levelName: target.code, agency: options.agencyId },
    options.ssoToken,
  );

  // The CRM keeps its own log; this one covers the operator's own session, so
  // the history tab shows what they just did without a second round trip.
  store.history.unshift({
    id: randomUUID(),
    changedAt: new Date().toISOString(),
    changedBy: options.changedBy,
    memberName: `${member.firstName} ${member.lastName}`.trim(),
    contactNumber: member.contactNumber,
    fromLevelCode,
    toLevelCode: target.code,
    status: "success",
  });

  return {
    ok: true,
    member: { ...member, levelCode: target.code },
    fromLevelCode,
    toLevelCode: target.code,
  };
}

export async function listHistory(limit = 50): Promise<LevelChange[]> {
  return store.history.slice(0, limit);
}

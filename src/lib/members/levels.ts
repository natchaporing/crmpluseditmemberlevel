import type { MemberLevel } from "@/lib/members/types";

export const MEMBER_LEVELS: MemberLevel[] = [
  { code: "Member", id: 1 },
  { code: "Plus1", id: 16 },
  { code: "Plus2_69", id: 2 },
  { code: "Plus3", id: 3 },
  { code: "Plus4", id: 4 },
];

export function findLevel(code: string): MemberLevel | undefined {
  return MEMBER_LEVELS.find((level) => level.code === code);
}

export function levelId(code: string): number | null {
  return findLevel(code)?.id ?? null;
}

/** The level whose numeric id the CRM sent, e.g. `UserLevel: 1` → `Member`. */
export function levelCodeById(id: number): string | null {
  return MEMBER_LEVELS.find((level) => level.id === id)?.code ?? null;
}

/** Member levels, in display order. `id` mirrors the CRM's numeric level id. */
export type MemberLevel = {
  code: string;
  id: number;
};

export type Member = {
  userId: string;
  firstName: string;
  lastName: string;
  contactNumber: string;
  point: number;
  levelCode: string;
  /** Everything the CRM sends back, shown under "ข้อมูลที่ส่งไปพร้อมกัน". */
  attributes: Record<string, string | number | boolean | null>;
  /** Raw payload echoed in the dark code block on the detail panel. */
  raw: Record<string, unknown>;
};

export type LevelChange = {
  id: string;
  /** ISO timestamp of the change. */
  changedAt: string;
  /** Username of the operator who made the change. */
  changedBy: string;
  memberName: string;
  contactNumber: string;
  fromLevelCode: string;
  toLevelCode: string;
  status: "success" | "failed";
};

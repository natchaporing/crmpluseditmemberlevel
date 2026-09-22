import "server-only";

import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * The activity log: who did what, recorded by this app rather than read back
 * from the CRM.
 *
 * Append-only JSONL. One line per event keeps writes atomic enough for a
 * single process — a line is written in one call and never rewritten — and
 * keeps the file readable with `tail` when something needs explaining.
 *
 * **The file must live on a mounted volume to survive.** A container's own
 * filesystem is replaced on every deploy, so without one the log is lost each
 * time the app ships. `ACTIVITY_LOG_DIR` points at the mount.
 */

export type ActivityAction =
  | "login"
  | "logout"
  | "search"
  | "level-change";

export type ActivityEntry = {
  id: string;
  /** ISO timestamp. */
  at: string;
  /** Username of the operator, or what they typed when a login failed. */
  operator: string;
  /**
   * The agency the operator was signed in under, as their login reported it.
   *
   * Absent when the login did not say — and on every line written before this
   * was recorded. Those form their own group rather than being attributed to
   * an agency nobody confirmed.
   */
  agencyId?: string;
  action: ActivityAction;
  outcome: "success" | "failure";
  /** The till they were signed in at. */
  terminalId?: string;
  branchId?: string;
  brandId?: string;
  contactNumber?: string;
  memberName?: string;
  userId?: string;
  fromLevelCode?: string;
  toLevelCode?: string;
  /** Why a failure failed, or anything else worth keeping. */
  detail?: string;
};

function logPath(): string {
  const dir = process.env.ACTIVITY_LOG_DIR?.trim() || join(process.cwd(), "data");
  return join(dir, "activity.jsonl");
}

/**
 * Entries this process recorded, kept so the history tab still shows the
 * session's work when the file cannot be written — a read-only filesystem
 * should cost the log, not the app.
 */
const fallback: ActivityEntry[] = [];

/**
 * Records one event.
 *
 * Never throws: an operator's level change must not fail because the log
 * could not be written. A write that fails is reported to the console and the
 * entry is held in memory.
 */
export async function recordActivity(
  entry: Omit<ActivityEntry, "id" | "at">,
): Promise<void> {
  const full: ActivityEntry = {
    ...entry,
    id: randomUUID(),
    at: new Date().toISOString(),
  };

  fallback.unshift(full);
  // Bounded, since this is only a stand-in for the file.
  if (fallback.length > 500) fallback.length = 500;

  const path = logPath();
  try {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(full)}\n`, "utf8");
  } catch (error) {
    console.error(
      `Could not write the activity log at ${path}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * The most recent entries, newest first.
 *
 * Reads the whole file, which is fine at this volume and keeps the format a
 * plain, greppable one. Revisit if the log ever outgrows memory.
 */
export async function readActivity(options: {
  limit?: number;
  action?: ActivityAction;
  /**
   * Keep only the entries recorded under this agency. An empty string is a
   * filter in its own right — it selects the entries that carry no agency,
   * which is what an operator whose login named none should see. Omit it to
   * read the whole log.
   */
  agencyId?: string;
} = {}): Promise<ActivityEntry[]> {
  const { limit = 50, action, agencyId } = options;

  let entries: ActivityEntry[];
  try {
    const text = await readFile(logPath(), "utf8");
    entries = text
      .split("\n")
      .filter((line) => line.trim())
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as ActivityEntry];
        } catch {
          // A truncated final line is not worth losing the rest of the log for.
          return [];
        }
      })
      .reverse();
  } catch {
    // No file yet, or it cannot be read: fall back to what this process has.
    entries = [...fallback];
  }

  const filtered = entries.filter(
    (entry) =>
      (action === undefined || entry.action === action) &&
      (agencyId === undefined || (entry.agencyId ?? "") === agencyId),
  );

  return filtered.slice(0, limit);
}

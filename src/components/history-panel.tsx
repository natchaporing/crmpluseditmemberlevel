"use client";

import { useCallback, useEffect, useState, useTransition } from "react";

import { getHistory } from "@/app/actions/members";
import { LevelBadge } from "@/components/level-badge";
import type { LevelChange } from "@/lib/members/types";

/** `2026-09-21 16:02:42` — matches the format the CRM team pastes into Excel. */
function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function toTsv(entries: LevelChange[]): string {
  const header = ["เวลา", "ผู้แก้ไข", "ชื่อลูกค้า", "เบอร์โทร", "จาก", "เป็น", "สถานะ"];

  const rows = entries.map((entry) => [
    formatTimestamp(entry.changedAt),
    entry.changedBy,
    entry.memberName,
    entry.contactNumber,
    entry.fromLevelCode,
    entry.toLevelCode,
    entry.status === "success" ? "สำเร็จ" : "ไม่สำเร็จ",
  ]);

  return [header, ...rows].map((row) => row.join("\t")).join("\n");
}

export function HistoryPanel({ reloadKey }: { reloadKey: number }) {
  const [entries, setEntries] = useState<LevelChange[]>([]);
  const [copied, setCopied] = useState(false);
  const [loading, startLoad] = useTransition();

  const reload = useCallback(() => {
    startLoad(async () => {
      setEntries(await getHistory());
    });
  }, []);

  useEffect(reload, [reload, reloadKey]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(toTsv(entries));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="rounded-xl bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold">ประวัติการแก้ไข</h2>
        <button
          type="button"
          onClick={reload}
          disabled={loading}
          className="rounded-lg border border-line px-4 py-2 font-semibold transition-colors hover:bg-black/5 disabled:opacity-60"
        >
          {loading ? "กำลังโหลด…" : "รีเฟรช"}
        </button>
      </div>

      <button
        type="button"
        onClick={handleCopy}
        disabled={entries.length === 0}
        className="mt-4 w-full rounded-lg border border-line px-4 py-3 font-semibold transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {copied ? "คัดลอกแล้ว" : "คัดลอกทั้งหมด (วางใน Excel ได้)"}
      </button>

      {entries.length === 0 ? (
        <p className="mt-6 text-center text-muted">ยังไม่มีประวัติการแก้ไข</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {entries.map((entry) => (
            <li key={entry.id} className="py-4">
              <p className="text-sm text-muted">
                {formatTimestamp(entry.changedAt)} · {entry.changedBy}
              </p>

              <p className="mt-1 flex flex-wrap items-center gap-2">
                <span className="font-bold">
                  {entry.memberName} · {entry.contactNumber}
                </span>
                {entry.status === "success" ? (
                  <span className="rounded bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">
                    สำเร็จ
                  </span>
                ) : (
                  <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                    ไม่สำเร็จ
                  </span>
                )}
              </p>

              <p className="mt-2 flex items-center gap-2">
                <LevelBadge code={entry.fromLevelCode} tone="neutral" />
                <span aria-label="เปลี่ยนเป็น">→</span>
                <LevelBadge code={entry.toLevelCode} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

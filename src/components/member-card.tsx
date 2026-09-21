"use client";

import { useState } from "react";

import { LevelBadge } from "@/components/level-badge";
import { MEMBER_LEVELS, levelId } from "@/lib/members/levels";
import type { Member } from "@/lib/members/types";

function StatBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-black/4 px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 font-bold">{children}</div>
    </div>
  );
}

function AttributeValue({ value }: { value: string | number | boolean | null }) {
  if (value === null || value === "") {
    return <span className="italic text-muted">(ว่าง)</span>;
  }
  return <span>{String(value)}</span>;
}

export function MemberCard({
  member,
  onSave,
  saving,
  error,
}: {
  member: Member;
  onSave: (toLevelCode: string) => void;
  saving: boolean;
  error: string | null;
}) {
  // The parent remounts this card (via `key`) whenever the member or their
  // level changes, so these initial values stay in step with the props.
  const [selected, setSelected] = useState(member.levelCode);
  const [confirming, setConfirming] = useState(false);

  const fullName = `${member.firstName} ${member.lastName}`.trim();
  const currentId = levelId(member.levelCode);

  return (
    <section className="rounded-xl bg-surface p-5 shadow-sm">
      <h2 className="text-xl font-bold">{fullName}</h2>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <StatBox label="เบอร์โทร">{member.contactNumber}</StatBox>
        <StatBox label="Point">{member.point}</StatBox>
        <StatBox label="Level ตอนนี้">
          <span className="flex items-center gap-2">
            <LevelBadge code={member.levelCode} />
            {currentId === null ? null : (
              <span className="text-sm font-normal text-muted">lv. {currentId}</span>
            )}
          </span>
        </StatBox>
      </div>

      <hr className="my-4 border-t border-dashed border-line" />

      <label htmlFor="level" className="text-sm text-muted">
        เปลี่ยน Level เป็น
      </label>
      <div className="mt-1.5 flex gap-3">
        <select
          id="level"
          value={selected}
          disabled={saving}
          onChange={(event) => {
            setSelected(event.target.value);
            setConfirming(false);
          }}
          className="flex-1 rounded-lg border border-line bg-surface px-4 py-3 font-semibold outline-none focus:border-brand disabled:opacity-60"
        >
          {MEMBER_LEVELS.map((level) => (
            <option key={level.code} value={level.code}>
              {level.code}
            </option>
          ))}
        </select>

        <button
          type="button"
          disabled={saving || selected === member.levelCode}
          onClick={() => setConfirming(true)}
          className="rounded-lg bg-brand px-5 py-3 font-bold text-white transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          บันทึก
        </button>
      </div>

      {confirming ? (
        <div className="mt-3 rounded-lg border border-brand/40 bg-brand-soft p-4">
          <p>
            เปลี่ยน Level ของ {fullName} จาก {member.levelCode} เป็น {selected} ?
          </p>
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => onSave(selected)}
              className="rounded-lg bg-brand px-5 py-2.5 font-bold text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
            >
              {saving ? "กำลังบันทึก…" : "ยืนยัน"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-line bg-surface px-5 py-2.5 font-semibold transition-colors hover:bg-black/5 disabled:opacity-60"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <details className="mt-3 group">
        <summary className="cursor-pointer list-none text-sm text-muted">
          <span className="inline-block transition-transform group-open:rotate-90">▶</span>{" "}
          ข้อมูลที่ส่งไปพร้อมกัน
        </summary>

        <dl className="mt-3 divide-y divide-line text-sm">
          {Object.entries(member.attributes).map(([key, value]) => (
            <div key={key} className="grid grid-cols-[minmax(0,10rem)_1fr] gap-3 py-1.5">
              <dt className="text-muted">{key}</dt>
              <dd className="min-w-0 break-words">
                <AttributeValue value={value} />
              </dd>
            </div>
          ))}
        </dl>

        <pre className="mt-3 overflow-x-auto rounded-lg bg-ink p-4 font-mono text-xs leading-relaxed text-white">
          {JSON.stringify({ data: member.raw }, null, 2)}
        </pre>
      </details>
    </section>
  );
}

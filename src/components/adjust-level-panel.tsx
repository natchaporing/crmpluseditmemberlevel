"use client";

import { useState, useTransition } from "react";

import { saveMemberLevel, searchMember } from "@/app/actions/members";
import { LevelBadge } from "@/components/level-badge";
import { MemberCard } from "@/components/member-card";
import { CheckIconCircle, Modal, SearchIconCircle } from "@/components/modal";
import type { Member, MemberLevel } from "@/lib/members/types";

type SavedInfo = {
  name: string;
  fromLevelCode: string;
  toLevelCode: string;
};

export function AdjustLevelPanel({
  levels,
  onSaved,
}: {
  levels: MemberLevel[];
  onSaved: () => void;
}) {
  const [phone, setPhone] = useState("");
  const [member, setMember] = useState<Member | null>(null);
  const [notFoundPhone, setNotFoundPhone] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedInfo | null>(null);

  const [searching, startSearch] = useTransition();
  const [saving, startSave] = useTransition();

  function handleSearch() {
    setSearchError(null);
    setSaveError(null);

    startSearch(async () => {
      const result = await searchMember(phone);

      if (result.status === "found") {
        setMember(result.member);
        return;
      }

      setMember(null);
      if (result.status === "not-found") {
        setNotFoundPhone(result.phone);
      } else {
        setSearchError(result.message);
      }
    });
  }

  function handleSave(toLevelCode: string) {
    setSaveError(null);

    startSave(async () => {
      const result = await saveMemberLevel(phone, toLevelCode);

      if (result.status === "error") {
        setSaveError(result.message);
        return;
      }

      setMember(result.member);
      setSaved({
        name: `${result.member.firstName} ${result.member.lastName}`.trim(),
        fromLevelCode: result.fromLevelCode,
        toLevelCode: result.toLevelCode,
      });
      onSaved();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl bg-surface p-4 shadow-sm">
        <label htmlFor="phone" className="text-sm text-muted">
          เบอร์โทรลูกค้า
        </label>
        <form
          className="mt-1.5 flex gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            handleSearch();
          }}
        >
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="off"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-4 py-3 outline-none focus:border-brand"
          />
          <button
            type="submit"
            disabled={searching}
            className="rounded-lg bg-ink px-5 py-3 font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {searching ? "กำลังค้นหา…" : "ค้นหา"}
          </button>
        </form>

        {searchError ? (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {searchError}
          </p>
        ) : null}
      </section>

      {member ? (
        <MemberCard
          key={`${member.userId}:${member.levelCode}`}
          member={member}
          levels={levels}
          onSave={handleSave}
          saving={saving}
          error={saveError}
        />
      ) : null}

      {notFoundPhone ? (
        <Modal
          title="ไม่พบลูกค้า"
          icon={<SearchIconCircle />}
          actionLabel="ลองเบอร์อื่น"
          onAction={() => setNotFoundPhone(null)}
        >
          <p>
            ไม่พบเบอร์ <strong className="text-foreground">{notFoundPhone}</strong> ในระบบ
          </p>
          <p>ตรวจสอบเบอร์แล้วลองอีกครั้ง</p>
        </Modal>
      ) : null}

      {saved ? (
        <Modal
          title="บันทึกสำเร็จ"
          icon={<CheckIconCircle />}
          actionLabel="ตกลง"
          onAction={() => setSaved(null)}
        >
          <p className="text-foreground">{saved.name}</p>
          <p className="mt-2 flex items-center justify-center gap-2">
            <LevelBadge code={saved.fromLevelCode} tone="neutral" />
            <span aria-label="เปลี่ยนเป็น">→</span>
            <LevelBadge code={saved.toLevelCode} />
          </p>
        </Modal>
      ) : null}
    </div>
  );
}

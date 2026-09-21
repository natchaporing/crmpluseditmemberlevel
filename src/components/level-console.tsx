"use client";

import { useState } from "react";

import { AdjustLevelPanel } from "@/components/adjust-level-panel";
import { HistoryPanel } from "@/components/history-panel";

type Tab = "adjust" | "history";

const TABS: { id: Tab; label: string }[] = [
  { id: "adjust", label: "ปรับ Level" },
  { id: "history", label: "ประวัติการแก้ไข" },
];

export function LevelConsole() {
  const [tab, setTab] = useState<Tab>("adjust");
  // Bumped after a save so the history tab refetches when it is next shown.
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="โหมดการใช้งาน" className="grid grid-cols-2 gap-3">
        {TABS.map((item) => {
          const active = tab === item.id;

          return (
            <button
              key={item.id}
              role="tab"
              type="button"
              aria-selected={active}
              aria-controls={`panel-${item.id}`}
              id={`tab-${item.id}`}
              onClick={() => setTab(item.id)}
              className={`rounded-xl px-4 py-3 font-bold transition-colors ${
                active
                  ? "bg-ink text-white"
                  : "border border-line bg-surface hover:bg-black/5"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id="panel-adjust"
        aria-labelledby="tab-adjust"
        hidden={tab !== "adjust"}
      >
        <AdjustLevelPanel onSaved={() => setReloadKey((key) => key + 1)} />
      </div>

      <div
        role="tabpanel"
        id="panel-history"
        aria-labelledby="tab-history"
        hidden={tab !== "history"}
      >
        {tab === "history" ? <HistoryPanel reloadKey={reloadKey} /> : null}
      </div>
    </div>
  );
}

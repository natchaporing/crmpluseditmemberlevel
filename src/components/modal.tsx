"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export function Modal({
  title,
  icon,
  children,
  actionLabel,
  onAction,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  actionLabel: string;
  onAction: () => void;
}) {
  const titleId = useId();
  const actionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    actionRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onAction();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onAction]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-surface shadow-2xl"
      >
        <div className="h-1.5 bg-brand" />
        <div className="flex flex-col items-center gap-3 px-6 pt-7 pb-6 text-center">
          {icon}
          <h2 id={titleId} className="text-xl font-bold">
            {title}
          </h2>
          <div className="text-muted">{children}</div>
          <button
            ref={actionRef}
            type="button"
            onClick={onAction}
            className="mt-3 w-full rounded-lg bg-brand px-4 py-3 font-bold text-white transition-colors hover:bg-brand-strong"
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SearchIconCircle() {
  return (
    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        className="h-7 w-7 text-ink"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.6-3.6" />
      </svg>
    </span>
  );
}

export function CheckIconCircle() {
  return (
    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success-soft">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-7 w-7 text-success"
        aria-hidden="true"
      >
        <path d="m5 13 4.5 4.5L19 7" />
      </svg>
    </span>
  );
}

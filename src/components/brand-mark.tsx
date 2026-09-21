export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-ink ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" className="h-3/5 w-3/5" role="presentation">
        <circle cx="16" cy="16" r="14" fill="none" stroke="#fff" strokeWidth="3" />
        <circle cx="16" cy="16" r="6" fill="var(--brand)" />
      </svg>
    </span>
  );
}

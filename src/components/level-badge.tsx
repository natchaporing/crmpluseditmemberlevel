const TONES = {
  brand: "bg-brand text-white",
  neutral: "bg-black/8 text-ink",
} as const;

export function LevelBadge({
  code,
  tone = "brand",
}: {
  code: string;
  tone?: keyof typeof TONES;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-bold ${TONES[tone]}`}
    >
      {code}
    </span>
  );
}

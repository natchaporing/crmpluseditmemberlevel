/**
 * The product mark.
 *
 * The artwork carries its own dark disc and runs to the edges of its canvas,
 * so there is no plate behind it — a backing square would only sit behind
 * transparent corners. `className` sizes the box the mark fills, as it did
 * before, so callers are unchanged.
 *
 * A plain `img` rather than `next/image`: the file is a 160px PNG served
 * straight from `public/`, so there is nothing for the optimizer to save, and
 * this keeps the mark rendering even where the image optimizer is not running.
 */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt=""
      width={160}
      height={160}
      className={`shrink-0 object-contain ${className}`}
      aria-hidden="true"
    />
  );
}

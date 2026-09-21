import "server-only";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;

type Bucket = { count: number; resetAt: number };

/**
 * In-memory throttle for failed logins.
 *
 * Good enough for a single-instance internal tool. Behind more than one
 * instance this resets per process, so move it to Redis (or similar) before
 * scaling out.
 */
const buckets = new Map<string, Bucket>();

function prune(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  /** Seconds until the caller may try again. Only meaningful when blocked. */
  retryAfterSeconds: number;
};

export function checkLoginAttempts(key: string): RateLimitResult {
  const now = Date.now();
  prune(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (bucket.count < MAX_ATTEMPTS) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
  };
}

export function recordFailedLogin(key: string): void {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }

  bucket.count += 1;
}

export function clearLoginAttempts(key: string): void {
  buckets.delete(key);
}

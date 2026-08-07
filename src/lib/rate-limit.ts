/**
 * In-memory sliding-window rate limiter. Suitable for the single-instance
 * deployments this project targets; swap for Redis if you scale horizontally.
 */

interface RateLimitBucket {
  timestamps: number[];
}

interface GlobalWithRateLimiter {
  webshopRateBuckets?: Map<string, RateLimitBucket>;
}

const globalWithRateLimiter = globalThis as GlobalWithRateLimiter;

function buckets(): Map<string, RateLimitBucket> {
  if (!globalWithRateLimiter.webshopRateBuckets) {
    globalWithRateLimiter.webshopRateBuckets = new Map();
  }
  return globalWithRateLimiter.webshopRateBuckets;
}

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
}

/** Returns true when the call is allowed, false when the limit is exceeded. */
export function consumeRateLimit({ key, limit, windowMs }: RateLimitOptions): boolean {
  const now = Date.now();
  const allBuckets = buckets();
  const bucket = allBuckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((timestamp) => now - timestamp < windowMs);
  if (bucket.timestamps.length >= limit) {
    allBuckets.set(key, bucket);
    return false;
  }
  bucket.timestamps.push(now);
  allBuckets.set(key, bucket);
  return true;
}

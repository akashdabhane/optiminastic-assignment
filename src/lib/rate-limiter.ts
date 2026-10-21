import { config } from "./config.ts";

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfter: number; // in seconds
  resetAt: number; // timestamp in ms when window clears
  currentCount: number;
}

export interface RateLimitUsage {
  key: string;
  limit: number;
  currentCount: number;
  remaining: number;
  retryAfter: number;
  resetAt: number;
  resetInSeconds: number;
}

export class InMemoryRateLimiter {
  private store: Map<string, number[]>;
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests = config.rateLimit.maxRequests, windowSeconds = config.rateLimit.windowSeconds) {
    this.store = new Map<string, number[]>();
    this.maxRequests = maxRequests;
    this.windowMs = windowSeconds * 1000;
  }

  /**
   * Cleans timestamps older than the sliding window.
   */
  private prune(key: string, now: number): number[] {
    const cutoff = now - this.windowMs;
    const timestamps = this.store.get(key) || [];
    const valid = timestamps.filter((t) => t > cutoff);

    if (valid.length === 0) {
      this.store.delete(key);
    } else {
      this.store.set(key, valid);
    }

    return valid;
  }

  /**
   * Consume a rate limit token for the given key.
   */
  consume(key: string, now: number = Date.now()): RateLimitResult {
    const valid = this.prune(key, now);
    const limit = this.maxRequests;

    if (valid.length >= limit) {
      // Oldest request in the current window determines when the next slot opens
      const oldest = valid[0];
      const resetAt = oldest + this.windowMs;
      const retryAfter = Math.max(1, Math.ceil((resetAt - now) / 1000));

      return {
        allowed: false,
        limit,
        remaining: 0,
        retryAfter,
        resetAt,
        currentCount: valid.length,
      };
    }

    // Allowed: record timestamp
    valid.push(now);
    this.store.set(key, valid);

    const oldest = valid[0];
    const resetAt = oldest + this.windowMs;
    const remaining = Math.max(0, limit - valid.length);

    return {
      allowed: true,
      limit,
      remaining,
      retryAfter: 0,
      resetAt,
      currentCount: valid.length,
    };
  }

  /**
   * Inspect current usage without incrementing request count.
   */
  getUsage(key: string, now: number = Date.now()): RateLimitUsage {
    const valid = this.prune(key, now);
    const limit = this.maxRequests;
    const count = valid.length;
    const remaining = Math.max(0, limit - count);

    let resetAt = now + this.windowMs;
    let retryAfter = 0;

    if (valid.length > 0) {
      const oldest = valid[0];
      resetAt = oldest + this.windowMs;
      if (remaining === 0) {
        retryAfter = Math.max(1, Math.ceil((resetAt - now) / 1000));
      }
    }

    const resetInSeconds = Math.max(0, Math.ceil((resetAt - now) / 1000));

    return {
      key,
      limit,
      currentCount: count,
      remaining,
      retryAfter,
      resetAt,
      resetInSeconds,
    };
  }

  /**
   * Reset rate limit state for a key.
   */
  reset(key?: string): void {
    if (key) {
      this.store.delete(key);
    } else {
      this.store.clear();
    }
  }

  /**
   * Get all active keys currently being tracked.
   */
  getAllUsage(now: number = Date.now()): RateLimitUsage[] {
    const keys = Array.from(this.store.keys());
    return keys.map((k) => this.getUsage(k, now));
  }
}

// Attach to globalThis to preserve in-memory state during Next.js Turbopack fast reloads
const globalForLimiter = globalThis as unknown as {
  __rateLimiterInstance?: InMemoryRateLimiter;
};

export const rateLimiter =
  globalForLimiter.__rateLimiterInstance ??
  new InMemoryRateLimiter(config.rateLimit.maxRequests, config.rateLimit.windowSeconds);

if (process.env.NODE_ENV !== "production") {
  globalForLimiter.__rateLimiterInstance = rateLimiter;
}

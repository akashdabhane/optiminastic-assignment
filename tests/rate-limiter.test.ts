import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryRateLimiter } from "../src/lib/rate-limiter.ts";
import { isValidApiKey, PREDEFINED_USERS } from "../src/lib/users.ts";

test("Rate Limiter - Assignment Scenarios", async (t) => {
  await t.test("Scenario 1: First request with a valid API key succeeds", () => {
    const limiter = new InMemoryRateLimiter(10, 60);
    const key = "user_123";
    const startTime = 1000000;

    const result = limiter.consume(key, startTime);
    assert.equal(result.allowed, true);
    assert.equal(result.limit, 10);
    assert.equal(result.remaining, 9);
    assert.equal(result.currentCount, 1);
    assert.equal(result.retryAfter, 0);
  });

  await t.test("Scenario 2: 10 requests within the window all succeed", () => {
    const limiter = new InMemoryRateLimiter(10, 60);
    const key = "user_123";
    const startTime = 1000000;

    for (let i = 1; i <= 10; i++) {
      const res = limiter.consume(key, startTime + i * 100);
      assert.equal(res.allowed, true, `Request #${i} should be allowed`);
      assert.equal(res.remaining, 10 - i, `Remaining should be ${10 - i}`);
      assert.equal(res.currentCount, i);
    }
  });

  await t.test("Scenario 3: 11th request within the same window returns rate limit exceeded", () => {
    const limiter = new InMemoryRateLimiter(10, 60);
    const key = "user_123";
    const startTime = 1000000;

    // Send 10 allowed requests
    for (let i = 0; i < 10; i++) {
      limiter.consume(key, startTime + i * 1000);
    }

    // 11th request within 60s
    const eleventh = limiter.consume(key, startTime + 15000);
    assert.equal(eleventh.allowed, false);
    assert.equal(eleventh.remaining, 0);
    assert.ok(eleventh.retryAfter > 0, "retryAfter should be greater than 0");
    // Since oldest request was at startTime (0s), window is 60s, now is 15s -> remaining time is 45s
    assert.equal(eleventh.retryAfter, 45);
  });

  await t.test("Scenario 4: Request after the window resets succeeds again", () => {
    const limiter = new InMemoryRateLimiter(10, 60);
    const key = "user_123";
    const startTime = 1000000;

    // Exhaust 10 tokens at startTime
    for (let i = 0; i < 10; i++) {
      limiter.consume(key, startTime);
    }

    // Attempt at startTime + 10s -> blocked
    const blocked = limiter.consume(key, startTime + 10000);
    assert.equal(blocked.allowed, false);

    // Fast forward past 60s window (startTime + 61s)
    const afterWindow = limiter.consume(key, startTime + 61000);
    assert.equal(afterWindow.allowed, true, "Should succeed after window resets");
    assert.equal(afterWindow.remaining, 9);
  });

  await t.test("Scenario 5: Unknown and missing API key validation", () => {
    assert.equal(isValidApiKey("user_123"), true);
    assert.equal(isValidApiKey("user_456"), true);
    assert.equal(isValidApiKey("user_789"), true);
    assert.equal(isValidApiKey("unknown_key_999"), false);
    assert.equal(isValidApiKey(""), false);
    assert.equal(isValidApiKey("null"), false);
  });

  await t.test("Scenario 6: Two different API keys have independent rate limits", () => {
    const limiter = new InMemoryRateLimiter(10, 60);
    const userAlice = "user_123";
    const userBob = "user_456";
    const now = 1000000;

    // Exhaust Alice's limit
    for (let i = 0; i < 10; i++) {
      limiter.consume(userAlice, now);
    }

    // Alice is now rate limited
    const aliceCheck = limiter.consume(userAlice, now);
    assert.equal(aliceCheck.allowed, false);

    // Bob makes a request and should succeed with full quota available
    const bobCheck = limiter.consume(userBob, now);
    assert.equal(bobCheck.allowed, true);
    assert.equal(bobCheck.remaining, 9);
    assert.equal(bobCheck.currentCount, 1);
  });

  await t.test("Scenario 7: Rapid repeated requests / burst limit enforcement", () => {
    const limiter = new InMemoryRateLimiter(10, 60);
    const key = "user_123";
    const now = 2000000;

    let successful = 0;
    let rejected = 0;

    // 25 rapid requests in same millisecond
    for (let i = 0; i < 25; i++) {
      const res = limiter.consume(key, now);
      if (res.allowed) {
        successful++;
      } else {
        rejected++;
      }
    }

    assert.equal(successful, 10);
    assert.equal(rejected, 15);
  });

  await t.test("Usage inspection does not consume rate limit tokens", () => {
    const limiter = new InMemoryRateLimiter(10, 60);
    const key = "user_123";
    const now = 3000000;

    limiter.consume(key, now);
    limiter.consume(key, now + 1000);

    const usage1 = limiter.getUsage(key, now + 2000);
    assert.equal(usage1.currentCount, 2);
    assert.equal(usage1.remaining, 8);

    // Call getUsage multiple times
    limiter.getUsage(key, now + 2000);
    limiter.getUsage(key, now + 2000);

    const usage2 = limiter.getUsage(key, now + 2000);
    assert.equal(usage2.currentCount, 2);
    assert.equal(usage2.remaining, 8);
  });
});

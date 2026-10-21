import { NextRequest, NextResponse } from "next/server";
import { isValidApiKey, PREDEFINED_USERS } from "@/lib/users";
import { rateLimiter } from "@/lib/rate-limiter";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const apiKey =
    request.headers.get("x-api-key")?.trim() ||
    url.searchParams.get("key")?.trim();

  // If specific key requested
  if (apiKey) {
    if (!isValidApiKey(apiKey)) {
      return NextResponse.json(
        {
          error: "Invalid API key",
          message: "The provided API key is unknown.",
        },
        { status: 401 }
      );
    }

    const usage = rateLimiter.getUsage(apiKey);
    return NextResponse.json({
      apiKey: usage.key,
      limit: usage.limit,
      used: usage.currentCount,
      remaining: usage.remaining,
      retryAfter: usage.retryAfter,
      resetInSeconds: usage.resetInSeconds,
      resetAt: new Date(usage.resetAt).toISOString(),
      isRateLimited: usage.remaining === 0,
    });
  }

  // If no key specified, return usage for all predefined users
  const allUsage = PREDEFINED_USERS.map((user) => {
    const usage = rateLimiter.getUsage(user.apiKey);
    return {
      userId: user.id,
      userName: user.name,
      apiKey: user.apiKey,
      limit: usage.limit,
      used: usage.currentCount,
      remaining: usage.remaining,
      retryAfter: usage.retryAfter,
      resetInSeconds: usage.resetInSeconds,
      resetAt: new Date(usage.resetAt).toISOString(),
      isRateLimited: usage.remaining === 0,
    };
  });

  return NextResponse.json({ users: allUsage });
}

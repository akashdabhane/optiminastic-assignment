import { NextRequest, NextResponse } from "next/server";
import { isValidApiKey } from "@/lib/users";
import { rateLimiter } from "@/lib/rate-limiter";

export async function GET(request: NextRequest) {
  // Extract API key from X-API-Key header (case-insensitive in standard HTTP, headers.get handles it)
  const apiKey = request.headers.get("x-api-key")?.trim();

  // Validate presence of API key
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "Missing API key",
        message: "Please provide an API key using the 'X-API-Key' header.",
      },
      { status: 401 }
    );
  }

  // Validate API key authenticity
  if (!isValidApiKey(apiKey)) {
    return NextResponse.json(
      {
        error: "Invalid API key",
        message: "The provided API key is unknown or not authorized.",
      },
      { status: 401 }
    );
  }

  // Enforce rate limiting
  const result = rateLimiter.consume(apiKey);

  if (!result.allowed) {
    return NextResponse.json(
      {
        error: "Rate limit exceeded",
        retry_after: result.retryAfter,
      },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(result.limit),
          "X-RateLimit-Remaining": String(result.remaining),
          "Retry-After": String(result.retryAfter),
          "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
        },
      }
    );
  }

  // Successful response
  return NextResponse.json(
    {
      message: "Request successful",
      data: {
        value: "Hello World",
      },
    },
    {
      status: 200,
      headers: {
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
      },
    }
  );
}

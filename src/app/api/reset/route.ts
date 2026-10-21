import { NextRequest, NextResponse } from "next/server";
import { rateLimiter } from "@/lib/rate-limiter";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const key = body?.apiKey;

    rateLimiter.reset(key);

    return NextResponse.json({
      message: key ? `Rate limit reset for ${key}` : "All rate limits reset",
      success: true,
    });
  } catch {
    rateLimiter.reset();
    return NextResponse.json({
      message: "All rate limits reset",
      success: true,
    });
  }
}

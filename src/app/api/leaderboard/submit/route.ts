import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { handleSubmit } from "@/lib/server/leaderboard";
import { clientKey, createRateLimiter } from "@/lib/server/rateLimit";
import { getScoreStore } from "@/lib/server/scoreStore";

export const dynamic = "force-dynamic";

/** Generous for real play (one ranked run per division per day), tight for scripts. */
const limiter = createRateLimiter(10, 10 * 60_000);
const MAX_BODY_BYTES = 32_000;

export async function POST(request: NextRequest) {
  if (!limiter.hit(clientKey(request.headers), Date.now())) {
    return NextResponse.json({ status: "rejected", reason: "too many submissions, try again later" }, { status: 429 });
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return NextResponse.json({ status: "rejected", reason: "submission too large" }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ status: "rejected", reason: "malformed JSON" }, { status: 400 });
  }
  try {
    const result = await handleSubmit(body, { store: getScoreStore(), now: new Date() });
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json({ status: "rejected", reason: "leaderboard unavailable" }, { status: 503 });
  }
}

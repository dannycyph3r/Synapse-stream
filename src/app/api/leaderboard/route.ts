import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { handleQuery } from "@/lib/server/leaderboard";
import { clientKey, createRateLimiter } from "@/lib/server/rateLimit";
import { getScoreStore } from "@/lib/server/scoreStore";

export const dynamic = "force-dynamic";

const limiter = createRateLimiter(120, 60_000);

export async function GET(request: NextRequest) {
  if (!limiter.hit(clientKey(request.headers), Date.now())) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const p = request.nextUrl.searchParams;
  try {
    const result = await handleQuery(
      { period: p.get("period"), date: p.get("date"), division: p.get("division"), playerId: p.get("player") },
      { store: getScoreStore(), now: new Date() },
    );
    return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "leaderboard unavailable" }, { status: 503 });
  }
}

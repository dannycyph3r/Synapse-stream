import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { Leaderboard } from "@/components/Leaderboard";

export const metadata: Metadata = { title: "Leaderboard" };

export default function LeaderboardPage() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <Leaderboard />
      </Suspense>
    </AppShell>
  );
}

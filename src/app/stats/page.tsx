import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { StatsView } from "@/components/StatsView";

export const metadata: Metadata = { title: "Statistics" };

export default function StatsPage() {
  return (
    <AppShell>
      <StatsView />
    </AppShell>
  );
}

import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { Help } from "@/components/Help";

export const metadata: Metadata = { title: "Help" };

export default function HelpPage() {
  return (
    <AppShell>
      <Help />
    </AppShell>
  );
}

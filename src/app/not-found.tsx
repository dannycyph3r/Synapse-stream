import Link from "next/link";
import { AppShell, PageTitle } from "@/components/AppShell";

export default function NotFound() {
  return (
    <AppShell>
      <PageTitle eyebrow="404">This page is not part of SYNAPSE.</PageTitle>
      <Link href="/" className="btn btn-primary mt-8">
        Back to start
      </Link>
    </AppShell>
  );
}

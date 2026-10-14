import Link from "next/link";
import { AppShell } from "@/components/AppShell";

export default function NotFound() {
  return (
    <AppShell>
      <div className="pt-16">
        <p className="label">404</p>
        <h1 className="mt-3 text-display font-semibold">Lost the thread.</h1>
        <p className="mt-6 text-lead text-ink-2">That page is not part of the stream.</p>
        <Link href="/" className="btn btn-primary mt-8">
          Back to the dashboard
        </Link>
      </div>
    </AppShell>
  );
}

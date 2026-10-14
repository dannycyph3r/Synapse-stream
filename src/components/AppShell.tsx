"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./Wordmark";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/stats", label: "Statistics" },
  { href: "/settings", label: "Settings" },
];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="mx-auto w-full max-w-[76rem] px-4 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-4">
        <Wordmark />
        <nav aria-label="Main">
          <ul className="flex flex-wrap items-center gap-x-1 text-small">
            {NAV.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`inline-flex min-h-11 items-center px-2.5 ${
                      active ? "font-semibold text-ink underline decoration-1 underline-offset-[0.45em]" : "text-ink-2 hover:text-ink"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
      <div className="h-px bg-ink" />
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mx-auto mt-24 w-full max-w-[76rem] px-4 pb-10 sm:px-8">
      <div className="rule-top flex flex-wrap justify-between gap-4 pt-5 text-small text-ink-2">
        <p>Synapse Stream is a focus-training game. It is not a medical, diagnostic or therapeutic tool.</p>
        <p className="num">No accounts. No tracking. Records stay on this device.</p>
      </div>
    </footer>
  );
}

/** Standard page frame: header, a single main landmark, footer. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[76rem] px-4 outline-none sm:px-8">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}

/** Mono section label with an editorial index, for example "02 / Daily challenge". */
export function SectionLabel({ index, children, id }: { index: string; children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} className="label flex items-baseline gap-3 !text-ink">
      <span aria-hidden="true" className="text-ink-2">
        {index}
      </span>
      <span>{children}</span>
    </h2>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./Wordmark";

const NAV = [
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/stats", label: "Stats" },
  { href: "/help", label: "Help" },
  { href: "/settings", label: "Settings" },
];

export function NavLinks({ items = NAV }: { items?: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-wrap items-center gap-x-0.5 text-small">
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-11 items-center px-2 ${
                active ? "font-semibold text-ink underline decoration-1 underline-offset-[0.45em]" : "text-ink-2 hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function SiteHeader() {
  return (
    <header className="mx-auto w-full max-w-[64rem] px-4 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-x-4 py-2">
        <Wordmark />
        <nav aria-label="Main" className="-mr-2">
          <NavLinks />
        </nav>
      </div>
      <div className="h-px bg-ink" />
    </header>
  );
}

/** Frame for secondary pages: header, a single main landmark. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[64rem] px-4 pb-20 outline-none sm:px-8">
        {children}
      </main>
    </>
  );
}

/** Page heading for secondary pages: one step below the launch display size. */
export function PageTitle({ eyebrow, children }: { eyebrow?: string; children: React.ReactNode }) {
  return (
    <div className="pt-8 sm:pt-12">
      {eyebrow ? <p className="label">{eyebrow}</p> : null}
      <h1 className="mt-2 text-headline font-semibold">{children}</h1>
    </div>
  );
}

export function SectionLabel({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} className="label !text-ink">
      {children}
    </h2>
  );
}

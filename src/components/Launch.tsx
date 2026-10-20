"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { NavLinks } from "./AppShell";
import { GlitchWord } from "./GlitchWord";
import { Wordmark } from "./Wordmark";
import { utcDateKey } from "@/lib/game/daily";
import { practiceLevel } from "@/lib/game/rules";
import { describeFei, formatFei } from "@/lib/game/scoring";
import { dailyKey } from "@/lib/storage/schema";
import { useStoredData } from "@/lib/storage/store";

/**
 * The launch screen. One statement, one dominant action, and nothing that
 * does not help a player start or resume. Everything else is one quiet link away.
 */
export function Launch() {
  const data = useStoredData();
  const level = data ? practiceLevel(data.settings.practiceLevel) : null;
  const best = data && level ? data.stats[`practice:standard:${level.id}`] : undefined;
  const division = data?.settings.presentation === "spoken" ? "spoken" : "standard";
  const daily = data ? data.daily[dailyKey(utcDateKey(new Date()), division)] : undefined;
  const dailyLabel =
    daily?.status === "finished" ? "Daily challenge · done today" : daily?.status === "in-progress" ? "Daily challenge · interrupted" : "Daily challenge";

  return (
    <div className="flex min-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] flex-col">
      <header className="mx-auto flex w-full max-w-[64rem] items-center justify-between gap-4 px-4 py-2 sm:px-8">
        <Wordmark />
        <nav aria-label="Main" className="-mr-2">
          <NavLinks
            items={[
              { href: "/help", label: "Help" },
              { href: "/settings", label: "Settings" },
            ]}
          />
        </nav>
      </header>

      <main
        id="main"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-[64rem] flex-1 flex-col justify-center px-4 py-10 outline-none sm:px-8 [@media(max-height:500px)]:py-3"
      >
        <h1 aria-label="Hold the pattern." className="max-w-[12ch] text-display font-semibold">
          Hold the <GlitchWord suffix="." />
        </h1>
        <p className="mt-5 max-w-[34rem] text-lead text-ink-2">
          Watch a short sequence of symbols, then rebuild it in order.
        </p>

        <div className="mt-10 grid max-w-[22rem] gap-5 [@media(max-height:500px)]:mt-5 [@media(max-height:500px)]:gap-2">
          <Link href="/play?mode=practice" className="btn btn-primary min-h-14 text-[1.0625rem]">
            Play
            <ArrowRight aria-hidden="true" className="size-5" />
          </Link>
          <div className="grid gap-1">
            <Link href="/play?mode=daily" className="link inline-flex min-h-11 items-center self-start">
              {dailyLabel}
            </Link>
            {best && best.runs > 0 ? (
              <p className="num text-small text-ink-2">
                Best · {level?.label}{" "}
                <span className="text-ink">
                  <span aria-hidden="true">{formatFei(best.bestFeiMs)}</span>
                  <span className="sr-only">{describeFei(best.bestFeiMs)}</span>
                </span>
              </p>
            ) : null}
          </div>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-[64rem] px-4 pb-4 sm:px-8">
        <nav aria-label="More" className="-ml-2">
          <NavLinks
            items={[
              { href: "/leaderboard", label: "Leaderboard" },
              { href: "/stats", label: "Stats" },
            ]}
          />
        </nav>
      </footer>
    </div>
  );
}

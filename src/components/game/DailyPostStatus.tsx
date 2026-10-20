"use client";

import Link from "next/link";
import { RotateCcw } from "lucide-react";
import type { Division } from "@/lib/game/rules";
import { useDailyPost } from "@/lib/leaderboard/dailyPost";

/**
 * Where today's best run stands on the leaderboard. Posting is automatic;
 * this only reports it, and offers a retry when the board cannot be reached.
 */
export function DailyPostStatus({ dateKey, division }: { dateKey: string; division: Division }) {
  const { phase, retry } = useDailyPost(dateKey, division);
  const board = `/leaderboard?division=${division}`;

  let body: React.ReactNode;
  switch (phase.kind) {
    case "posting":
      body = <p className="text-ink-2">Posting your best run to today&apos;s leaderboard.</p>;
      break;
    case "posted":
      body = (
        <>
          <p>
            Your best run is on today&apos;s leaderboard
            {phase.rank ? (
              <>
                {" "}
                at <span className="num font-semibold">#{phase.rank}</span>
              </>
            ) : null}
            .{" "}
            <Link href={board} className="link">
              View leaderboard
            </Link>
          </p>
          {phase.backend?.isPreview ? <p className="mt-1 text-small text-ink-2">{phase.backend.label}</p> : null}
        </>
      );
      break;
    case "unreachable":
      body = (
        <div className="grid gap-3">
          <p>The leaderboard could not be reached. Your runs are saved on this device and will post when it can.</p>
          <button type="button" className="btn btn-secondary justify-self-start" onClick={retry}>
            <RotateCcw aria-hidden="true" className="size-4" />
            Try again
          </button>
        </div>
      );
      break;
    case "rejected":
      body = <p>The leaderboard did not accept this run: {phase.reason}.</p>;
      break;
    case "needs-name":
      body = (
        <p>
          Add a name in{" "}
          <Link href="/settings" className="link">
            Settings
          </Link>{" "}
          to post this run.
        </p>
      );
      break;
    default:
      body = null;
  }
  if (!body) return null;

  return (
    <section aria-labelledby="post-status-h" className="rule-top pt-5">
      <h2 id="post-status-h" className="label !text-ink">
        Leaderboard
      </h2>
      <div className="mt-2" role="status" aria-live="polite">
        {body}
      </div>
    </section>
  );
}

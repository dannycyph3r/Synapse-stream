"use client";

import { practiceLevel } from "@/lib/game/rules";
import { formatFei } from "@/lib/game/scoring";
import type { RecentResult } from "@/lib/storage/schema";

export function categoryLabel(category: string): string {
  const [kind, division, level] = category.split(":");
  const d = division === "spoken" ? "Spoken" : "Visual";
  if (kind === "daily") return `Daily · ${d}`;
  return `Practice · ${level ? practiceLevel(level as never).label : ""} · ${d}`;
}

export function formatWhen(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(ms);
}

const ENDED: Record<RecentResult["endReason"], string> = {
  mismatch: "Mismatch",
  exited: "Exited",
  interrupted: "Interrupted",
};

export function RecentTable({ recent, limit }: { recent: RecentResult[]; limit?: number }) {
  const rows = limit ? recent.slice(0, limit) : recent;
  if (rows.length === 0) {
    return (
      <p className="mt-4 max-w-md text-ink-2">
        No runs yet. Finished runs appear here; nothing is recorded until a run ends.
      </p>
    );
  }
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[30rem] border-collapse text-left">
        <caption className="sr-only">Recent runs, newest first</caption>
        <thead>
          <tr className="border-b border-ink">
            <th scope="col" className="label py-2 pr-4 font-normal">When</th>
            <th scope="col" className="label py-2 pr-4 font-normal">Mode</th>
            <th scope="col" className="label py-2 pr-4 text-right font-normal">FEI</th>
            <th scope="col" className="label py-2 pr-4 text-right font-normal">Held</th>
            <th scope="col" className="label py-2 font-normal">Ended</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-rule">
              <td className="num py-2.5 pr-4 text-small">{formatWhen(r.endedAt)}</td>
              <td className="py-2.5 pr-4 text-small">{categoryLabel(r.category)}</td>
              <td className="num py-2.5 pr-4 text-right">{formatFei(r.feiMs)}</td>
              <td className="num py-2.5 pr-4 text-right">{r.completed}</td>
              <td className="py-2.5 text-small text-ink-2">{ENDED[r.endReason]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

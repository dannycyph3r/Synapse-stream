import { Eye, Volume2 } from "lucide-react";
import type { RunMode } from "@/lib/game/engine";
import { practiceLevel } from "@/lib/game/rules";

/**
 * The run's mode as a compact tag: "Practice · Foundation" or "Daily ·
 * 2026-10-20", with the presentation shown as an icon (an eye for visual, a
 * speaker for spoken). The icon's meaning is kept for screen readers.
 */
export function ModeTag({
  mode,
  className = "",
  compact = false,
}: {
  mode: RunMode;
  className?: string;
  compact?: boolean;
}) {
  const spoken = mode.division === "spoken";
  const Icon = spoken ? Volume2 : Eye;
  // Narrow screens drop "Practice ·": the level name alone is unambiguous there.
  const text =
    mode.kind === "daily" ? (
      `Daily · ${mode.dateKey}`
    ) : (
      <>
        <span className={compact ? "max-sm:hidden" : ""}>Practice · </span>
        {practiceLevel(mode.level).label}
        {mode.customSeed ? ` · ${mode.customSeed}` : ""}
      </>
    );
  return (
    <p className={`label inline-flex min-w-0 items-center gap-2 ${className}`}>
      <Icon aria-hidden="true" className="size-3.5 shrink-0 text-ink" strokeWidth={2} />
      <span className="sr-only">{spoken ? "Spoken" : "Visual"}, </span>
      <span className="truncate">{text}</span>
    </p>
  );
}

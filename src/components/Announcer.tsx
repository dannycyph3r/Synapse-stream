"use client";

/**
 * Screen-reader announcements for state changes that have no focus change of
 * their own (a correct answer, a pause, a saved setting). Two persistent live
 * regions are rendered once in the layout; `announce` writes into them.
 */
import { useSyncExternalStore } from "react";

type Politeness = "polite" | "assertive";

let messages: Record<Politeness, string> = { polite: "", assertive: "" };
const listeners = new Set<() => void>();
let counter = 0;

export function announce(message: string, politeness: Politeness = "polite"): void {
  counter += 1;
  // A trailing zero-width variation makes a repeated message announce again.
  const variant = counter % 2 === 0 ? "" : "​";
  messages = { ...messages, [politeness]: message + variant };
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const empty = { polite: "", assertive: "" };

export function Announcer() {
  const current = useSyncExternalStore(subscribe, () => messages, () => empty);
  return (
    <div className="sr-only">
      <div role="status" aria-live="polite" aria-atomic="true">
        {current.polite}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true">
        {current.assertive}
      </div>
    </div>
  );
}

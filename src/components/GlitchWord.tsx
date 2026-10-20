"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * "pattern", glitching through other scripts and settling back.
 *
 * The sequence plays once on load, in under five seconds (WCAG 2.2.2 needs a
 * pause control for automatic motion lasting longer), and replays when the
 * word is hovered or tapped. Reduced motion shows the word without any motion.
 * The word is decorative: the heading carries "Hold the pattern." as its
 * accessible name, so screen readers never hear the other scripts.
 */
export const PATTERN_WORDS: readonly { text: string; lang: string; dir?: "rtl" }[] = [
  { text: "pattern", lang: "en" },
  { text: "패턴", lang: "ko" },
  { text: "μοτίβο", lang: "el" },
  { text: "पैटर्न", lang: "hi" },
  { text: "パターン", lang: "ja" },
  { text: "узор", lang: "ru" },
  { text: "نمط", lang: "ar", dir: "rtl" },
];

const START_DELAY_MS = 700;
const HOLD_MS = 520;
const GLITCH_MS = 170;

function motionAllowed(): boolean {
  if (typeof window === "undefined") return false;
  return getComputedStyle(document.documentElement).getPropertyValue("--motion-scale").trim() !== "0";
}

export function GlitchWord({ suffix = "" }: { suffix?: string }) {
  const [index, setIndex] = useState(0);
  const [glitching, setGlitching] = useState(false);
  const timers = useRef<number[]>([]);
  const running = useRef(false);

  const clear = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };

  const play = useCallback((delay: number) => {
    if (running.current || !motionAllowed()) return;
    running.current = true;
    const steps = [...PATTERN_WORDS.keys()].slice(1).concat(0);
    let at = delay;
    steps.forEach((next, i) => {
      timers.current.push(window.setTimeout(() => setGlitching(true), at));
      at += GLITCH_MS;
      timers.current.push(
        window.setTimeout(() => {
          setIndex(next);
          setGlitching(false);
          if (i === steps.length - 1) running.current = false;
        }, at),
      );
      at += HOLD_MS;
    });
  }, []);

  useEffect(() => {
    play(START_DELAY_MS);
    return () => {
      clear();
      running.current = false;
    };
  }, [play]);

  // Every script is laid out from the first paint, stacked in one grid cell,
  // so the line box already fits the tallest and widest of them and nothing
  // around the word moves when it changes. Only the active one is visible.
  return (
    <span aria-hidden="true" className="glitch-word" onPointerEnter={() => play(0)} onClick={() => play(0)}>
      {PATTERN_WORDS.map((w, i) => (
        <span
          key={w.lang}
          lang={w.lang}
          dir={w.dir}
          data-active={i === index || undefined}
          data-glitching={(i === index && glitching) || undefined}
          data-text={w.text + suffix}
        >
          {w.text + suffix}
        </span>
      ))}
    </span>
  );
}

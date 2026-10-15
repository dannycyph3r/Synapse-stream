import Link from "next/link";
import { PageTitle } from "./AppShell";
import { TokenGlyph } from "./TokenGlyph";
import { COUNTDOWN_FROM, FEEDBACK_MS, GAP_MS } from "@/lib/game/engine";
import { PRACTICE_LEVELS, SPOKEN_RULES, STANDARD_RULES, difficultyFor } from "@/lib/game/rules";
import { formatDuration, formatFei } from "@/lib/game/scoring";
import { TOKENS } from "@/lib/game/tokens";

const SECTIONS = [
  { id: "how", label: "How it works" },
  { id: "scoring", label: "Scoring" },
  { id: "miss", label: "After a miss" },
  { id: "keys", label: "Keyboard" },
  { id: "modes", label: "Modes" },
  { id: "access", label: "Accessibility" },
  { id: "about", label: "About" },
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-6 border-t border-ink pt-5">
      <h2 id={`${id}-h`} className="text-title font-semibold">
        {title}
      </h2>
      <div className="mt-4 grid max-w-[42rem] gap-4 text-ink-2 [&_strong]:font-semibold [&_strong]:text-ink">{children}</div>
    </section>
  );
}

function ScoringTable() {
  let running = 0;
  const rows = [0, 1, 2, 3, 4].map((c) => {
    const d = difficultyFor(STANDARD_RULES, c);
    running += d.length * d.durationMs;
    return { n: c + 1, ...d, adds: d.length * d.durationMs, total: running };
  });
  return (
    <table className="w-full max-w-[26rem] border-collapse text-left text-ink">
      <caption className="label mb-2 text-left">The first five challenges</caption>
      <thead>
        <tr className="border-b border-ink">
          <th scope="col" className="label py-2 pr-3 font-normal">No.</th>
          <th scope="col" className="label py-2 pr-3 text-right font-normal">Tokens</th>
          <th scope="col" className="label py-2 pr-3 text-right font-normal">Each</th>
          <th scope="col" className="label py-2 pr-3 text-right font-normal">Adds</th>
          <th scope="col" className="label py-2 text-right font-normal">FEI</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.n} className="border-b border-rule">
            <td className="num py-2 pr-3">{String(r.n).padStart(2, "0")}</td>
            <td className="num py-2 pr-3 text-right">{r.length}</td>
            <td className="num py-2 pr-3 text-right">{formatDuration(r.durationMs)}</td>
            <td className="num py-2 pr-3 text-right">{(r.adds / 1000).toFixed(1)} s</td>
            <td className="num py-2 text-right">{formatFei(r.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const KEYS: [string, string][] = [
  ["1 to 8", "Select a token during recall"],
  ["Backspace", "Remove the last token"],
  ["Delete", "Clear the answer"],
  ["Enter", "Submit a complete answer"],
  ["Escape or P", "Pause; Escape again resumes"],
  ["Tab", "Move between controls"],
];

export function Help() {
  const r = STANDARD_RULES;
  return (
    <>
      <PageTitle eyebrow="Help">How to play SYNAPSE</PageTitle>

      <nav aria-label="On this page" className="mt-6">
        <ul className="-ml-2 flex flex-wrap gap-x-1 text-small">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="inline-flex min-h-11 items-center px-2 text-ink-2 underline decoration-1 underline-offset-[0.3em] hover:text-ink">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-8 grid gap-14">
        <Section id="how" title="How it works">
          <p>
            <strong>Observe.</strong> After a {COUNTDOWN_FROM}-2-1 countdown, symbols appear one at a time in the
            square stage. Each stays for its scheduled time, starting at {formatDuration(r.initialDurationMs)}, with a
            brief {formatDuration(GAP_MS)} blank between tokens so a repeated symbol reads as two. The cells under the
            stage fill as tokens pass. After the last token the stage clears.
          </p>
          <p>
            <strong>Rebuild.</strong> Enter the same symbols in the same order using the keypad, the number keys or
            touch. Repeats count as separate positions. Undo removes the last token and Clear removes them all. Submit
            works once every position is filled. There is no time limit for recall.
          </p>
          <p>
            <strong>Continue.</strong> A correct answer banks the challenge into your score. A short line appears for{" "}
            {formatDuration(FEEDBACK_MS)}, then the next sequence starts. Sequences grow by one token every{" "}
            {r.lengthEvery} challenges, up to {r.maxLength}, and speed up by {formatDuration(r.durationStepMs)} every{" "}
            {r.durationEvery} challenges, down to {formatDuration(r.minDurationMs)}.
          </p>
          <ul className="grid grid-cols-4 gap-px bg-rule text-ink sm:grid-cols-8" aria-label="The eight tokens">
            {TOKENS.map((t) => (
              <li key={t.id} className="grid place-items-center gap-1.5 bg-canvas px-1 py-4">
                <TokenGlyph token={t.id} className="size-7" />
                <span className="text-small">{t.label}</span>
                <span className="num text-[0.75rem] text-ink-2">key {t.key}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="scoring" title="Scoring and the Focus Endurance Index">
          <p className="num border border-ink p-4 text-ink">
            FEI = &Sigma; (tokens &times; time per token)
            <br />
            <span className="text-ink-2">over every correctly completed challenge</span>
          </p>
          <p>
            Your <strong>Focus Endurance Index</strong> is the scheduled presentation time you held and rebuilt. A
            challenge counts only when its whole sequence is submitted in the right order. Waiting before you submit,
            pausing, or switching tabs adds nothing: the score comes from the schedule, not the clock. It is shown as
            minutes, seconds and tenths, for example <span className="num text-ink">02:34.5</span>.
          </p>
          <ScoringTable />
          <p>FEI is a game score. It is not a measurement of attention or of any cognitive ability.</p>
        </Section>

        <Section id="miss" title="After a miss">
          <p>
            One incorrect answer ends the run. The results screen then shows <strong>Your pattern</strong> above the{" "}
            <strong>Correct pattern</strong>, aligned by position. Positions that did not match have an inverted
            position number and a heavier outline, and are listed in words, for example &ldquo;Position 3 did not
            match.&rdquo;
          </p>
          <p>
            The correct pattern is shown only after you submit. The failed challenge adds nothing to your score and does
            not change difficulty. Everything you held before it stays banked.
          </p>
        </Section>

        <Section id="keys" title="Keyboard controls">
          <table className="w-full max-w-[30rem] border-collapse text-left text-ink">
            <caption className="sr-only">Keyboard controls</caption>
            <tbody>
              {KEYS.map(([k, v]) => (
                <tr key={k} className="border-b border-rule">
                  <th scope="row" className="num w-36 py-2.5 pr-4 font-normal">
                    {k}
                  </th>
                  <td className="py-2.5 text-ink-2">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>When recall opens, focus moves to the first token key. With a full answer, Enter submits even from a token key.</p>
        </Section>

        <Section id="modes" title="Practice and the daily challenge">
          <p>
            <strong>Practice</strong> is unranked and unlimited, and stays on this device. Choose a starting level in{" "}
            <Link href="/settings" className="link text-ink">
              Settings
            </Link>
            :{" "}
            {PRACTICE_LEVELS.map((l, i) => {
              const d = difficultyFor(STANDARD_RULES, l.offset);
              return (
                <span key={l.id}>
                  {l.label} ({d.length} tokens at {formatDuration(d.durationMs)}){i < PRACTICE_LEVELS.length - 1 ? ", " : "."}
                </span>
              );
            })}{" "}
            Add <span className="num text-ink">?seed=WORD</span> to a practice link to replay the same sequences anywhere.
          </p>
          <p>
            <strong>The daily challenge</strong> gives every player the same sequences for one UTC day, resetting at 00:00
            UTC. You get one ranked attempt per division. It counts from the moment the first sequence appears, and a
            reload finishes it with the challenges already held.
          </p>
          <p id="ranking">
            <strong>Ranking.</strong> Posting a daily run sends your chosen name and the answers you entered, never a
            score. The server rebuilds the day&apos;s sequences, replays your answers and computes the FEI itself, and keeps
            one record per player, division and day. Ties go to more challenges completed, then to whoever posted first.
            Without a configured backend the leaderboard is a labelled preview, not a global ranking.
          </p>
        </Section>

        <Section id="access" title="Accessibility">
          <p>
            <strong>Spoken presentation</strong> says each token name aloud as it appears. Because words need time, its
            fastest pace is {formatDuration(SPOKEN_RULES.minDurationMs)} instead of {formatDuration(r.minDurationMs)}, so it
            is recorded and ranked as its own division.
          </p>
          <p>
            <strong>Reduce motion</strong> removes fades and the dissolve. Token timing does not change, and nothing ever
            flashes. <strong>Theme</strong> offers light and dark. <strong>Sound</strong> adds a quiet, identical tick per
            token and is off by default. All three are in{" "}
            <Link href="/settings" className="link text-ink">
              Settings
            </Link>
            .
          </p>
          <p>
            Every control works by keyboard and has a visible focus outline. Screen readers hear each step: the start of a
            challenge, each token you place, a correct answer, and which positions did not match. You can pause at any time,
            and the sequence is hidden while paused.
          </p>
        </Section>

        <Section id="about" title="About">
          <p>
            SYNAPSE is a focus-training game. It is not a medical, diagnostic or therapeutic tool. There are no accounts,
            analytics or tracking; records and settings stay in this browser.
          </p>
          <p>The short lines shown between rounds are original to SYNAPSE.</p>
        </Section>
      </div>
    </>
  );
}

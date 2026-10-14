# Synapse Stream

**Enter the stream. Hold the pattern.**

A minimalist sequence-memory game for the browser. A short stream of abstract symbols appears one at a time and dissolves; you rebuild it in the same order. Every stream you hold makes the next one longer or faster. One miss ends the run.

Synapse Stream is a focus-training game. It is not a medical, diagnostic or therapeutic tool, and its score is not a measurement of attention or of any cognitive ability.

## What is in it

- **Dashboard.** Personal bests, today's daily challenge with its UTC reset time, recent runs, and a specimen of the eight tokens.
- **Gameplay.** A single dominant stage, an instrument strip (challenge, length, rate, streak, banked FEI), position cells that make repeated tokens legible, and an eight-key keypad. Navigation disappears once a run starts.
- **Results.** Final FEI, comparison with your previous best, challenges completed, longest sequence, highest streak, play again, and a share summary that contains no answers. Practice runs offer an opt-in review of the sequence that ended the run.
- **Leaderboard.** Daily and all-time rankings per division, your own rank pinned when you are outside the top 25, and distinct loading, empty, error and preview states.
- **Statistics** and **Settings.** Local records per mode, a worked scoring example, presentation (visual or spoken), practice level, theme, motion, sound and leaderboard name.

## Run it

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev          # http://localhost:3000
```

Production build:

```bash
npm run build
npm start            # http://localhost:3000
```

No environment variables are needed. See [Leaderboard](#leaderboard) for the optional backend.

## Test it

```bash
npm run typecheck    # TypeScript, strict
npm run lint         # ESLint (next/core-web-vitals and TypeScript rules)
npm test             # Vitest unit tests: engine, scoring, dates, storage, server
npm run build
npm run test:e2e     # Playwright against the production build on port 3100
npm run test:all     # all of the above, in order
```

The browser tests start `next start` on port 3100 with an in-memory leaderboard. Install Playwright's browser once with `npx playwright install chromium`. If that download is unavailable, point the tests at any local Chrome or Chromium:

```bash
CHROMIUM_PATH=/path/to/chrome npm run test:e2e
```

## How a run works

1. **Prepare.** A short rules panel and a 3-2-1 countdown. Once you have seen the rules they fold into a disclosure.
2. **Observe.** Tokens appear one at a time for the scheduled duration, with a 0.3 s blank between tokens so a repeat reads as two. After the last token the stage dissolves.
3. **Recall.** Rebuild the sequence with the keypad, the keys 1 to 8, or touch. Undo and Clear are available; Submit works only when every position is filled. There is no time limit.
4. **Confirm.** A correct answer banks the challenge's FEI and the next stream begins after a short beat. A wrong answer ends the run.
5. **Reset.** A new run resets every counter, timer and selection.

Keyboard: `1` to `8` select tokens, `Backspace` removes the last, `Delete` clears, `Enter` submits, `Escape` or `P` pauses.

## Difficulty

Difficulty is a pure function of the number of challenges completed in the run (`src/lib/game/rules.ts`).

| Rule | Value |
|---|---|
| Starting length | 3 tokens |
| Starting duration | 1.5 s per token |
| Length | +1 after every 2 completed challenges, up to 12 |
| Duration | -0.1 s after every 4 completed challenges, down to 0.6 s |
| After the cap | stays at 12 tokens, 0.6 s |

Practice levels start further along the same curve: Foundation (3 tokens at 1.5 s), Extended (6 at 1.4 s), Deep (9 at 1.2 s). The daily challenge always starts at the beginning.

## Scoring: the Focus Endurance Index

```
FEI = sum over correctly completed challenges of (sequence length x duration per token)
```

The first challenge is worth 3 x 1.5 s = 4.5 s. The formula lives in one place, `src/lib/game/scoring.ts`, and is used by the game, the results screen and the server.

- A challenge contributes only once its whole sequence has been submitted in the right order.
- Time spent waiting to submit, paused or in another tab adds nothing, because the score comes from the schedule rather than a clock. Hiding the tab also pauses any timed phase.
- An incorrect challenge contributes nothing.
- Display is `MM:SS.t`, truncated rather than rounded.

## Modes

**Daily challenge.** Everyone gets the same sequences for the same UTC calendar day. One ranked attempt per division per day. The attempt counts from the moment the first sequence appears; leaving after that asks for confirmation and ends the run. Progress is written to local storage after every challenge, so a reload or closed tab finalises the run from its recorded answers rather than resetting it.

**Practice.** Unranked, unlimited, independent random seeds, separate records per level. A shareable seed is supported: `/play?mode=practice&seed=ORBIT` replays the same sequences on any device.

**Spoken presentation.** For players who cannot rely on sight, each token name is spoken as it appears (the symbol is shown too). Its fastest pace is 1.0 s instead of 0.6 s so words are not cut off, and because the conditions differ it is recorded and ranked as its own division. If the browser cannot synthesise speech, the option is disabled and runs fall back to visual with a notice.

## Daily challenge generation

`src/lib/game/daily.ts` and `src/lib/game/sequence.ts`

- The date key is the UTC calendar day, `YYYY-MM-DD`.
- The seed is `synapse-daily-v1:<date>:<division>`. Divisions have separate sequences so playing one reveals nothing about the other.
- Challenge `i` is generated from its own derived seed, `<seed>#<i>`, with a mulberry32 generator seeded by a cyrb53 string hash. Any challenge can be regenerated without generating the ones before it.
- Tokens may repeat, but never three times in a row.

## Leaderboard

The browser never submits a score. Posting a daily run sends the date, division, an anonymous device id, a display name and **the answers entered**. The server (`src/lib/server/leaderboard.ts`):

1. validates the payload (zod), the display name pattern and the date (today in UTC, or yesterday during the first hour of today),
2. regenerates the day's sequences from the seed and replays the answers with the same comparison and scoring code the game uses,
3. rejects runs that do not verify (wrong lengths, unknown tokens, answers after a mismatch),
4. stores one record per player, per division, per day (a second post returns 409 with the original),
5. rate limits submissions per client address.

Player ids are never returned by the API. Ranking is by FEI, then challenges completed, then earliest post. All-time shows each player's single best day.

### Backends

| Store | When | Shared? |
|---|---|---|
| `file` (default) | no Supabase credentials | No. JSON at `.data/scores.json` on the machine running the app |
| `memory` | `LEADERBOARD_STORE=memory` | No. Lost on restart; used by the browser tests |
| `supabase` | `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set | Yes |

The two preview stores are labelled as previews wherever the leaderboard appears. They are useful for a demo on one machine; they are not a global ranking.

To use Supabase:

1. Run `supabase/migrations/0001_daily_scores.sql`. It creates the table with a unique `(date_key, division, player_id)` constraint, enables Row Level Security, exposes only public columns for reading, and gives browsers no write access.
2. Copy `.env.example` to `.env.local` and set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Both are read only on the server; never prefix them with `NEXT_PUBLIC_`.

The Supabase store is covered by a unit test of its request shapes but has not been run against a live project.

### Anti-cheat limits

These remain and are stated plainly:

- The daily seed is public so the game can run offline and the server can verify runs. A determined player could compute the sequences ahead of time and submit a perfect run. The fix is a server-paced session: a secret per-day seed (HMAC of the date), the server issuing one challenge at a time, and minimum elapsed-time checks per challenge.
- A browser game cannot hide its current sequence from its own developer tools. The UI renders only the token on screen and nothing after the observe phase, and never puts token names in live regions in the visual division, but the data is in memory.
- Without accounts, a player can post again under a new device id. Supabase anonymous auth tied to the record would close this.
- The rate limiter is per server process.

## Accessibility

Targets WCAG 2.2 AA and the AODA's reference to it, checked in the implementation rather than asserted:

- Semantic landmarks, one `h1` per view, a skip link, real tables with captions, fieldsets and legends.
- Every interactive control has an accessible name, a visible 3 px focus outline, and a target of at least 44 px.
- Measured contrast for every token pair in both themes (see the comment at the top of `src/app/globals.css`).
- No colour-only state: correctness, personal bests and status all carry text and shape.
- Status changes are announced through polite and assertive live regions; focus moves to the keypad when recall opens, to the stage between phases, and to the heading on results.
- The keypad is `inert` outside recall, so it cannot be reached or pressed while the sequence plays.
- Timing: recall has no limit. The observe phase is timed because timing is essential to the activity; it can be paused at any time (Escape, P or the Pause button), pausing hides the sequence, and resuming replays the interrupted token in full.
- Reduced motion follows the operating system or the in-app setting. It removes fades and the dissolve; token timing is unchanged. Nothing flashes.
- Reflows at 320 px wide (400% zoom of a 1280 px window) with no sideways scrolling.

The browser suite runs axe-core on every page and every game state in light and dark themes.

## Project structure

```
src/
  app/                    routes: / (dashboard), /play, /leaderboard, /stats, /settings
    api/leaderboard/      GET board, POST submit (thin wrappers)
    globals.css           design tokens, type scale, component classes
  components/
    game/                 GameScreen, SequenceDisplay, TokenInput, FocusMetrics,
                          PrepareScreen, SessionResults, PostScore
    Dashboard, Leaderboard, StatsView, SettingsPanel, AppShell, Dialog, Announcer, TokenGlyph, Wordmark
  hooks/useGameSession.ts timers, visibility, speech, sound and announcements around the engine
  lib/
    game/                 pure, framework-free: tokens, random, rules, sequence, scoring,
                          daily, engine (reducer state machine), verify (run replay)
    storage/              local storage schema with field-level recovery, React store
    leaderboard/          shared types and the browser-side service interface
    server/               leaderboard handlers, score stores, rate limiter
supabase/migrations/      optional backend schema
tests/
  unit/                   Vitest
  e2e/                    Playwright
```

The engine is a reducer over an explicit state machine (`idle -> prepare -> countdown -> observing -> recalling -> feedback -> observing ...`, with `paused` and `ended`). Timed phases advance only on a `tick` that carries the epoch it was scheduled for, and every transition bumps the epoch, so a stale timer can never advance a newer state. That single rule prevents overlapping timers, double submissions and double scoring.

## Privacy

No accounts, analytics or third-party requests. Fonts are bundled. Records and settings stay in local storage. Nothing leaves the device unless you post a daily score.

## Known limitations

- The leaderboard is a preview unless Supabase is configured; the Supabase adapter is untested against a live project.
- Anti-cheat limits as listed above.
- Spoken presentation depends on the browser's speech synthesis voice; timing is tuned for typical English voices.
- Sound is a single synthesised tick per token and a confirmation tone; there is no richer sound design.
- No account system, so records do not follow a player between devices.

## Stack

Next.js 16 (App Router), React 19, TypeScript 6 (strict), Tailwind CSS 4 with CSS custom properties for every token, Lucide icons, Zod 4, Inter and JetBrains Mono via Fontsource, Vitest 5, Playwright 1.64 with axe-core.

# SYNAPSE

**Hold the pattern.**

A minimal sequence-memory game for the browser. A short sequence of abstract symbols appears one at a time and dissolves; you rebuild it in the same order. Every sequence you hold makes the next one longer or faster. One miss ends the run, and the results show your pattern against the correct one.

SYNAPSE is a focus-training game. It is not a medical, diagnostic or therapeutic tool, and its score is not a measurement of attention or of any cognitive ability.

## What is in it

- **Launch screen** (`/`). The wordmark, one statement, a dominant *Begin*, a quiet daily-challenge link, a one-line personal best once one exists, and quiet links to Help, Settings, Leaderboard and Stats. Nothing else.
- **Gameplay** (`/play`). A single dominant stage, a four-figure instrument strip (round, tokens, time per token, FEI), position cells that make repeated tokens legible, and an eight-key keypad. Navigation disappears once a run starts. Returning players go straight from *Begin* to the countdown; first-time players and every daily run see a three-line start screen.
- **Failed-pattern reveal.** After a miss the results lead with which positions did not match, then show *Your pattern* above the *Correct pattern*, aligned by position.
- **Round lines.** A short original line appears after every held round, and a different kind of line after a failed one.
- **Results.** FEI, previous best, rounds held and longest sequence, play again, and a share summary that contains no answers.
- **Help** (`/help`). Every instruction lives here: observe and recall, scoring and FEI, what happens after a miss, keyboard controls, modes and ranking, and accessibility options.
- **Leaderboard**, **Stats** and **Settings**.

The design review that led to the current layout is in [`docs/design-review.md`](docs/design-review.md).

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
npm run check:leaderboard   # read-only check of a configured Supabase project
```

The browser tests start `next start` on port 3100 with an in-memory leaderboard. Install Playwright's browser once with `npx playwright install chromium`. If that download is unavailable, point the tests at any local Chrome or Chromium:

```bash
CHROMIUM_PATH=/path/to/chrome npm run test:e2e
```

## Deploy

### GitHub

The repository is ready to push as is. `.github/workflows/ci.yml` runs on every push to `main` and every pull request:

1. **check:** `npm ci`, typecheck, lint, unit tests and a production build.
2. **e2e:** installs Playwright's Chromium and runs the browser suite against the production build. Traces are uploaded when it fails.

Node is pinned to 22 for CI through `.nvmrc`; `package.json` declares `>=20.9.0`, the minimum for Next.js 16.

### Vercel

1. In Vercel, choose **Add New → Project** and import the GitHub repository.
2. Keep the detected defaults: framework **Next.js**, build command `npm run build`, install command `npm install`, no output directory override. No `vercel.json` is needed.
3. Deploy. With no environment variables, the game, practice, daily challenge, statistics and settings all work fully. The leaderboard runs as a clearly labelled temporary preview.
4. For a real shared leaderboard, follow [Connect Supabase](#connect-supabase), then add `SUPABASE_URL` and `SUPABASE_SECRET_KEY` under **Settings → Environment Variables** for **Production only** and redeploy. Leaving them off Preview keeps pull-request deployments away from real scores. Never give either variable a `NEXT_PUBLIC_` prefix.

Every push to `main` then deploys to production, and every pull request gets a preview URL.

## How a run works

1. **Prepare.** A 3-2-1 countdown. The first practice run and every daily run open on a three-line start screen.
2. **Observe.** Tokens appear one at a time for the scheduled duration, with a 0.3 s blank between tokens so a repeat reads as two. After the last token the stage dissolves.
3. **Recall.** Rebuild the sequence with the keypad, the keys 1 to 8, or touch. Undo and Clear are available; Submit works only when every position is filled. There is no time limit.
4. **Confirm.** A correct answer banks the round's FEI. A 1.6 s beat shows the gain and a short line, while the strip already shows the coming round. A wrong answer ends the run and reveals the failed pattern.
5. **Reset.** A new run resets every counter, timer, selection and failure record.

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

## Failed-pattern reveal

When a submission does not match, the engine's `submit` transition records a `FailureRecord` in game state: the round, its length and duration, the expected sequence, the submitted answer and the 1-based mismatched positions (`src/lib/game/engine.ts`). The results screen renders that record directly. It never reconstructs the comparison from UI state.

- The record only exists after a submission, so the correct pattern is never in the page before the player has answered.
- Score, completed count, streak and difficulty are left exactly as they were; the transition goes straight to `ended`, where every further action is ignored.
- The comparison is a real table: column headers are positions, row headers are *Your pattern* and *Correct pattern*, and every cell carries its token name for screen readers. A mismatch is marked by structure (inverted position number, heavier outline) and named in words, for example "Position 3 did not match." and "At 3 you entered Circle; the pattern had Triangle." Nothing relies on colour.
- Long sequences are split into blocks of six positions, so twelve tokens fit a 320 px screen without sideways scrolling.
- Focus moves to the results heading, which is the mismatch sentence; the assertive live region announces it as well.

This applies to ranked daily runs too. Because every player gets the same daily sequences, a revealed daily pattern could be shared. The daily seed is already public (see [Anti-cheat limits](#anti-cheat-limits)), so this does not open a new class of weakness, but it does make one easier to use.

## Round lines

`src/lib/quotes.ts` holds two pools, one for after a held round and one for after a failed round. Every line is original to SYNAPSE and carries no attribution, so none can be misattributed; Help says so. To add a real quotation, give it a `source` naming the exact work and verify the wording and copyright first.

Selection is deterministic per browser tab. `src/lib/quoteSession.ts` keeps a random session seed and a cursor per pool in `sessionStorage`. `selectQuote(kind, seed, index)` walks a seeded shuffle of the pool, so no line repeats until the pool is exhausted, and a new pass never opens with the line that closed the previous one. A run reads the cursor once at its start; the n-th held round shows line `base + n - 1`.

The success line sits inside the stage during the feedback beat, under the gain, so it cannot move any control. It is also appended to the polite announcement. The failure line sits under the score on the results screen. Neither animates beyond the shared fade, which reduced motion removes.

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
| `file` (default locally) | no Supabase credentials | No. JSON at `.data/scores.json` on the machine running the app |
| `memory` | `LEADERBOARD_STORE=memory` | No. Lost on restart; used by the browser tests |
| `memory` (serverless) | on Vercel (`VERCEL` is set) without Supabase | No. Temporary per server instance; can reset at any time |
| `supabase` | `SUPABASE_URL` plus `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) | Yes |

An explicit `LEADERBOARD_STORE` always wins, so the browser tests (which set `memory`) can never write to a real project configured in `.env.local`.

The preview stores are labelled as previews wherever the leaderboard appears. They are useful for a demo; they are not a global ranking. Vercel's filesystem is read-only and per instance, so a deployment never uses the file store.

### Connect Supabase

1. **Create a project** in your Supabase dashboard (a US East region sits close to Vercel's default functions). Keep the Data API enabled with the `public` schema exposed; both are the defaults.
2. **Create the table** with either:
   - the dashboard: SQL Editor → paste `supabase/migrations/0001_daily_scores.sql` → Run; or
   - the Supabase CLI, from this folder: `supabase login`, `supabase link --project-ref <ref>`, then `supabase db push`.

   The migration is safe to run more than once. It creates the table with a unique `(date_key, division, player_id)` constraint, enables Row Level Security, revokes every browser privilege (including `TRUNCATE`, which RLS does not cover), grants browsers read access to public columns only, and grants the server role explicitly.
3. **Copy two values** from Project Settings: the **Project URL** and a **secret key** (`sb_secret_...`). A legacy `service_role` key also works, but Supabase is retiring those.
4. **Put them in `.env.local`** as `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (see `.env.example`). Optionally add the publishable key as `SUPABASE_PUBLISHABLE_KEY`.
5. **Check the connection:** `npm run check:leaderboard`. It is read-only and reports, in plain words, whether the URL, key, table and browser permissions are right.
6. **Add the same two variables in Vercel** (Production) and redeploy. `https://<your-site>/api/leaderboard` should then report `"kind":"supabase"` and `"isPreview":false`, and the preview banner disappears.

Server keys go only in the `apikey` header for new `sb_secret_` keys (they are not JWTs), and in both `apikey` and `Authorization` for legacy JWT keys. Every Supabase request times out after 8 seconds, so a paused project shows the leaderboard's "could not be reached" state instead of hanging.

How it was verified without a live project: `tests/unit/migration.test.ts` runs the migration in PGlite (Postgres compiled to WebAssembly) with Supabase's roles recreated and checks every privilege; `tests/unit/supabase-integration.test.ts` runs the real store and handlers over HTTP against a stand-in for Supabase's REST layer backed by that database. Neither is Supabase itself, so run `npm run check:leaderboard` once against your project.

Operational notes:

- Free projects pause after a week without activity; restore from the dashboard, or upgrade, if the board goes quiet.
- Ranks are computed from at most the top 1,000 rows per query. Past 1,000 players a day, move ranking into SQL.
- Display names are public. To remove one, delete its row in Table Editor.

### Anti-cheat limits

These remain and are stated plainly:

- The daily seed is public so the game can run offline and the server can verify runs. A determined player could compute the sequences ahead of time and submit a perfect run. The failed-pattern reveal also shows one daily sequence to each player who misses it. The fix is a server-paced session: a secret per-day seed (HMAC of the date), the server issuing one challenge at a time, and minimum elapsed-time checks per challenge.
- A browser game cannot hide its current sequence from its own developer tools. The UI renders only the token on screen and nothing after the observe phase until an answer is submitted, and never puts token names in live regions in the visual division, but the data is in memory.
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

## Mobile

The game is laid out mobile first and checked in the browser suite at 320 x 568, 390 x 844, 844 x 390 and 768 x 1024.

- The stage is sized from the small viewport height (`svh`) minus the measured chrome, so recall fits without scrolling even with the address bar showing, from 320 x 568 up.
- Short landscape screens (height up to 540 px) switch to two columns: stage and cells on the left, keypad on the right.
- `viewport-fit=cover` with `env(safe-area-inset-*)` padding keeps content clear of notches and home indicators; `overscroll-behavior: none` stops pull-to-refresh during play.
- Token keys are about 67 x 68 px on a 320 px screen; buttons are 48 px tall. `touch-action: manipulation` removes double-tap zoom; the engine ignores a second Submit.
- Fixed-height rows (cells, metrics, stage) mean nothing below moves when values or sequence lengths change.

The browser suite runs axe-core on every page and every game state in light and dark themes.

## Project structure

```
src/
  app/                    routes: / (launch), /play, /help, /leaderboard, /stats, /settings
    api/leaderboard/      GET board, POST submit (thin wrappers)
    globals.css           design tokens, type scale, component classes
  components/
    game/                 GameScreen, SequenceDisplay, TokenInput, FocusMetrics,
                          PrepareScreen, SessionResults, PostScore
    game/PatternComparison    the failed-pattern tables
    Launch, Help, Leaderboard, StatsView, SettingsPanel, RecentRuns, AppShell, Dialog, Announcer, TokenGlyph, Wordmark
  hooks/useGameSession.ts timers, visibility, speech, sound and announcements around the engine
  lib/
    game/                 pure, framework-free: tokens, random, rules, sequence, scoring,
                          daily, engine (reducer state machine), verify (run replay), feedback (mismatch copy)
    quotes.ts             round lines and deterministic selection; quoteSession.ts keeps the per-tab cursor
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

No accounts, analytics or third-party requests. Fonts are bundled. Records and settings stay in local storage under `synapse:v1`; records saved under the earlier `synapse-stream:v1` key are migrated once on first load. Nothing leaves the device unless you post a daily score.

## Known limitations

- The leaderboard is a preview unless Supabase is configured; on Vercel without Supabase it is temporary per server instance. The Supabase path is verified against Postgres and a REST stand-in, not yet against a live project; run `npm run check:leaderboard` once connected.
- Anti-cheat limits as listed above.
- Spoken presentation depends on the browser's speech synthesis voice; timing is tuned for typical English voices.
- Sound is a single synthesised tick per token and a confirmation tone; there is no richer sound design.
- No account system, so records do not follow a player between devices.

## Stack

Next.js 16 (App Router), React 19, TypeScript 6 (strict), Tailwind CSS 4 with CSS custom properties for every token, Lucide icons, Zod 4, Inter and JetBrains Mono via Fontsource, Vitest 5, Playwright 1.64 with axe-core.

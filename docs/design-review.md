# SYNAPSE design review, October 2026

Measured on the production build before any change, at 320 x 568 (narrow phone), 390 x 844 (standard phone), 844 x 390 (phone landscape), 768 x 1024 (tablet) and 1280 x 800 (desktop).

## The five highest-impact problems

### 1. The landing page is an analytics dashboard, not a way into the game

- **Problem.** The home route carries four sections (readout, daily panel, recent runs table, token specimen), 5 headings and 173 words. The primary action sits under a four-line display headline and a 40-word paragraph, competing with "How scoring works" and the daily button.
- **Impact.** On a 320 x 568 phone, *Begin session* starts at y = 682, below the fold. In landscape (844 x 390) it starts at y = 459. A first-time player has to scroll past empty `--:--.-` placeholders to start a game.
- **Improvement.** A launch screen: wordmark, one statement, one dominant *Begin*, a single quiet personal-best line, quiet links to the daily challenge, Help and Settings. Statistics, the token specimen and recent runs move off the home page.
- **Where.** `/` (`Dashboard.tsx`, `AppShell.tsx`).
- **Scope.** Cross-platform; worst on mobile.

### 2. A failed round is a dead end

- **Problem.** After a mismatch, a ranked player is never shown what went wrong. In practice the sequence review is collapsed in a `<details>` at the bottom of the results page, in a four-column table.
- **Impact.** The moment the player most wants feedback teaches them nothing. On a 320 px phone the review starts at y = 898, more than a full screen below *Play again*. Players also cannot tell whether they misremembered order or identity.
- **Improvement.** Make the reveal the headline of the results screen. Show "Your pattern" and "Correct pattern", aligned by position, with mismatched positions marked structurally (inverted position number and outline) and in words ("Position 3 did not match"). Keep the failure data in engine state.
- **Where.** `SessionResults.tsx`; `engine.ts` for the failure record.
- **Scope.** Cross-platform.

### 3. The gameplay screen does not fit real phones

- **Problem.** The stage is sized with `40dvh` and ignores the chrome around it. There is no landscape layout and no safe-area padding. Three elements repeat each other: the phase label duplicates the stage caption, the hint line duplicates the 2/3 counter, and the metrics strip shows Challenge and Streak, which are always n and n - 1 because one miss ends the run.
- **Impact.** At 320 x 568 the recall screen is 693 px tall, so the page scrolls under the player's thumb. In landscape it is 636 px tall in a 390 px viewport: the stage is pushed off screen during recall. With the address bar shown, controls can sit under browser UI.
- **Improvement.** Size the stage from the small viewport height minus the measured chrome (`svh`). Add a two-column landscape layout, `env(safe-area-inset-*)` padding and `overscroll-behavior: none`. Remove the duplicated labels, hint line and redundant Streak metric.
- **Where.** `/play` (`GameScreen.tsx`, `FocusMetrics.tsx`, `TokenInput.tsx`, `globals.css`).
- **Scope.** Mobile-specific.

### 4. Instructions are scattered and there is no Help

- **Problem.** The start screen repeats a four-rule grid, a four-figure spec strip and a disclaimer paragraph on every run. Scoring is explained only inside Statistics, ranking only at the foot of the Leaderboard, and the medical disclaimer in every footer.
- **Impact.** Returning players read the same paragraphs every run, and new players do not know where the full rules live. Every page is denser than it needs to be.
- **Improvement.** A single `/help` page that holds everything: observe and recall, scoring and FEI, failure behaviour, keyboard controls, accessibility options, modes, ranking and the disclaimer. Gameplay keeps a three-line first-use prompt only. Returning players go straight from *Begin* to the countdown.
- **Where.** `PrepareScreen.tsx`, `StatsView.tsx`, `Leaderboard.tsx`, `AppShell.tsx`, new `/help`.
- **Scope.** Cross-platform.

### 5. Hierarchy is flat and the results screen does not compose on mobile

- **Problem.** Every secondary page title uses the same 84 px display size as the hero, and numbered section labels add a second layer of decoration. On results, the action row orphans *Share summary* on its own line at 320 and 390 px. "None yet" wraps inside a numeric cell. The feedback beat after a correct round lasts 1.1 s, too short to read anything placed there.
- **Impact.** Nothing tells the player which page is the product and which is supporting material. The results screen looks unfinished on phones.
- **Improvement.** A smaller headline step for secondary pages, plain section labels, and a stacked mobile action layout (full-width primary, paired secondaries). A 1.6 s feedback beat that holds a short quote without moving any control.
- **Where.** All secondary routes, `SessionResults.tsx`, `globals.css`.
- **Scope.** Desktop (titles) and mobile (results).

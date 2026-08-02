---
title: "Spec 01 — Previous-Games Last 5 At Bats"
type: spec
status: done
created: 2026-06-24
surface: js/ui.js (renderLast5 — make the Last-5 card mode-aware)
tags: [dpa, spec, gameplay, ui]
---

# Spec 01 — Previous-Games Last 5 At Bats

> **Status — 2026-06-24: DONE.** `renderLast5()` (`js/ui.js`) now selects the
> Last-5 grid and computes the stats row off `appData.mode` instead of the
> literal `"current"` — exactly as designed below. In Previous Games mode the
> card shows the 5 newest `mode:"previous"` at-bats and `#previousStats` reads
> `Previous: X for Y`; in Current Game mode it is unchanged. CSS/HTML and the
> data model were untouched; the 🔥/🧊 hot/cold icon stays current-game-only.
> Guarded by `tests/unit/last5-mode.test.js` (6 tests); full Vitest suite **372
> passing** (was 366).

> Make the **Last 5 At Bats** card on the game screen follow the Current Game /
> Previous Games toggle. CSS/HTML untouched, data model untouched — one render
> function (`renderLast5`) stops hard-coding `mode === "current"` and instead
> renders whichever mode is active.

## Problem / motivation

The game screen already has a Current Game / Previous Games toggle
(`#currentModeBtn` / `#previousModeBtn`, `index.html:255-256`, driven by
`setMode()` in `js/game.js:74`). When the coach taps **Previous Games**, the
field markers correctly swap — `renderEvents()` (`js/ui.js:105`) reads
`appData.mode` and plots `player.previousEvents` (blue dots) instead of
`player.currentEvents` (red dots).

But the **Last 5 At Bats** card directly below the field **ignores the toggle.**
`renderLast5()` (`js/ui.js:132`) hard-codes the current game:

```js
const last = (player.outcomes || []).filter(o => o.mode === "current").slice(0,5);
```

So in Previous Games mode the field shows the previous-game spray dots while the
Last-5 strip still shows today's at-bats — the card and the field disagree about
which game the coach is looking at. The stats row under the strip
(`#currentStats` / `#previousStats` / `#outStats`, `index.html:392-396`) has the
same problem: `#currentStats` always reads "Current: X for Y" and `#previousStats`
is always blanked (`js/ui.js:167`), even in Previous mode.

The coach wants the whole `.last-card` to track the toggle: in **Previous Games**
mode, show the **5 most recent at-bats from previous games**; back in **Current
Game** mode, return to today's last 5 (the existing behavior, unchanged).

## Outcome

Tapping **Previous Games** while on the game screen:

- **Last 5 grid** (`#last5`) shows the **5 most recent previous-game at-bats** for
  the active hitter — the 5 newest entries with `mode: "previous"` from
  `player.outcomes` — with the same outcome / zone / pitch / hit-or-out marker
  formatting the current view already uses. Fewer than 5 → the remaining cells
  render as the existing empty `–` placeholders.
- **Stats row** reflects previous games: `#previousStats` reads
  `Previous: <hits> for <at-bats>` and `#outStats` reads `Outs: <n>`, all computed
  from `mode: "previous"` outcomes (Walk/Bunt excluded from the at-bat count,
  mirroring the current-mode rule); `#currentStats` is blanked.

Tapping **Current Game** restores today's view exactly as it is now: Last 5 = the
newest `mode: "current"` at-bats, `#currentStats` = `Current: X for Y`,
`#previousStats` blank, `#outStats` = current-game outs.

No marker on the field changes (that already works); no other screen changes.

Concretely, for a hitter who went 1-for-2 with a double today and has six logged
previous-game at-bats:

| Mode | `#last5` shows | Stats row |
|---|---|---|
| Current Game | today's ≤5 at-bats (existing) | `Current: 1 for 2` · `Outs: …` |
| Previous Games | the 5 newest previous-game at-bats | `Previous: <h> for <ab>` · `Outs: …` |

## Where it fits

This is a **single-function change in `js/ui.js`** — `renderLast5(player)`. It is
the one piece of the `.last-card` render that ignores `appData.mode`.

- **Model to follow:** `renderEvents()` (`js/ui.js:105`) is already mode-aware —
  `appData.mode === "current" ? player.currentEvents : player.previousEvents`.
  This spec applies the same conditional to the Last-5 selection and the stats
  totals. The two functions then behave consistently.
- **Data model (unchanged).** `player.outcomes` is the unified, newest-first
  (`unshift`) log of plate appearances; each entry carries `mode` (`"current"` |
  `"previous"`), `outcome`, `type` (`"hit"` | `"noBall"`), `isOut`, optional `x`/
  `y`, and optional `pitch`. Previous-mode outcomes already exist in production:
  `endGame()` stamps each surviving outcome `mode:"previous"` when a game ends
  (`js/game.js:182-190`), and play-log import writes `mode:"previous"` outcomes
  directly (see `PLAY_LOG_IMPORT.md` / `DECISIONS.md` #13). So the previous-mode
  data this card needs is already present — nothing new is recorded, no schema
  changes.
- **Render trigger (unchanged).** `setMode()` already calls `renderGame()`
  (`js/game.js:74`), and `renderGame()` already calls `renderLast5(player)`
  (`js/ui.js:81`). The toggle path is intact; only what `renderLast5` selects
  changes.
- **Must not disturb:** `renderEvents` (already correct), `hitterStatus` (the
  🔥/🧊 icon is deliberately current-game-only — `js/ui.js:85-104` — and stays
  that way; it is **not** part of `.last-card`), the recommendation engine, and
  any markup/CSS. HTML and `styles/main.css` are untouched — the
  `#previousStats` element already exists with its `prev` class
  (`index.html:394`); this spec just stops leaving it blank in Previous mode.

## Design

In `renderLast5(player)` (`js/ui.js:132-169`):

1. **Select by active mode.** Replace the hard-coded `mode === "current"` filter
   with the active mode:

   ```js
   const last = (player.outcomes || [])
     .filter(o => o.mode === appData.mode)
     .slice(0, 5);
   ```

   The grid-rendering loop below it (the `for(let i=0;i<5;i++)` block that pads
   with empty `–` cells and renders outcome / zone / pitch / `X`-or-red-dot) is
   **unchanged** — it already handles hits, outs, and no-ball events generically,
   so previous-game entries render with the same formatting.

2. **Compute the stats row from the active mode.** The three totals currently
   read only current-mode outcomes (`js/ui.js:162-168`). Make the selection mode-
   aware (same Walk/Bunt exclusion from the at-bat count, per `DECISIONS.md` #9):

   ```js
   const abs  = player.outcomes.filter(o => o.mode === appData.mode && o.outcome !== "Walk" && o.outcome !== "Bunt");
   const hits = abs.filter(o => o.type === "hit" && !o.isOut).length;
   const outs = player.outcomes.filter(o => o.mode === appData.mode && o.isOut).length;
   ```

3. **Label per mode.** Write the count into the matching label and blank the
   other so the row never shows both:

   - Current mode: `#currentStats` = `Current: ${hits} for ${abs.length}`,
     `#previousStats` = `""`.
   - Previous mode: `#previousStats` = `Previous: ${hits} for ${abs.length}`,
     `#currentStats` = `""`.
   - Either mode: `#outStats` = `Outs: ${outs}`.

That is the whole change — selection + stats keyed off `appData.mode` instead of
the literal `"current"`. Deterministic, no new data, no markup or CSS edits, and
symmetric with `renderEvents`.

## Step-by-step implementation plan

1. **Read** `CLAUDE.md`, `PROGRESS.md`, `ARCHITECTURE.md`, `PLAYBOOK.md`,
   `DECISIONS.md`, and this spec.
2. **Edit `js/ui.js` `renderLast5`** exactly as in **Design**: (a) filter the
   Last-5 selection by `appData.mode`; (b) compute `abs`/`hits`/`outs` from
   `appData.mode` (keeping the Walk/Bunt exclusion); (c) set `#currentStats` /
   `#previousStats` / `#outStats` per the active mode, blanking the inactive
   label. Leave the grid-rendering loop, the comment block, and every other line
   of the function as-is. No other file changes.
3. **Tests** — add `tests/unit/last5-mode.test.js` (Vitest), extracting
   `renderLast5` against a JSDOM stub of the `#last5`, `#currentStats`,
   `#previousStats`, `#outStats` nodes and a fake `appData`, asserting:
   - Current mode renders only `mode:"current"` at-bats (newest-first, ≤5) and
     `#currentStats` = `Current: X for Y` with `#previousStats` blank
     (regression guard — current behavior is preserved).
   - Previous mode renders the 5 newest `mode:"previous"` at-bats and
     `#previousStats` = `Previous: X for Y` with `#currentStats` blank.
   - A previous-mode `"Walk"`/`"Bunt"` shows in the grid but is excluded from the
     at-bat count (mirrors `DECISIONS.md` #9 for the previous view).
   - Fewer than 5 entries in the active mode → empty `–` placeholder cells fill
     the remainder.
   - `#outStats` counts outs from the active mode only.
4. **E2E (optional, if the gameplay harness is wired)** — extend a game-screen
   spec to tap **Previous Games** and assert the `#last5` cells change to the
   previous-game at-bats and back when **Current Game** is tapped. (The existing
   game E2E specs need the live Memberstack CDN to reach protected screens — see
   `TESTING.md`; the unit test in step 3 is the authoritative guard.)
5. **Run `npm test`** — all prior tests plus the new suite must pass. Do not mark
   the work complete until they do (`TESTING.md`, `CLAUDE.md`).
6. **Commit** `feat: make Last 5 At Bats follow the game-mode toggle` and record
   the change. If this should be captured as a settled design choice, add a
   `DECISIONS.md` entry (the Last-5 card tracks `appData.mode`, mirroring
   `renderEvents`; the 🔥/🧊 hot/cold icon stays current-game-only); set this
   spec's `status:` to `done` and move it into `Completed/`.

## Risks / open questions

- **Hot/cold icon scope.** `hitterStatus()` (the 🔥/🧊 indicator) is intentionally
  current-game-only and is **not** part of `.last-card`. This spec does **not**
  touch it — in Previous mode the icon keeps reflecting today's live trend (or is
  blank). Confirm that the icon should stay current-only; making
  it mode-aware too is a separate, explicit change.
- **Stats label wording.** The spec uses the existing `#previousStats` element and
  the `Previous: X for Y` phrasing to match `Current: X for Y`. If different copy
  is preferred (e.g. "Last games: X for Y"), it's a one-string tweak —
  flag before shipping.
- **Empty previous history.** A hitter with no previous-game outcomes (new team,
  no import, first game) shows five empty `–` cells and `Previous: 0 for 0` in
  Previous mode — the same graceful-empty behavior the current view already has.
  No special-casing needed.
- **Bunt/Walk consistency.** Mirroring `DECISIONS.md` #9, a previous-game Walk or
  Bunt appears in the Last-5 grid but does not count toward the previous at-bat
  total. This keeps the previous view consistent with how the current view treats
  those no-location plate appearances.

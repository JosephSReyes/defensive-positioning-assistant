---
title: "Spec 02 — Strikeout Pitch Type in Last 5 At Bats"
type: spec
status: done
created: 2026-06-24
surface: js/game.js (selectPitch — stop clearing pendingPitch before the capture callback reads it)
depends_on: [[01-previous-games-last-5]]
tags: [dpa, spec, gameplay, ui, pitch]
---

# Spec 02 — Strikeout Pitch Type in Last 5 At Bats

> **Status — 2026-06-24: DONE.** `selectPitch()` (`js/game.js`) no longer calls
> `clearPitchSelection()` before the deferred capture callback runs, so the
> callback reads `pendingPitch` while it still holds the picked code and stores it
> on the outcome. A Strikeout (or Walk) logged in pitch mode now carries its
> `pitch`, so `renderLast5` shows `<span class="ab-pitch">FB</span>` in both
> Current and Previous modes; **Skip** still records no pitch. Display, CSS, and
> the previous-game carry-over (`confirmEndGame` spread) were already correct and
> untouched. Guarded by `tests/unit/strikeout-pitch.test.js` (6 tests); full
> Vitest suite **378 passing** (was 372).

> When pitch mode is **ON** and the coach records a **Strikeout** and picks a
> pitch type, the strikeout already lands in Last 5 At Bats — but with **no pitch
> tag**. The render code for `<span class="ab-pitch">` already exists; the data
> never arrives because `selectPitch()` wipes `pendingPitch` one line before the
> capture callback reads it. Fix that ordering so the strikeout stores its pitch.
> One line in `js/game.js`. No HTML/CSS/data-model change.

## Problem / motivation

The game screen supports pitch-type tracking. The coach toggles **Pitch: ON**
(`#pitchTrackBtn`, `index.html:257`, `togglePitchTrack()` → `appData.trackPitch`).
With tracking on, recording a **Strikeout** (or **Walk**) opens the pitch modal
(`#pitchModal`, `index.html:436-446`) whose buttons call `selectPitch('FB')`,
`selectPitch('CU')`, etc. (`FB`/`CU`/`CH`/`SL`/`OT`).

The intended flow stores the picked pitch on the recorded outcome. The
`recordOutcome` override (`js/game.js:362-392`) sets up a deferred callback:

```js
pitchCaptureCallback = function(){
  player.outcomes.unshift({ outcome:type, type:"noBall", mode:"current", time:Date.now(), isOut:type==="Strikeout" });
  if(pendingPitch) player.outcomes[0].pitch = pendingPitch;   // <-- reads pendingPitch
  ...
  clearPitchSelection();
};
document.getElementById("pitchModal").classList.add("active");
```

But `selectPitch()` (`js/game.js:322-334`) clears the pick **before** running that
callback:

```js
function selectPitch(type){
  pendingPitch = type;
  if(pitchCaptureCallback){
    clearPitchSelection();   // <-- sets pendingPitch = null (js/game.js:336)
    pitchCaptureCallback();  // <-- now reads pendingPitch === null → pitch never stored
    return;
  }
  ...
}
```

`clearPitchSelection()` (`js/game.js:335-340`) sets `pendingPitch = null`, so by the
time the callback runs, `if(pendingPitch)` is false and `player.outcomes[0].pitch`
is **never assigned.** The strikeout is recorded (it shows in Last 5 with its `K`
and the `X` out-marker), but it carries no `pitch`, so `renderLast5()` — which
already renders the tag — has nothing to render:

```js
// js/ui.js:156 (already present, already correct)
<div class="ab-details">${zone ? `<span class="ab-zone">${zone}</span>` : ""}${e.pitch ? `<span class="ab-pitch">${escapeHtml(e.pitch)}</span>` : ""}</div>
```

Net effect: the user logs a fastball strikeout and expects to see
`<span class="ab-pitch">FB</span>` in that at-bat's cell, but the span never
appears because the `pitch` field is missing from the stored outcome.

(The **batted-ball** path is unaffected — `saveHit()` reads `pendingPitch`
directly, `js/game.js:348`, before any clear, so hits already tag their pitch.
The bug is specific to the **strikeout/walk modal** path, which defers through
`pitchCaptureCallback` and trips over the premature `clearPitchSelection()`.)

## Outcome

With **Pitch: ON**, recording a **Strikeout** and tapping a pitch (e.g.
**Fastball**):

- The strikeout appears in the **current game's Last 5 At Bats** for that hitter
  with the pitch tag — its `.ab-details` contains
  `<span class="ab-pitch">FB</span>` — alongside the existing `K` outcome label
  and `X` out-marker.
- **Skip** still works: tapping **Skip** (`skipPitch()`, `js/game.js:393`) records
  the strikeout with **no** pitch tag, exactly as today (Skip is the explicit
  "don't record a pitch" path and must stay that way).
- **Previous-game data shows it too.** When the game ends, `confirmEndGame()`
  (`js/game.js:175-194`) restamps each surviving outcome `{...o, mode:"previous"}`
  — a spread that preserves the `pitch` field. So a previous-game strikeout that
  was logged with a pitch renders the same `<span class="ab-pitch">FB</span>` in
  **Previous Games** mode (the Last-5 card is already mode-aware per
  [[01-previous-games-last-5]]).

Concretely, for a hitter struck out on a fastball with pitch tracking on:

| Mode | `#last5` cell for that at-bat |
|---|---|
| Current Game (just logged) | `K` · `<span class="ab-pitch">FB</span>` · `X` |
| Previous Games (after End Game) | `K` · `<span class="ab-pitch">FB</span>` · `X` |

A walk logged with a pitch behaves the same (walks already route through the same
modal path); it just isn't counted as an at-bat (`DECISIONS.md` #9), unchanged.

## Where it fits

This is a **single-line fix in `js/game.js`** — `selectPitch()`. Everything else
the feature needs is already in place:

- **Capture target (unchanged).** The `recordOutcome` override
  (`js/game.js:362-392`) already builds the strikeout/walk outcome and already
  attempts `if(pendingPitch) player.outcomes[0].pitch = pendingPitch`
  (`js/game.js:370`). It just never sees a non-null `pendingPitch` because of the
  caller's ordering. No change to the override.
- **Render (unchanged).** `renderLast5()` already emits the
  `<span class="ab-pitch">` for any outcome that carries `e.pitch`, for **both**
  modes (`js/ui.js:156`; the loop is mode-agnostic about formatting). No CSS
  change either — `#gameScreen .ab .ab-pitch` already exists
  (`styles/main.css:2054`). Nothing to add to the markup or stylesheet.
- **Previous-game carry-over (unchanged).** `confirmEndGame()` preserves `pitch`
  via the object spread (`js/game.js:183`), and the Last-5 card already follows
  the Current/Previous toggle ([[01-previous-games-last-5]]). So once the pitch is
  actually stored, the previous-game display is automatic.
- **Cleanup still happens.** The capture callback already calls
  `clearPitchSelection()` and nulls `pendingPitch`/`pitchCaptureCallback` at its
  end (`js/game.js:372-374`), and closes the modal. Removing the *early*
  `clearPitchSelection()` does not skip cleanup — it just lets the callback read
  the pick first, then clean up as it already does.
- **Must not disturb:** `saveHit()` (the batted-ball pitch path, already correct,
  `js/game.js:348`), `skipPitch()` (must keep recording **no** pitch), the
  outcome-modal inline pitch row (`#pitchPickRow`, `index.html:417-422`, used when
  selecting a pitch *before* tapping a hit outcome — that path uses the highlight
  branch of `selectPitch`, which this change leaves intact), the at-bat count, the
  hot/cold icon, and the recommendation engine.

## Design

In `selectPitch(type)` (`js/game.js:322-334`), **remove the premature
`clearPitchSelection()`** so the deferred capture callback reads `pendingPitch`
while it still holds the picked value. The callback already clears it afterward.

```js
function selectPitch(type){
  pendingPitch = type;
  // If a capture callback is pending (the strikeout/walk pitch modal is open),
  // confirm with the pitch still set — the callback reads pendingPitch, stores it
  // on the outcome, then clears it. Do NOT clear here or the pitch is lost.
  if(pitchCaptureCallback){
    pitchCaptureCallback();
    return;
  }
  // Otherwise just highlight the selection in the outcome-modal pitch row.
  document.querySelectorAll('#pitchPickRow button[data-pitch]').forEach(function(b){
    b.classList.toggle('selected', b.getAttribute('data-pitch') === type);
  });
}
```

That is the whole change: delete the `clearPitchSelection();` call on
`js/game.js:326`. The callback at `js/game.js:368-378` then runs with
`pendingPitch === type`, assigns `player.outcomes[0].pitch`, slices, nulls
`pendingPitch`/`pitchCaptureCallback`, calls `clearPitchSelection()`, closes the
modal, saves, and re-renders — so the strikeout stores and shows its pitch, and
`skipPitch()` (which sets `pendingPitch = null` *before* invoking the same
callback, `js/game.js:394-397`) still records no pitch.

Deterministic, no new data, no markup/CSS edits, and symmetric with how
`saveHit()` already captures a hit's pitch.

## Step-by-step implementation plan

1. **Read** `CLAUDE.md`, `PROGRESS.md`, `ARCHITECTURE.md`, `PLAYBOOK.md`,
   `DECISIONS.md`, and this spec.
2. **Edit `js/game.js` `selectPitch`** exactly as in **Design**: remove the
   `clearPitchSelection();` call that runs before `pitchCaptureCallback()` in the
   `if(pitchCaptureCallback)` branch (keep the `return;`), and update the comment
   to explain why. Leave the highlight branch, `clearPitchSelection()`,
   `skipPitch()`, the `recordOutcome` override, and `saveHit()` untouched. No other
   file changes.
3. **Tests** — add `tests/unit/strikeout-pitch.test.js` (Vitest), following the
   `new Function` extraction pattern already used by
   `tests/unit/last5-mode.test.js` and `tests/unit/undo-last.test.js`. Extract
   `selectPitch` + the `recordOutcome` override + the module-level `pendingPitch` /
   `pitchCaptureCallback` from `js/game.js`, with stubbed `getActivePlayer`,
   `save`, `renderGame`, and a minimal `#pitchModal` DOM node. Assert:
   - **Strikeout + pitch stores the tag (the fix):** with `appData.trackPitch =
     true`, calling `recordOutcome("Strikeout")` then `selectPitch("FB")` leaves
     `player.outcomes[0]` with `outcome:"Strikeout"`, `isOut:true`,
     `type:"noBall"`, `mode:"current"`, **and `pitch:"FB"`**. (This fails on the
     current code — `pitch` is `undefined` — so it is the regression guard.)
   - **Skip stores no pitch:** `recordOutcome("Strikeout")` then `skipPitch()`
     leaves `player.outcomes[0]` a strikeout with **no** `pitch` key.
   - **Walk + pitch** stores `pitch` the same way (and stays uncounted as an
     at-bat per `DECISIONS.md` #9 — assert via `renderLast5` stats if convenient,
     or just assert the stored `pitch`).
   - **Render (reuse the `renderLast5` extraction from `last5-mode.test.js`):** an
     outcome `{outcome:"Strikeout", type:"noBall", isOut:true, mode:"current",
     pitch:"FB"}` makes `renderLast5` emit `class="ab-pitch"` containing `FB`; the
     same outcome with `mode:"previous"` and `appData.mode === "previous"` renders
     the tag in Previous mode (covers the previous-game requirement).
4. **E2E (optional, if the gameplay harness is wired)** — extend a game-screen
   spec: toggle Pitch ON, record a Strikeout, pick Fastball, and assert the newest
   `#last5` cell contains `.ab-pitch` with text `FB`. (The game E2E specs need the
   live Memberstack CDN to reach protected screens — see `TESTING.md`; the unit
   test in step 3 is the authoritative guard.)
5. **Run `npm test`** — all prior tests plus the new suite must pass. Do not mark
   the work complete until they do (`TESTING.md`, `CLAUDE.md`).
6. **Commit** `fix: store pitch type on strikeouts logged in pitch mode` and
   record the change in `PROGRESS.md`. Set this spec's `status:` to `done`, move it
   into `Completed/`, and update the `specs/README.md` table. If the
   behavior captured as a settled choice, add a one-line `DECISIONS.md` note (the
   strikeout/walk pitch modal stores the picked pitch on the outcome; Skip records
   none; the pitch survives End Game into Previous mode via the `confirmEndGame`
   spread).

## Risks / open questions

- **Outcome-modal inline pitch row.** `selectPitch` is shared by two callers: the
  strikeout/walk **modal** (`#pitchModal`, deferred via `pitchCaptureCallback`)
  and the **inline** pitch row inside the outcome modal (`#pitchPickRow`, used to
  pre-pick a pitch *before* tapping Single/Double/etc.). The inline row takes the
  `else` highlight branch — `pitchCaptureCallback` is null there — so this change
  does not touch it; the hit path keeps reading `pendingPitch` in `saveHit()`.
  Confirm in the test that the highlight branch still runs when no callback is
  pending.
- **Pitch abbreviation vs. full word.** The stored value is the `data-pitch` code
  (`FB`/`CU`/`CH`/`SL`/`OT`), so the tag reads `FB` (matching the
  reference example), not "Fastball". If the full word is wanted in the tag later,
  that's a separate display tweak in `renderLast5`/CSS, not this fix.
- **No backfill.** Strikeouts already logged before this fix have no stored
  `pitch` and will keep rendering without a tag; only at-bats recorded after the
  fix carry it. This matches the play-log/previous-data model (no retroactive
  rewrite) and needs no migration.
- **Walk parity — RESOLVED 2026-06-24.** Initially walks routed through the same
  modal path and could also tag a pitch. It was confirmed that this doesn't make
  sense: a walk isn't *caused* by a single pitch (it's four balls), and "what pitch
  did he walk on" is pitcher-evaluation data, which is out of scope (no pitcher
  features). The `recordOutcome` override (`js/game.js`) now opens the pitch modal
  **only for `Strikeout`** (`type === 'Strikeout'`, was `type !== 'Bunt'`); walks
  record directly with no prompt and no `pitch`. Guarded by the updated
  `tests/unit/strikeout-pitch.test.js` (a walk in pitch mode records immediately,
  carries no `pitch`, and never opens the modal). Shipped in
  `fix: prompt for pitch type on strikeouts only, not walks`.

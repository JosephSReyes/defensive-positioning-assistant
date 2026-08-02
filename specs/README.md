---
title: Defensive Positioning Assistant Feature Specs — index
type: spec
status: living
created: 2026-06-24
tags: [dpa, spec]
---

# `specs/` — Defensive Positioning Assistant feature specs

Design specs for Defensive Positioning Assistant features and changes. Each spec is self-contained and
ends with a **step-by-step implementation plan**. They are written after a read
of the relevant code (`index.html`, `js/`, `styles/main.css`) and the project
docs (`CLAUDE.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `PLAYBOOK.md`,
`PROGRESS.md`).

Pick one, read its spec, follow its plan. Update its `status:`
(`proposed` → `in-progress` → `done`) as work proceeds. When a spec is `done`, move its
file into [`Completed/`](Completed) and update the table below. Larger or
locked decisions a spec settles should also be recorded in `DECISIONS.md`
so they aren't re-litigated.

These specs operate **inside the project's hard rules** (see `CLAUDE.md`): vanilla
JavaScript only, no frameworks, no backend server (Netlify Functions only),
`js/storage.js` is the only file that touches localStorage, no pitcher features,
smallest-safe-change discipline, and the existing UI design is preserved unless a
spec explicitly says otherwise. Every spec ships with tests (`TESTING.md`).

## How a spec is structured

Each spec file follows the same shape:

- **Frontmatter** — `title`, `type: spec`, `status`, `created`, optional
  `surface:` (the files it touches) and `depends_on:`, and `tags`.
- **Problem / motivation** — what's wrong or missing today, grounded in the real
  code.
- **Outcome** — the observable behavior after the change (a concrete
  before/after).
- **Where it fits** — the files, functions, and data model it builds on; what it
  reuses; what it must not disturb.
- **Design** — the precise change. Deterministic enough that the plan is
  mechanical.
- **Step-by-step implementation plan** — numbered, including the tests to add and
  the conventional commit message.
- **Risks / open questions** — anything that could be wrong rather than just
  imprecise.

## The specs

| # | Spec | Area | Touches | One-liner |
|---|---|---|---|---|
| 01 ✅ | [[Completed/01-previous-games-last-5]] | Gameplay · UI | `js/ui.js` | Make the **Last 5 At Bats** card follow the Current Game / Previous Games toggle — show the 5 most recent previous-game at-bats in Previous mode, the current game's in Current mode. **Done** — `renderLast5` keys off `appData.mode`; +6 tests (`tests/unit/last5-mode.test.js`). |
| 02 ✅ | [[Completed/02-strikeout-pitch-in-last5]] | Gameplay · UI · Pitch | `js/game.js` | Store the picked pitch on strikeouts (and walks) logged in **pitch mode** so the `<span class="ab-pitch">FB</span>` tag shows in the Last 5 card (current and previous modes). **Done** — `selectPitch` no longer clears `pendingPitch` before the capture callback reads it; Skip still records none; +6 tests (`tests/unit/strikeout-pitch.test.js`). |
| 03 ◐ | [[03-play-log-import-many-screenshots]] | Play-Log Import · Netlify Function · OpenAI | `netlify/functions/openai-play-log-import.js` | Importing **7+** play-log screenshots failed with "Could not read plays… Try clearer images." Cause: `max_tokens: 4000` truncated the plays JSON array → hard `JSON.parse` threw → 422. **Server fix shipped:** `max_tokens` → 16000 + `salvageObjects()` recovery of truncated arrays (+3 tests, suite 381). **Client-side batching (≤4/request) deferred** — revisit only if the 6 MB payload limit surfaces near 12 images. |

## Conventions

- **Numbering.** Specs are `NN-kebab-name.md`, numbered in creation order. The
  number is permanent; it does not change when a spec moves to `Completed/`.
- **Status lifecycle.** `proposed` (designed, not built) → `in-progress`
  (being built) → `done` (landed + tested; file moved to `Completed/`).
- **Cross-references.** Link related specs with `[[NN-kebab-name]]`. Link the
  authoritative decision in `DECISIONS.md` when a spec locks a design choice.
- **Scope discipline.** A spec describes the **smallest safe change** that
  delivers the outcome. It does not bundle refactors, redesigns, or unrelated
  cleanup — those are their own specs.

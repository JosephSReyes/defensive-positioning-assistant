# Defensive Positioning Assistant — Agent Rules

## Before Every Session

Read these files before doing any work:
1. `AGENTS.md` (this file)
2. `PROGRESS.md`
3. `ARCHITECTURE.md`
4. `PLAYBOOK.md`

Confirm that the current step in `PROGRESS.md` matches the work about to be done. If it does not match, stop and resolve the discrepancy before continuing.

---

## Project Identity

This is **Defensive Positioning Assistant** — a baseball defensive positioning tool for coaches. It is a static Netlify site using vanilla JavaScript, built as a production application.

**Do not mention Codex, AI tools, or Anthropic anywhere in the codebase, comments, commit messages, or documentation that gets pushed to GitHub.**

---

## Hard Rules

- **No frameworks.** This must remain vanilla JavaScript. No React, Vue, Angular, or any other framework.
- **No backend server.** All server-side logic goes through Netlify Functions only.
- **No pitcher features.** Pitchers are explicitly out of scope. Do not activate pitcher-related HTML that already exists in `index.html`.
- **Smallest safe changes only.** Do not refactor, optimize, or clean up code unless the task requires it.
- **Do not rewrite working logic.** Only modify what the task explicitly requires.
- **Do not expose API keys.** `OPENAI_API_KEY` must only ever exist in Netlify Functions. `MEMBERSTACK_PUBLIC_KEY` is the only key that can appear in frontend code.
- **Preserve all existing UI design.** Do not redesign screens or change the visual language without explicit instruction.
- **Read before writing.** Always read the relevant files before editing them.

---

## Commit Rules

- Use conventional commit prefixes: `feat:`, `fix:`, `refactor:`, `chore:`, `test:`, `security:`
- Commit messages must not mention Codex, AI tools, or automation.
- After every step, update `PROGRESS.md` to mark the step complete and record notes.

---

## Testing Rules

- Every step must include tests. See `TESTING.md` for conventions.
- Do not mark a step complete until all tests pass.
- Integration test files use `.integration.test.js` suffix.
- E2E test files use `.spec.js` suffix.
- Never use a literal `<style` string in `.test.js` files — use `new RegExp('<' + 'style...')` instead.

---

## Architecture Rules

- All AI calls go through Netlify Functions — never directly from the browser.
- `js/storage.js` is the only place that reads or writes localStorage.
- Load order in `index.html` must be: storage → utils → game → recommendations → ai → ui → roster-import → memberstack → batter → spray-charts → app.
- Do not add new `<script>` tags without updating the load order.

---

## What This App Does

Defensive Positioning Assistant helps baseball coaches make real-time defensive positioning decisions based on batter contact tendencies. Key flows:

1. **Roster import** — Coach uploads a photo of their roster (handwritten or app screenshot); OpenAI Vision parses it into player names + jersey numbers.
2. **Gameplay** — Coach steps through batters in the lineup; the app shows defensive recommendations based on contact history.
3. **AI Coach Brief** — Tapping the 🤖 AI button sends the current recommendation context to OpenAI and returns a plain-language coaching explanation.
4. **Auth** — Memberstack handles login, signup, and subscription (Stripe connected via Memberstack dashboard).

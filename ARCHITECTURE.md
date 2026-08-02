# Defensive Positioning Assistant — Architecture Reference

## Core Constraint

This application must remain a **static Netlify site using vanilla JavaScript**. No framework migrations. No backend server. All secure operations go through Netlify Functions.

---

## Target Repository Structure

```
defensive-positioning-assistant/
├── index.html
├── styles/
│   └── main.css
├── js/
│   ├── app.js
│   ├── game.js
│   ├── ui.js
│   ├── storage.js
│   ├── recommendations.js
│   ├── ai.js
│   ├── roster-import.js
│   ├── batter.js
│   ├── spray-charts.js
│   ├── utils.js
│   └── memberstack.js
├── netlify/
│   └── functions/
│       ├── openai-roster-import.js
│       └── ai-coach-brief.js
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── .env.example
├── netlify.toml
├── package.json
├── README.md
├── CLAUDE.md
├── PROGRESS.md
├── ARCHITECTURE.md
├── PLAYBOOK.md
├── DECISIONS.md
└── TESTING.md
```

---

## Stack Summary

| Layer      | Technology                        |
|------------|-----------------------------------|
| Frontend   | Static HTML, Vanilla JS, CSS      |
| Hosting    | Netlify                           |
| Functions  | Netlify Functions (Node.js)       |
| AI         | OpenAI (via Netlify Functions)    |
| Auth       | Memberstack                       |
| Billing    | Stripe (via Memberstack)          |
| Unit Tests | Vitest                            |
| E2E Tests  | Playwright                        |
| CI/CD      | GitHub → Netlify                  |

---

## JavaScript Module Responsibilities

| File                  | Responsibility                                                       |
|-----------------------|----------------------------------------------------------------------|
| `app.js`              | Entry point, initialization                                          |
| `game.js`             | Game state and gameplay logic                                        |
| `ui.js`               | DOM manipulation and UI interactions                                 |
| `storage.js`          | Local storage read/write (only file allowed to touch localStorage)   |
| `utils.js`            | Pure helpers (`id`, `escapeHtml`, `pct`, `zoneLabel`, `shortOutcome`) |
| `recommendations.js`  | Defensive positioning recommendation logic                           |
| `ai.js`               | AI coach brief fetch + 1-hour local response cache                   |
| `roster-import.js`    | Roster image upload, OpenAI Vision request, parsing                  |
| `memberstack.js`      | Auth integration and `showScreen` auth guard                         |
| `batter.js`           | Compact batter strip + touch-swipe navigation on `.field-wrap`       |
| `spray-charts.js`     | Team spray chart export                                              |
| `play-log-import.js`  | Play-log import: roster matching, location→`(x,y)`, dedup, summary (planned — see `PLAY_LOG_IMPORT.md`) |

Stripe billing runs through Memberstack's native connection — no `js/stripe.js` or `stripe-webhook.js` Netlify function. See `DECISIONS.md` decision 4.

---

## Netlify Functions Responsibilities

| Function                  | Responsibility                                            |
|---------------------------|-----------------------------------------------------------|
| `openai-roster-import.js` | Receive image, call OpenAI Vision, return parsed roster   |
| `ai-coach-brief.js`       | Receive recommendation context, return coaching brief     |
| `openai-play-log-import.js` | Receive screenshot(s) + roster context, return structured plays for the coach's team only (planned — see `PLAY_LOG_IMPORT.md`) |

Both functions enforce a per-IP in-memory rate limit (10/min roster import, 30/min coach brief). The planned play-log import function will rate-limit at ~5/min (multi-image calls are heavier).

---

## Environment Variables

Defined in `.env.example`. Never exposed to frontend JavaScript.

| Variable                 | Used By                    |
|--------------------------|----------------------------|
| `OPENAI_API_KEY`         | Netlify Functions          |
| `MEMBERSTACK_PUBLIC_KEY` | Frontend (public key only) |

---

## What Must Never Change

- Existing defensive positioning recommendation logic
- Existing UI design direction and mobile-first layout
- Netlify static hosting compatibility
- Vanilla JavaScript — no frameworks

---

## UI Conventions Worth Preserving

- **Fielding movement text is written from the fielder's perspective** (the fielder is facing home plate). A "Right Side" pull therefore tells RF/2B/CF to shift to *their* left toward the first-base line, and a "Left Side" pull tells LF/SS/CF to shift to *their* right toward the third-base line. `back`, `middle`, `Hold bag`, `Guard line`, `Straight up`, and `Stay honest` are perspective-neutral and unchanged. The Netlify Function `ai-coach-brief.js` system prompt enforces the same convention so the AI explanation stays consistent with the on-field tags.
- **Batter navigation** on the game screen supports both the compact-strip chevrons and a horizontal touch swipe on `.field-wrap`. **Swipe left advances** to the next batter; **swipe right** goes to the previous batter. This matches the standard carousel convention — do not flip it without explicit instruction.
- **Bunt is a no-location plate appearance.** The "Bunt" quick button (it replaced the former "HBP" button) records through `recordOutcome()` with no field coordinates, exactly like "Walk." It is intentionally excluded from contact-tendency math, the hot/cold indicator, slump/hot-streak detection, the AI coach-brief context, and the "Current: X for Y" at-bat count — a bunt shows in Last 5 but never skews the live hitter read. See `DECISIONS.md` decision 9.
- **Landing page is self-contained** — `#landingScreen` ships its own scoped inline `<style>` block and a tiny inline `DefensivePositioningProAccess` shim. Memberstack login/signup are triggered via `data-ms-modal="login"` and `data-ms-modal="signup"` attributes on the landing buttons, not via custom forms. Inline `<style>` or `<script>` anywhere *outside* `#landingScreen` is a regression and is asserted against in `tests/unit/app.test.js` and `tests/unit/modules.test.js`.
- **Game-screen fits one screen (no scroll) and the field commands the space.** The game screen is a fixed-height, `overflow:hidden` flex column sized to the full viewport with dynamic viewport units (`height:100dvh`, `100vh` fallback); the `.app` top/bottom padding is zeroed for this screen (`body:has(#gameScreen.active) .app`) so no viewport height is wasted, and `.game-screen` carries a bottom padding that lifts Run Analysis clear of the fixed Bible-verse footer. Everything from the top bar down to the controls is visible at once — the coach never scrolls to reach a button. The field is the **single flexible block**: `#gameScreen .field-wrap` is `flex:1 1 0` and absorbs all the leftover vertical space; every other direct child of `.game-screen` is pinned `flex-shrink:0` so the controls keep their natural height and never spill into a neighbour. The field then draws the **largest square that fits** that leftover space: `#gameScreen .field` is `width:min(100cqw, 100cqh); aspect-ratio:1/1`, where the `cq` units come from `#gameScreen .field-wrap` (`container-type:size`). So the field fills the width on tall phones (e.g. ~86% of the width / 346px on an iPhone 16 Pro) and is only capped by the available height on short ones — always a true square, never taller than its space (so the screen never scrolls), and the diamond never distorts. Controls keep their normal (dvh-clamped) sizes. This lives in the responsive block near the end of `styles/main.css`. See `DECISIONS.md` decisions 10 and 12.
- **The field background is a single SVG drawn in the data's 0–100 coordinate space.** The grass, outfield arc, foul lines, infield dirt, bases, mound, and home plate are one inline `<svg viewBox="0 0 100 100">` inside `#field` (replacing the old ~20-div stack that used three different coordinate conventions and visibly distorted as the aspect ratio changed). `#field` is locked to a **square** aspect ratio and centred in the wrap (wrap background is grass-coloured so the letterbox is invisible). Recorded hits are stored as `x`/`y` in the same 0–100 space, so the SVG geometry, the `zoneLabel` classification polygon (`{50,39},{76,62},{50,84},{21,62}` in `js/utils.js`), and the plotted hit dots are pixel-aligned by construction. Position tags, the hitter card, hit markers, the tap-to-record handler, and swipe are HTML/JS overlays on top of the SVG; they scale with the field via container-query (`cqmin`) units and stay aligned because they share the same 0–100 space. **Do not** reintroduce percentage/pixel-mixed div geometry, and keep the field a fixed aspect ratio — the drawing must stay in the data's coordinate space. `tests/e2e/field-responsive.spec.js` guards the locked ratio and the data/SVG alignment. The `#teamSprayScreen` export field still uses the old div markup and is out of this change. See `DECISIONS.md` decision 11.

---

## Play-Log Import (planned)

A planned feature lets a coach import play-by-play log screenshots from the Team
screen and turn them into **previous-game** Defensive Positioning Assistant data with no manual charting.
The full spec — scope, AI extraction contract, roster matching, location→`(x,y)`
rules, dedup, and import summary — lives in **`PLAY_LOG_IMPORT.md`**;
`PLAYBOOK.md` Step 13 and `DECISIONS.md` decision 13 track it.

> Naming rule: the third-party scorekeeping-app brand name must not appear in the
> codebase, UI, docs, or commit messages. Use "Play-Log Import" / "play-by-play
> log screenshot."

Key architectural points:

- **No new data model.** The importer writes into the **existing** per-player
  arrays. Balls in play → `previousEvents` + an `outcomes` copy
  (`{x,y,time,outcome,isOut,mode:"previous",type:"hit"}`, blue dot for hits/
  errors/FC, X for outs). Walks/HBP/strikeouts → `outcomes` only
  (`type:"noBall"`, no marker). The team spray chart already auto-builds from
  each batter's combined events, satisfying the "update each batter
  first; team chart follows" requirement — **no team-spray rebuild.**
- **0–100 coordinate space.** Imported locations are mapped to the same 0–100
  space `zoneLabel` and the field SVG use, so imported markers are consistent
  with manually charted ones. Ground balls plot in the infield lane; line/fly
  balls plot in the outfield (per the agreed matching rules).
- **New module** `js/play-log-import.js` loads after `roster-import.js`
  (load order: `… → ui → roster-import → play-log-import → memberstack → …`).
- **New function** `netlify/functions/openai-play-log-import.js` receives the
  screenshot(s) + the selected team's name and roster, and returns structured
  plays for the coach's players only. The coach's plays are identified **by the
  roster, not the team name** (the scorekeeping app labels the team differently
  than Defensive Positioning Assistant does, so a team-name filter returns nothing). The model identifies
  the **batter**, never a fielder, and keeps a play only when its batter matches a
  roster player.
- **v1 is import-only** — no review/reassignment UI, no marker editing, and **no
  "Unknown Player" concept of any kind.** Any play that does not confidently
  match a roster player is **dropped** (not parked, not counted). The import
  button on the Team screen is **disabled until the roster has ≥1 player.**

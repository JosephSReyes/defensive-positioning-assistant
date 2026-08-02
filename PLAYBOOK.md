# Defensive Positioning Assistant — Development Playbook

## Before Every Step

At the start of every session, Claude must read:
1. `CLAUDE.md`
2. `PROGRESS.md`
3. `ARCHITECTURE.md`
4. `PLAYBOOK.md` (this file)

At the start of every step prompt, confirm that the current step in `PROGRESS.md` matches the work about to be done. If it does not match, stop and resolve the discrepancy before continuing.

---

## Phase 1 — Repository Stabilization

---

### Step 1 — Initialize GitHub Repository and Preserve Original Prototype

**What:** Creating a safe baseline before making changes.  
**Why:** We need a preserved snapshot of the original app before modifications begin.

**Read before starting:** `CLAUDE.md`, `PROGRESS.md`, `ARCHITECTURE.md`

**Prompt:**
```
Read CLAUDE.md, PROGRESS.md, and ARCHITECTURE.md before beginning.

Initialize the existing Defensive Positioning Assistant project into a clean GitHub-ready structure.

Requirements:
- Preserve the original HTML file exactly as-is.
- Create a /legacy folder.
- Copy the untouched original HTML file into /legacy/ as a frozen snapshot.
  (The /legacy snapshot is not included in this published repository.)
- Create a README.md.
- Create a .gitignore suitable for a Netlify JavaScript project.
- Do not modify any existing functionality.
- Do not refactor the app.
- Add a minimal package.json only if required for testing.
- Explain all created files.

IMPORTANT RULES:
- Preserve all existing functionality.
- Do not rewrite working code.
- Make the smallest safe changes possible.
```

**Verification Checklist:**
- [ ] Original app still opens successfully
- [ ] No UI changes
- [ ] No console errors
- [ ] Git repository initialized
- [ ] Original file preserved in /legacy

**Required Tests:** Smoke — page loads, HTTP 200, field UI renders, no fatal JS errors  
**Commit:** `chore: initialize repository and preserve original prototype`  
**After:** Mark Step 1 complete in `PROGRESS.md`

---

### Step 2 — Set Up Testing Infrastructure

**What:** Adding automated testing.  
**Why:** We need regression protection before modifying functionality.

**Read before starting:** `CLAUDE.md`, `PROGRESS.md`, `TESTING.md`

**Prompt:**
```
Read CLAUDE.md, PROGRESS.md, and TESTING.md before beginning.

Set up testing infrastructure for the existing Defensive Positioning Assistant Netlify application.

Requirements:
- Use Vitest for unit/integration testing.
- Use Playwright for browser end-to-end testing.
- Create a tests folder structure.
- Add npm scripts for running tests.
- Add a simple smoke test verifying the app loads.
- Add a Playwright test that verifies the field UI renders.
- Do not modify app behavior.
- Keep the project compatible with static Netlify hosting.

IMPORTANT RULES:
- Do not refactor existing code.
- Only add testing infrastructure.
- Keep changes minimal.
```

**Verification Checklist:**
- [ ] `npm test` runs successfully
- [ ] Playwright launches successfully
- [ ] Existing app behavior unchanged
- [ ] Smoke tests pass

**Required Tests:** Unit — app initializes. E2E — page loads, field renders, no critical JS errors  
**Commit:** `test: add vitest and playwright testing infrastructure`  
**After:** Update `TESTING.md` with any finalized commands or folder conventions. Mark Step 2 complete in `PROGRESS.md`.

---

### Step 3 — Extract CSS Into Separate File

**What:** Separating styling from HTML.  
**Why:** Improves maintainability without changing behavior.

**Read before starting:** `CLAUDE.md`, `PROGRESS.md`, `ARCHITECTURE.md`

**Prompt:**
```
Read CLAUDE.md, PROGRESS.md, and ARCHITECTURE.md before beginning.

Extract all inline CSS from the existing Defensive Positioning Assistant HTML file into /styles/main.css.

Requirements:
- Preserve all styling exactly.
- Preserve all UI behavior.
- Do not change layout.
- Do not modify JavaScript.
- Link the new stylesheet correctly.
- Verify visual appearance remains identical.
- Add regression tests if needed.

IMPORTANT RULES:
- No redesigns.
- No style changes.
- No logic changes.
- Smallest safe changes only.
```

**Verification Checklist:**
- [ ] UI visually identical
- [ ] Mobile layout unchanged
- [ ] No missing styles
- [ ] No console errors
- [ ] Tests still pass

**Required Tests:** Visual regression — key UI elements render. E2E — navigation and game interactions work  
**Commit:** `refactor: extract inline css into external stylesheet`  
**After:** Mark Step 3 complete in `PROGRESS.md`

---

### Step 4 — Extract JavaScript Into Modular Files

**What:** Separating embedded JavaScript into logical files.  
**Why:** Improves maintainability and enables safer future modifications.

**Read before starting:** `CLAUDE.md`, `PROGRESS.md`, `ARCHITECTURE.md`

**Prompt:**
```
Read CLAUDE.md, PROGRESS.md, and ARCHITECTURE.md before beginning.

Extract the embedded JavaScript from the existing Defensive Positioning Assistant HTML file into modular JavaScript files.

Requirements:
- Create separate files for:
  - ui logic
  - game logic
  - storage logic
  - recommendations logic
  - utility functions
- Preserve all functionality exactly.
- Preserve all UI behavior.
- Do not redesign architecture.
- Do not introduce frameworks.
- Keep everything vanilla JavaScript.
- Update script references correctly.
- Add tests for any extracted functions.

IMPORTANT RULES:
- Do not rewrite logic.
- Do not optimize behavior.
- Only reorganize existing code.
- Smallest safe changes only.
```

**Verification Checklist:**
- [ ] All existing functionality still works
- [ ] No UI regressions
- [ ] No console errors
- [ ] Existing gameplay logic preserved
- [ ] Tests still pass

**Required Tests:** Unit — recommendation functions, game state init, local storage. E2E — gameplay and recommendations  
**Commit:** `refactor: modularize embedded javascript`  
**After:** Mark Step 4 complete in `PROGRESS.md`

---

## Phase 2 — Netlify + Environment Configuration

---

### Step 5 — Add Netlify Configuration and Environment Variables

**What:** Preparing secure deployment configuration.  
**Why:** OpenAI and Stripe integrations require secure server-side secrets.

**Read before starting:** `CLAUDE.md`, `PROGRESS.md`, `ARCHITECTURE.md`

**Prompt:**
```
Read CLAUDE.md, PROGRESS.md, and ARCHITECTURE.md before beginning.

Add Netlify configuration and environment variable support to the Defensive Positioning Assistant application.

Requirements:
- Create netlify.toml.
- Create .env.example.
- Add placeholders for:
  - OPENAI_API_KEY
  - STRIPE_SECRET_KEY
  - MEMBERSTACK_PUBLIC_KEY
- Configure Netlify Functions folder.
- Do not expose secrets client-side.
- Do not modify existing app functionality.
- Add documentation for setup.
- Add tests validating required environment variables exist.

IMPORTANT RULES:
- Keep Netlify compatibility.
- No framework migrations.
- No backend server introduction.
```

**Verification Checklist:**
- [ ] Netlify config recognized
- [ ] Local environment variables load correctly
- [ ] No secrets exposed in frontend
- [ ] Existing app still functions

**Required Tests:** Integration — env vars exist, functions directory resolves  
**Commit:** `chore: add netlify configuration and environment variable support`  
**After:** Mark Step 5 complete in `PROGRESS.md`

---

## Phase 3 — Memberstack Authentication

---

### Step 6 — Integrate Memberstack Authentication

**What:** Adding login and user authentication.  
**Why:** The product requires account access and subscription control.

**Read before starting:** `CLAUDE.md`, `PROGRESS.md`, `ARCHITECTURE.md`, `DECISIONS.md`

**Prompt:**
```
Read CLAUDE.md, PROGRESS.md, ARCHITECTURE.md, and DECISIONS.md before beginning.

Integrate Memberstack authentication into the existing Defensive Positioning Assistant application.

Requirements:
- Add Memberstack frontend integration.
- Support login/logout.
- Preserve existing UI.
- Do not redesign pages.
- Do not break gameplay functionality.
- Ensure sessions persist correctly.
- Add user authentication guards where appropriate.
- Add tests for authentication flows.

IMPORTANT RULES:
- Do not expose secret keys.
- Keep implementation lightweight.
- Preserve mobile-first behavior.
- Smallest safe changes only.
```

**Verification Checklist:**
- [ ] Users can log in
- [ ] Users can log out
- [ ] Sessions persist
- [ ] Existing app still works
- [ ] No UI breakage

**Required Tests:** Integration — login, logout, unauthorized blocking. E2E — login flow on mobile viewport  
**Commit:** `feat: integrate memberstack authentication`  
**After:** Mark Step 6 complete in `PROGRESS.md`

---

## Phase 4 — Stripe Billing

---

### Step 7 — Integrate Stripe Checkout

**What:** Adding subscription payments.  
**Why:** The product requires paid access.

**Read before starting:** `CLAUDE.md`, `PROGRESS.md`, `ARCHITECTURE.md`, `DECISIONS.md`

**Prompt:**
```
Read CLAUDE.md, PROGRESS.md, ARCHITECTURE.md, and DECISIONS.md before beginning.

Integrate Stripe subscription checkout into the existing Defensive Positioning Assistant Netlify application.

Requirements:
- Add Stripe checkout flow.
- Use Netlify Functions for secure Stripe operations.
- Do not expose Stripe secret keys client-side.
- Preserve existing app behavior.
- Add subscription status handling.
- Add webhook support.
- Add tests for checkout flow and webhook handling.

IMPORTANT RULES:
- No backend server outside Netlify Functions.
- No major UI redesign.
- Smallest safe changes only.
```

**Verification Checklist:**
- [ ] Checkout launches
- [ ] Stripe webhook processes successfully
- [ ] Subscription state updates correctly
- [ ] Existing app still works

**Required Tests:** Integration — checkout session, webhook validation, subscription status. E2E — checkout button flow  
**Commit:** `feat: integrate stripe subscription checkout`  
**After:** Mark Step 7 complete in `PROGRESS.md`

---

## Phase 5 — OpenAI Roster Import

---

### Step 8 — Implement AI Roster Import

**What:** Importing roster data from images using OpenAI.  
**Why:** The agreement includes AI-powered roster import.

**Read before starting:** `CLAUDE.md`, `PROGRESS.md`, `ARCHITECTURE.md`, `DECISIONS.md`

**Prompt:**
```
Read CLAUDE.md, PROGRESS.md, ARCHITECTURE.md, and DECISIONS.md before beginning.

Implement AI-powered roster image import using OpenAI and Netlify Functions.

Requirements:
- Users should upload roster images.
- Send images securely to a Netlify Function.
- Use OpenAI Vision capabilities for extraction.
- Parse player names and relevant roster data.
- Return structured JSON.
- Store roster data locally in browser storage.
- Preserve existing UI design.
- Add loading and error states.
- Add tests for parsing and upload flows.

IMPORTANT RULES:
- Do not expose OpenAI API keys client-side.
- Keep implementation lightweight.
- Do not redesign the application.
- Smallest safe changes only.
```

**Verification Checklist:**
- [ ] Image uploads successfully
- [ ] OpenAI response parsed correctly
- [ ] Roster data appears correctly
- [ ] Errors handled safely
- [ ] Existing functionality preserved

**Required Tests:** Unit — parser, invalid response handling. Integration — Netlify Function response. E2E — upload flow  
**Commit:** `feat: add ai-powered roster import`  
**After:** Mark Step 8 complete in `PROGRESS.md`

---

## Phase 6 — AI Coach Brief

---

### Step 9 — Implement AI Coach Brief Explanation

**What:** Adding AI-generated explanations for defensive recommendations.  
**Why:** AI-generated coaching insight is wanted while preserving the existing recommendation structure.

**Read before starting:** `CLAUDE.md`, `PROGRESS.md`, `ARCHITECTURE.md`, `DECISIONS.md`

**Prompt:**
```
Read CLAUDE.md, PROGRESS.md, ARCHITECTURE.md, and DECISIONS.md before beginning.

Implement an AI-generated Coach Brief system for the existing Defensive Positioning Assistant application.

Requirements:
- Preserve existing defensive recommendation logic.
- Add an AI explanation layer.
- When users tap the AI icon, generate a short coaching explanation.
- Use OpenAI through Netlify Functions.
- Keep recommendation outputs consistent with the current app style.
- Preserve existing UI design.
- Add loading and failure handling.
- Cache recent responses locally where appropriate.
- Add tests for recommendation generation and UI interaction.

IMPORTANT RULES:
- Do not replace existing recommendation logic.
- AI should explain recommendations, not fully control them.
- Do not expose OpenAI keys.
- Smallest safe changes only.
```

**Verification Checklist:**
- [ ] AI brief appears correctly
- [ ] Existing recommendations still work
- [ ] UI remains stable
- [ ] Failure states handled safely
- [ ] Tests pass

**Required Tests:** Unit — prompt formatting, response parsing, fallback handling. E2E — AI icon interaction, brief rendering  
**Commit:** `feat: add ai-generated coach brief explanations`  
**After:** Mark Step 9 complete in `PROGRESS.md`

---

## Phase 7 — UI Improvements

---

### Step 10 — Implement Mobile Layout Improvements

**What:** Improving the single-screen mobile experience.  
**Why:** The agreement includes mobile-first UI improvements.

**Read before starting:** `CLAUDE.md`, `PROGRESS.md`, `ARCHITECTURE.md`, `DECISIONS.md`

**Prompt:**
```
Read CLAUDE.md, PROGRESS.md, ARCHITECTURE.md, and DECISIONS.md before beginning.

Improve the existing Defensive Positioning Assistant mobile layout while preserving the current design direction.

Requirements:
- Preserve overall design style.
- Improve single-screen usability.
- Add swipe navigation if appropriate.
- Improve player overlay readability.
- Preserve all existing functionality.
- Ensure responsiveness on mobile devices.
- Add tests for mobile viewport behavior.

IMPORTANT RULES:
- No complete redesign.
- No framework migration.
- Smallest safe changes only.
```

**Verification Checklist:**
- [ ] Layout works on mobile devices
- [ ] Existing interactions preserved
- [ ] Swipe behavior works
- [ ] No overlapping UI
- [ ] Tests pass

**Required Tests:** E2E — mobile viewport rendering, swipe interactions, responsive layout  
**Commit:** `feat: improve mobile single-screen experience`  
**After:** Mark Step 10 complete in `PROGRESS.md`

---

## Phase 8 — Security Hardening

---

### Step 11 — Implement Security Hardening

**What:** Improving security and production safety.  
**Why:** The agreement includes security hardening.

**Read before starting:** `CLAUDE.md`, `PROGRESS.md`, `ARCHITECTURE.md`, `DECISIONS.md`

**Prompt:**
```
Read CLAUDE.md, PROGRESS.md, ARCHITECTURE.md, and DECISIONS.md before beginning.

Implement security hardening for the existing Defensive Positioning Assistant Netlify application.

Requirements:
- Add secure headers through Netlify.
- Ensure API keys are protected.
- Sanitize user input where appropriate.
- Add rate limiting protections where possible.
- Validate AI responses before rendering.
- Improve local storage safety.
- Add tests for security-sensitive behavior.
- Preserve all existing functionality.

IMPORTANT RULES:
- Do not redesign the app.
- Do not break existing functionality.
- Keep implementation lightweight.
```

**Verification Checklist:**
- [ ] No secrets exposed
- [ ] Headers configured
- [ ] Invalid inputs handled safely
- [ ] Existing functionality preserved
- [ ] Tests pass

**Required Tests:** Security — unsafe input, invalid API routes, secrets unavailable client-side  
**Commit:** `security: implement netlify and frontend hardening`  
**After:** Mark Step 11 complete in `PROGRESS.md`

---

## Phase 9 — Play-Log Import (Feature Request)

---

### Step 13 — Implement Play-Log Import

**What:** Let a coach upload play-by-play log screenshots and turn them into
previous-game Defensive Positioning Assistant data (walk/strikeout history + spray markers) with no
manual charting.
**Why:** Feature request. The full, agreed spec is in
**`PLAY_LOG_IMPORT.md`** — read it before starting; it is authoritative for
scope, the AI extraction contract, roster matching, the location→`(x,y)` rules,
dedup, and the import summary.

> Naming rule: do **not** use the third-party scorekeeping-app brand name in
> files, identifiers, UI, comments, or commit messages — use "Play-Log Import."

**Read before starting:** `CLAUDE.md`, `PROGRESS.md`, `ARCHITECTURE.md`,
`DECISIONS.md` (decision 13), `PLAY_LOG_IMPORT.md`

**Scope (locked):**
- v1 is **import-only**: importer + summary. **No** review/reassignment UI, **no**
  marker editing, and **no "Unknown Player" concept of any kind.**
- Writes into the **existing** per-player arrays (`previousEvents` + `outcomes`,
  `mode:"previous"`). No new schema, no team-spray-chart rebuild.
- **Never create a roster player.** Any play that does not confidently match a
  roster player is **dropped** (not parked, not counted). The AI returns only
  plays it is confident about.
- Inject the selected team's name + roster into the OpenAI call so only the
  coach's team's batters are imported (batter only, never a fielder).
- Allow multiple games per import; de-dup overlapping screenshots.
- The `IMPORT PLAY LOG` button is **disabled until the roster has ≥1 player.**

**Build:**
- New module `js/play-log-import.js` (load after `roster-import.js`; update
  `index.html`, `ARCHITECTURE.md`, and the load-order rule in `CLAUDE.md`).
- New function `netlify/functions/openai-play-log-import.js` (server-side key,
  per-IP rate limit, JSON-only structured output; model returns structured
  fields, the browser computes `(x,y)`).
- `IMPORT PLAY LOG` button on the Team screen (multi-file image picker), gated on
  a non-empty roster, with loading/error states and a result summary modal.

**Verification Checklist:**
- [ ] Import button is disabled with an empty roster, enabled after a player is added
- [ ] Screenshots upload and parse; only the coach's team's batters are imported
- [ ] Hits/errors/FC → blue dots; outs → X; walks/HBP/strikeouts → no marker
- [ ] Ground balls plot in the infield lane; line/fly balls in the outfield
- [ ] Unmatched plays are dropped; no roster player is created; no Unknown bucket
- [ ] Overlapping screenshots are de-duplicated
- [ ] Import summary numbers are correct
- [ ] No third-party brand name appears anywhere in the diff
- [ ] Existing functionality preserved

**Required Tests:** Unit — name matching (ambiguous → dropped), result→marker
mapping, location→`(x,y)`, dedup, empty-roster button-disabled state. Integration
— Netlify Function structured output + coach-team filtering. E2E — Team-screen
import button disabled/enabled, then → summary → data written.
**Commit:** `feat: add play-log import`
**After:** Mark Step 13 complete in `PROGRESS.md`; update `PLAY_LOG_IMPORT.md`
status to implemented.

---

## Final Validation Phase

---

### Step 12 — Create Full Regression Test Suite

**What:** Ensuring long-term project stability.  
**Why:** Future changes should not silently break existing functionality.

**Read before starting:** `CLAUDE.md`, `PROGRESS.md`, `TESTING.md`, `DECISIONS.md`

**Prompt:**
```
Read CLAUDE.md, PROGRESS.md, TESTING.md, and DECISIONS.md before beginning.

Create a comprehensive regression test suite for the existing Defensive Positioning Assistant application.

Requirements:
- Verify core gameplay interactions.
- Verify defensive recommendation rendering.
- Verify roster import flow.
- Verify AI coach brief flow.
- Verify login flow.
- Verify Stripe integration flow.
- Verify mobile rendering.
- Verify no fatal console errors.
- Organize tests clearly.
- Add documentation for running tests.

IMPORTANT RULES:
- Preserve all existing functionality.
- Keep tests maintainable.
- Use Playwright and Vitest only.
```

**Verification Checklist:**
- [ ] Full test suite passes
- [ ] Critical user flows covered
- [ ] Mobile flows covered
- [ ] AI flows covered
- [ ] No console errors

**Required Tests:** Full regression — all critical features, no regressions  
**Commit:** `test: add comprehensive regression coverage`  
**After:** Update `TESTING.md` with final test documentation. Mark Step 12 complete in `PROGRESS.md`.

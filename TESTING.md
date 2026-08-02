# Defensive Positioning Assistant — Testing Guide

## Test Infrastructure

| Tool       | Purpose                        | Config File          |
|------------|--------------------------------|----------------------|
| Vitest     | Unit and integration tests     | `vitest.config.js`   |
| Playwright | End-to-end browser tests       | `playwright.config.js` |

---

## Commands

```bash
# Run all unit and integration tests
npm test

# Run unit tests only (watch mode)
npm run test:unit

# Run integration tests only
npm run test:integration

# Run E2E tests (requires local server on port 3000)
npm run test:e2e

# Run E2E tests with UI
npx playwright test --ui

# Install Playwright browsers (first time only)
npx playwright install chromium
```

---

## Folder Structure

```
tests/
├── unit/
│   ├── app.test.js          # Smoke tests, module loading
│   ├── modules.test.js      # Module-level unit tests
│   └── ai-coach-brief.test.js
├── integration/
│   ├── env.integration.test.js        # .env.example, netlify.toml, function stubs
│   ├── memberstack.integration.test.js
│   ├── roster-import.integration.test.js
│   ├── ai-coach-brief.integration.test.js
│   └── security.integration.test.js
└── e2e/
    ├── smoke.spec.js            # Page loads, field renders
    ├── modules.spec.js          # Module serving, HTTP 200
    ├── auth.spec.js             # Login/logout flows
    ├── roster-import.spec.js    # Roster upload flow
    ├── ai-coach-brief.spec.js
    ├── stripe.spec.js           # Memberstack/Stripe plan-on-signup flow
    └── field-responsive.spec.js # Game-screen field stays proportional across phone sizes
```

---

## Conventions

- Integration test files use the `.integration.test.js` suffix to match the Vitest glob pattern.
- E2E test files use the `.spec.js` suffix.
- Never use a literal `<style` string in `.test.js` source — Vite's `import-analysis` plugin misidentifies the file as HTML. Use `new RegExp('<' + 'style...')` instead.
- Vitest must be ^2.0.0 for Node 22 compatibility. Do not downgrade.
- Playwright E2E tests auto-start a local server on port 3000 via `playwright.config.js` webServer config.
- Run `npx playwright install chromium` before the first E2E run on a new machine.

---

## Test Count Milestones

| After Step | Tests Passing |
|------------|---------------|
| Step 2     | 14 (8 unit + 6 E2E) |
| Step 3     | 15            |
| Step 4     | 73 unit + E2E |
| Step 5     | 96            |
| Step 6     | 123           |
| Step 7     | 186           |
| Step 8     | 209           |
| Step 9     | 213           |
| Step 10    | 217           |
| Step 11    | 251           |
| Post-Step-11 follow-up (player perspective + swipe) | 260 |
| Step 13 (Play-Log Import) | 362 vitest (+ 2 E2E) |

---

## Notes

- E2E tests cannot run in the agent sandbox due to bash timeout limits. Run them locally with `npm run test:e2e`.
- The auth / Stripe / AI-coach-brief / gameplay E2E specs reach protected screens through the live Memberstack SDK, so they require **network access** to the Memberstack CDN. In an offline environment they fail because the auth guard redirects away from protected screens — this is environmental, not a code regression. `field-responsive.spec.js` deliberately forces `#gameScreen` active by toggling classes directly, so it needs **no** network or auth and runs anywhere.
- `field-responsive.spec.js` guards the proportional game-screen field sizing (dynamic `dvh` height + viewport-proportional field `min-height`). It asserts the field never collapses into a flat band on short phones (aspect ratio stays under ~2.2 and the field keeps a consistent share of the viewport). Reverting the responsive CSS makes it fail on 360×640 / 390×667 / 414×736.
- The `scripts/serve.cjs` zero-dependency server replaced the `serve` npm package (broken on Node 22).
- Security integration tests live in `tests/integration/security.integration.test.js` and cover headers, rate limiting, and storage schema validation.
- Inline `<style>` and `<script>` blocks are permitted **only** inside `#landingScreen` (scoped landing styles + the `DefensivePositioningProAccess` Memberstack-modal shim). Tests in `tests/unit/app.test.js` and `tests/unit/modules.test.js` walk the HTML and assert that every inline block falls between the `#landingScreen` opening tag and its matching `</section>`. Any new inline block elsewhere will fail the suite.
- The Memberstack-auth integration tests assert the new modal-trigger pattern (`data-ms-modal="login"` / `data-ms-modal="signup"` + `DefensivePositioningProAccess` shim), not the legacy `dpaLoginForm` / `dpaSignupForm` custom forms that were removed during the landing-page redesign.

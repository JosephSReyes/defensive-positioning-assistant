// tests/e2e/stripe.spec.js
// Step 7 — Billing via Memberstack + Stripe
// Verifies that signup passes the plan to Memberstack (which owns billing),
// that no custom Stripe checkout is triggered, and that existing flows work.

const { test, expect } = require('@playwright/test');

const MOBILE = { width: 375, height: 812 };

async function injectMemberstackMock(page, opts = {}) {
  await page.route('**/static.memberstack.com/**', route => route.abort());
  await page.addInitScript((o) => {
    window.__lastSignupOpts = null;
    window.__memberstackMockMember = o.isLoggedIn
      ? { id: 'test-member', email: 'test@example.com' }
      : null;

    window.$memberstackDom = {
      getCurrentMember: function () {
        return Promise.resolve(window.__memberstackMockMember
          ? { data: window.__memberstackMockMember }
          : { data: null });
      },
      loginMemberEmailPassword: function (creds) {
        window.__memberstackMockMember = { id: 'test-member', email: creds.email };
        return Promise.resolve({ data: window.__memberstackMockMember });
      },
      signupMemberEmailPassword: function (signupOpts) {
        window.__lastSignupOpts = signupOpts;
        window.__memberstackMockMember = { id: 'new-member', email: signupOpts.email };
        return Promise.resolve({ data: window.__memberstackMockMember });
      },
      logout: function () {
        window.__memberstackMockMember = null;
        return Promise.resolve();
      },
    };
  }, opts);
}

// ── Plan assignment ────────────────────────────────────────────────────────

test.describe('Billing — Memberstack plan assigned on signup (mobile)', () => {
  test.use({ viewport: MOBILE });

  test('signup passes plans array to signupMemberEmailPassword', async ({ page }) => {
    await injectMemberstackMock(page, { isLoggedIn: false });
    await page.goto('http://localhost:3000');

    await page.fill('#dpaSignupForm input[type="email"]', 'newuser@example.com');
    await page.fill('#dpaSignupForm input[type="password"]', 'password123');
    await page.click('#dpaSignupForm button[type="submit"]');

    await expect(page.locator('#homeScreen')).toHaveClass(/active/, { timeout: 5000 });

    const signupOpts = await page.evaluate(() => window.__lastSignupOpts);
    expect(signupOpts).not.toBeNull();
    expect(Array.isArray(signupOpts.plans)).toBe(true);
    expect(signupOpts.plans.length).toBeGreaterThan(0);
    expect(signupOpts.plans[0]).toHaveProperty('planId');
  });

  test('plan ID passed to Memberstack is pln_pro-ay1e0594', async ({ page }) => {
    await injectMemberstackMock(page, { isLoggedIn: false });
    await page.goto('http://localhost:3000');

    await page.fill('#dpaSignupForm input[type="email"]', 'newuser@example.com');
    await page.fill('#dpaSignupForm input[type="password"]', 'password123');
    await page.click('#dpaSignupForm button[type="submit"]');

    await page.waitForTimeout(500);

    const signupOpts = await page.evaluate(() => window.__lastSignupOpts);
    expect(signupOpts.plans[0].planId).toBe('pln_pro-ay1e0594');
  });

  test('signup goes directly to homeScreen — no custom Stripe redirect', async ({ page }) => {
    await injectMemberstackMock(page, { isLoggedIn: false });

    // Verify no requests are made to any Stripe checkout endpoint
    const stripeApiCalls = [];
    await page.route('**/stripe-create-checkout**', route => {
      stripeApiCalls.push(route.request().url());
      route.abort();
    });

    await page.goto('http://localhost:3000');

    await page.fill('#dpaSignupForm input[type="email"]', 'newuser@example.com');
    await page.fill('#dpaSignupForm input[type="password"]', 'password123');
    await page.click('#dpaSignupForm button[type="submit"]');

    await expect(page.locator('#homeScreen')).toHaveClass(/active/, { timeout: 5000 });
    expect(stripeApiCalls).toHaveLength(0);
  });
});

// ── No custom Stripe frontend code ─────────────────────────────────────────

test.describe('Billing — no custom Stripe frontend module (mobile)', () => {
  test.use({ viewport: MOBILE });

  test('dpaStartCheckout is not defined (stripe.js removed)', async ({ page }) => {
    await injectMemberstackMock(page, { isLoggedIn: false });
    await page.goto('http://localhost:3000');

    const isDefined = await page.evaluate(() => typeof dpaStartCheckout !== 'undefined');
    expect(isDefined).toBe(false);
  });

  test('stripe.js is not loaded by the page', async ({ page }) => {
    await injectMemberstackMock(page, { isLoggedIn: false });

    const stripeScriptLoaded = [];
    await page.route('**/js/stripe.js', route => {
      stripeScriptLoaded.push(route.request().url());
      route.abort();
    });

    await page.goto('http://localhost:3000');
    await page.waitForTimeout(500);

    expect(stripeScriptLoaded).toHaveLength(0);
  });
});

// ── Existing flows unaffected ──────────────────────────────────────────────

test.describe('Billing — existing auth flows unaffected (mobile)', () => {
  test.use({ viewport: MOBILE });

  test('login still goes directly to homeScreen', async ({ page }) => {
    await injectMemberstackMock(page, { isLoggedIn: false });
    await page.goto('http://localhost:3000');

    await page.click('#dpaLoginTab');
    await page.fill('#dpaLoginForm input[type="email"]', 'existing@example.com');
    await page.fill('#dpaLoginForm input[type="password"]', 'password123');
    await page.click('#dpaLoginForm button[type="submit"]');

    await expect(page.locator('#homeScreen')).toHaveClass(/active/, { timeout: 5000 });
  });

  test('already-logged-in user still redirects to homeScreen on load', async ({ page }) => {
    await injectMemberstackMock(page, { isLoggedIn: true });
    await page.goto('http://localhost:3000');

    await expect(page.locator('#homeScreen')).toHaveClass(/active/, { timeout: 4000 });
  });

  test('no JS errors introduced by billing changes', async ({ page }) => {
    await injectMemberstackMock(page, { isLoggedIn: false });

    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('http://localhost:3000');
    await page.waitForTimeout(500);

    expect(errors).toHaveLength(0);
  });
});

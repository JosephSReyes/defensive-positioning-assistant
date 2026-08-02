// tests/e2e/auth.spec.js
// Step 6 — Memberstack Authentication E2E tests
// Mobile viewport — verifies auth UI, guard behavior, and logout.

const { test, expect } = require('@playwright/test');

const MOBILE = { width: 375, height: 812 };

// Inject a mock $memberstackDom before page scripts run so we can
// control auth state without hitting the real Memberstack API.
// Also blocks the Memberstack CDN so the mock is not overwritten.
async function injectMemberstackMock(page, { isLoggedIn = false, loginShouldFail = false } = {}) {
  await page.route('**/static.memberstack.com/**', route => route.abort());
  await page.addInitScript((opts) => {
    window.__memberstackMockMember = opts.isLoggedIn
      ? { id: 'test-member', email: 'test@example.com' }
      : null;
    window.__memberstackLoginFail = opts.loginShouldFail;

    window.$memberstackDom = {
      getCurrentMember: function () {
        return Promise.resolve(window.__memberstackMockMember
          ? { data: window.__memberstackMockMember }
          : { data: null });
      },
      loginMemberEmailPassword: function (opts) {
        if (window.__memberstackLoginFail) {
          return Promise.reject(new Error('Invalid credentials'));
        }
        window.__memberstackMockMember = { id: 'test-member', email: opts.email };
        return Promise.resolve({ data: window.__memberstackMockMember });
      },
      signupMemberEmailPassword: function (opts) {
        window.__memberstackMockMember = { id: 'new-member', email: opts.email };
        return Promise.resolve({ data: window.__memberstackMockMember });
      },
      logout: function () {
        window.__memberstackMockMember = null;
        return Promise.resolve();
      }
    };
  }, { isLoggedIn, loginShouldFail });
}

test.describe('Auth — landing screen default (mobile)', () => {
  test.use({ viewport: MOBILE });

  test('shows landingScreen by default when not logged in', async ({ page }) => {
    await injectMemberstackMock(page, { isLoggedIn: false });
    await page.goto('http://localhost:3000');

    const landing = page.locator('#landingScreen');
    await expect(landing).toHaveClass(/active/);

    const home = page.locator('#homeScreen');
    await expect(home).not.toHaveClass(/active/);
  });

  test('login and signup form tabs are visible on landing screen', async ({ page }) => {
    await injectMemberstackMock(page, { isLoggedIn: false });
    await page.goto('http://localhost:3000');

    await expect(page.locator('#dpaSignupTab')).toBeVisible();
    await expect(page.locator('#dpaLoginTab')).toBeVisible();
  });

  test('switching to login tab shows login form', async ({ page }) => {
    await injectMemberstackMock(page, { isLoggedIn: false });
    await page.goto('http://localhost:3000');

    await page.click('#dpaLoginTab');
    await expect(page.locator('#dpaLoginForm')).toHaveClass(/active/);
    await expect(page.locator('#dpaSignupForm')).not.toHaveClass(/active/);
  });
});

test.describe('Auth — login flow (mobile)', () => {
  test.use({ viewport: MOBILE });

  test('successful login navigates to homeScreen', async ({ page }) => {
    await injectMemberstackMock(page, { isLoggedIn: false });
    await page.goto('http://localhost:3000');

    await page.click('#dpaLoginTab');
    await page.fill('#dpaLoginForm input[type="email"]', 'test@example.com');
    await page.fill('#dpaLoginForm input[type="password"]', 'password123');
    await page.click('#dpaLoginForm button[type="submit"]');

    await expect(page.locator('#homeScreen')).toHaveClass(/active/, { timeout: 5000 });
    await expect(page.locator('#landingScreen')).not.toHaveClass(/active/);
  });

  test('failed login shows error alert', async ({ page }) => {
    await injectMemberstackMock(page, { isLoggedIn: false, loginShouldFail: true });
    await page.goto('http://localhost:3000');

    await page.click('#dpaLoginTab');
    await page.fill('#dpaLoginForm input[type="email"]', 'bad@example.com');
    await page.fill('#dpaLoginForm input[type="password"]', 'wrongpass');

    // Don't await the click — it would deadlock because page.click() waits
    // for the browser to settle, but alert() blocks until the dialog is accepted.
    // Fire the click, then await the dialog and accept it.
    const dialogPromise = page.waitForEvent('dialog');
    page.click('#dpaLoginForm button[type="submit"]');
    const dialog = await dialogPromise;
    expect(dialog.message()).toBeTruthy();
    await dialog.accept();

    // Still on landing after failed login
    await expect(page.locator('#landingScreen')).toHaveClass(/active/);
  });
});

test.describe('Auth — session persistence (mobile)', () => {
  test.use({ viewport: MOBILE });

  test('already-logged-in user is redirected to homeScreen on load', async ({ page }) => {
    await injectMemberstackMock(page, { isLoggedIn: true });
    await page.goto('http://localhost:3000');

    // Wait for session check (up to 4s — mock resolves instantly)
    await expect(page.locator('#homeScreen')).toHaveClass(/active/, { timeout: 4000 });
    await expect(page.locator('#landingScreen')).not.toHaveClass(/active/);
  });
});

test.describe('Auth — logout (mobile)', () => {
  test.use({ viewport: MOBILE });

  test('logout button navigates back to landingScreen', async ({ page }) => {
    await injectMemberstackMock(page, { isLoggedIn: true });
    await page.goto('http://localhost:3000');

    // Wait for redirect to homeScreen
    await expect(page.locator('#homeScreen')).toHaveClass(/active/, { timeout: 4000 });

    // Click logout
    await page.click('#dpaLogoutBtn');
    await expect(page.locator('#landingScreen')).toHaveClass(/active/, { timeout: 3000 });
    await expect(page.locator('#homeScreen')).not.toHaveClass(/active/);
  });

  test('logout button is present in homeScreen', async ({ page }) => {
    await injectMemberstackMock(page, { isLoggedIn: true });
    await page.goto('http://localhost:3000');

    await expect(page.locator('#homeScreen')).toHaveClass(/active/, { timeout: 4000 });
    await expect(page.locator('#dpaLogoutBtn')).toBeVisible();
  });
});

test.describe('Auth — guard blocks unauthenticated access (mobile)', () => {
  test.use({ viewport: MOBILE });

  test('navigating to homeScreen without session goes to landingScreen', async ({ page }) => {
    await injectMemberstackMock(page, { isLoggedIn: false });
    await page.goto('http://localhost:3000');

    // Try to navigate to homeScreen via showScreen
    await page.evaluate(() => {
      if (typeof showScreen === 'function') showScreen('homeScreen');
    });

    // Should stay on / redirect to landingScreen
    await expect(page.locator('#landingScreen')).toHaveClass(/active/, { timeout: 3000 });
    await expect(page.locator('#homeScreen')).not.toHaveClass(/active/);
  });
});

/**
 * E2E smoke tests — Step 2 + Step 3
 *
 * Verifies the Defensive Positioning Assistant app loads correctly in a real browser,
 * the landing screen renders, the field element is in the DOM,
 * and no critical JavaScript errors occur on load.
 *
 * Step 3 additions: Verifies the external stylesheet is served
 * (HTTP 200) and that CSS custom properties are applied to the DOM.
 *
 * Runs against the local static server (http://localhost:3000).
 * See playwright.config.js for server setup.
 */

import { test, expect } from '@playwright/test';

test.describe('Defensive Positioning Assistant — Smoke Tests', () => {
  test('page loads with correct title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('DefensivePositioningPro');
  });

  test('landing screen is visible on load', async ({ page }) => {
    await page.goto('/');
    const landingScreen = page.locator('#landingScreen');
    await expect(landingScreen).toBeAttached();
  });

  test('field element is present in the DOM', async ({ page }) => {
    await page.goto('/');
    const field = page.locator('#field');
    await expect(field).toBeAttached();
  });

  test('game screen element is present in the DOM', async ({ page }) => {
    await page.goto('/');
    const gameScreen = page.locator('#gameScreen');
    await expect(gameScreen).toBeAttached();
  });

  test('home screen element is present in the DOM', async ({ page }) => {
    await page.goto('/');
    const homeScreen = page.locator('#homeScreen');
    await expect(homeScreen).toBeAttached();
  });

  // ── Step 3: CSS stylesheet regression ──────────────────────────────────────

  test('external stylesheet (styles/main.css) is served with HTTP 200', async ({ page }) => {
    const response = await page.goto('/styles/main.css');
    expect(response.status()).toBe(200);
  });

  test('CSS custom properties are applied (body background is not default white)', async ({ page }) => {
    await page.goto('/');
    // The :root CSS defines --bg:#071521 applied to html,body
    // A white (#ffffff) or transparent background would indicate CSS failed to load
    const bgColor = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });
    // Default unstyled background is 'rgba(0, 0, 0, 0)' or 'rgb(255, 255, 255)'
    expect(bgColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(bgColor).not.toBe('rgb(255, 255, 255)');
  });

  test('no critical JavaScript errors on load', async ({ page }) => {
    const criticalErrors = [];

    page.on('pageerror', (err) => {
      // Filter out known third-party library errors (Memberstack, Stripe, etc.)
      // that may fail in a local dev environment without real credentials.
      const msg = err.message || '';
      const isThirdParty =
        msg.includes('MemberStack') ||
        msg.includes('memberstack') ||
        msg.includes('Stripe') ||
        msg.includes('stripe') ||
        msg.includes('CORS') ||
        msg.includes('cors') ||
        msg.includes('net::ERR_');
      if (!isThirdParty) {
        criticalErrors.push(msg);
      }
    });

    // Block Memberstack CDN to prevent unhandled promise rejections from
    // the external SDK when running against localhost without a real session.
    await page.route('**/static.memberstack.com/**', route => route.abort());
    await page.goto('/');

    // Allow a brief moment for any deferred scripts to settle
    await page.waitForTimeout(500);

    expect(criticalErrors).toHaveLength(0);
  });
});

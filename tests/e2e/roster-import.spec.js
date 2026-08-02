// tests/e2e/roster-import.spec.js
// Step 8 — AI Roster Import E2E tests
// Verifies the image upload flow using a mocked API response.

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');

const MOBILE = { width: 375, height: 812 };

// Reuse the same Memberstack mock from auth tests
async function injectMemberstackMock(page) {
  await page.route('**/static.memberstack.com/**', route => route.abort());
  await page.addInitScript(() => {
    window.$memberstackDom = {
      getCurrentMember: () => Promise.resolve({ data: { id: 'test-member', email: 'test@test.com' } }),
      loginMemberEmailPassword: (opts) => Promise.resolve({ data: { id: 'test-member', email: opts.email } }),
      signupMemberEmailPassword: (opts) => Promise.resolve({ data: { id: 'new-member', email: opts.email } }),
      logout: () => Promise.resolve(),
    };
  });
}

// Navigate to team screen (requires auth)
async function goToTeamScreen(page) {
  await page.goto('http://localhost:3000');
  await page.waitForTimeout(300);
  const homeBtn = page.locator('#homeScreen .home-links a, #homeScreen button').filter({ hasText: /team/i }).first();
  if (await homeBtn.isVisible()) {
    await homeBtn.click();
  } else {
    await page.evaluate(() => showScreen('teamScreen'));
  }
  await page.waitForTimeout(200);
}

test.describe('Roster Import — image upload flow (mobile)', () => {
  test.use({ viewport: MOBILE });

  test('import modal opens and AI Screenshot button is present', async ({ page }) => {
    await injectMemberstackMock(page);
    await goToTeamScreen(page);

    // Open the import modal via the Import Roster button
    const importBtn = page.locator('button').filter({ hasText: /import roster/i }).first();
    if (await importBtn.isVisible()) {
      await importBtn.click();
    } else {
      await page.evaluate(() => openImportRoster());
    }

    await expect(page.locator('#importModal')).toHaveClass(/active/);
    await expect(page.locator('button').filter({ hasText: /ai screenshot/i })).toBeVisible();
  });

  test('shows success state when API returns players', async ({ page }) => {
    await injectMemberstackMock(page);

    // Intercept the API call before navigating
    await page.route('**/api/openai-roster-import', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          players: [
            { number: '12', name: 'Mason Clark' },
            { number: '7', name: 'Carter Jones' },
          ],
        }),
      });
    });

    await goToTeamScreen(page);
    await page.evaluate(() => openImportRoster());
    await expect(page.locator('#importModal')).toHaveClass(/active/);

    // Create a small PNG temp file to upload
    const tmpFile = path.join(os.tmpdir(), 'test-roster.png');
    // 1x1 red PNG (minimal valid PNG)
    const pngBytes = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108020000009001' +
      '2e00000000c4944415478016360f8cfc00000000200016dd8a600000000049454e44ae426082',
      'hex'
    );
    fs.writeFileSync(tmpFile, pngBytes);

    const fileInput = page.locator('#rosterImageInput');
    await fileInput.setInputFiles(tmpFile);

    // Wait for the status to update
    await expect(page.locator('#rosterImportStatus')).toContainText('2 players', { timeout: 5000 });
    await expect(page.locator('#rosterTextInput')).toHaveValue(/Mason Clark/);

    fs.unlinkSync(tmpFile);
  });

  test('shows error state when API fails', async ({ page }) => {
    await injectMemberstackMock(page);

    await page.route('**/api/openai-roster-import', route => {
      route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'OpenAI API error' }),
      });
    });

    await goToTeamScreen(page);
    await page.evaluate(() => openImportRoster());

    const tmpFile = path.join(os.tmpdir(), 'test-roster-err.png');
    const pngBytes = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108020000009001' +
      '2e00000000c4944415478016360f8cfc00000000200016dd8a600000000049454e44ae426082',
      'hex'
    );
    fs.writeFileSync(tmpFile, pngBytes);

    const fileInput = page.locator('#rosterImageInput');
    await fileInput.setInputFiles(tmpFile);

    await expect(page.locator('#rosterImportStatus')).toContainText('AI Import failed', { timeout: 5000 });

    fs.unlinkSync(tmpFile);
  });

  test('shows no-players message when API returns empty array', async ({ page }) => {
    await injectMemberstackMock(page);

    await page.route('**/api/openai-roster-import', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ players: [] }),
      });
    });

    await goToTeamScreen(page);
    await page.evaluate(() => openImportRoster());

    const tmpFile = path.join(os.tmpdir(), 'test-roster-empty.png');
    const pngBytes = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108020000009001' +
      '2e00000000c4944415478016360f8cfc00000000200016dd8a600000000049454e44ae426082',
      'hex'
    );
    fs.writeFileSync(tmpFile, pngBytes);

    const fileInput = page.locator('#rosterImageInput');
    await fileInput.setInputFiles(tmpFile);

    await expect(page.locator('#rosterImportStatus')).toContainText('could not find players', { timeout: 5000 });

    fs.unlinkSync(tmpFile);
  });

  test('existing text-paste and CSV upload still work', async ({ page }) => {
    await injectMemberstackMock(page);
    await goToTeamScreen(page);
    await page.evaluate(() => openImportRoster());

    await expect(page.locator('#importModal')).toHaveClass(/active/);
    await expect(page.locator('button').filter({ hasText: /import paste/i })).toBeVisible();
    await expect(page.locator('button').filter({ hasText: /upload csv/i })).toBeVisible();
  });
});

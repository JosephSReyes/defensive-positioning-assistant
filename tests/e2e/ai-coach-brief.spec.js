// tests/e2e/ai-coach-brief.spec.js
// Step 9 — AI Coach Brief E2E tests
// Verifies the AI brief fetch flow using mocked API responses.

const { test, expect } = require('@playwright/test');

const MOBILE = { width: 375, height: 812 };

async function injectMemberstackMock(page) {
  await page.route('**/static.memberstack.com/**', route => route.abort());
  await page.addInitScript(() => {
    window.$memberstackDom = {
      getCurrentMember: () => Promise.resolve({ data: { id: 'test-member', email: 'test@test.com' } }),
      loginMemberEmailPassword: opts => Promise.resolve({ data: { id: 'test-member', email: opts.email } }),
      signupMemberEmailPassword: opts => Promise.resolve({ data: { id: 'new-member', email: opts.email } }),
      logout: () => Promise.resolve(),
    };
  });
}

async function goToGameScreen(page) {
  await page.goto('http://localhost:3000');
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    if (typeof showScreen === 'function') showScreen('gameScreen');
  });
  await page.waitForTimeout(300);
}

test.describe('AI Coach Brief — game screen (mobile)', () => {
  test.use({ viewport: MOBILE });

  test('AI explain button is present in the game screen', async ({ page }) => {
    await injectMemberstackMock(page);
    await goToGameScreen(page);
    const aiBtn = page.locator('#aiExplainBtn');
    await expect(aiBtn).toBeVisible();
    await expect(aiBtn).toContainText('AI');
  });

  test('AI explain box opens when button is clicked', async ({ page }) => {
    await injectMemberstackMock(page);

    // Stub the API so fetch doesn't hang
    await page.route('**/api/ai-coach-brief', route => route.abort());

    await goToGameScreen(page);
    await page.locator('#aiExplainBtn').click();
    const box = page.locator('#aiExplainBox');
    await expect(box).toHaveClass(/active/);
  });

  test('AI explain box shows local text when no contact data exists', async ({ page }) => {
    await injectMemberstackMock(page);
    await page.route('**/api/ai-coach-brief', route => route.abort());

    await goToGameScreen(page);
    await page.locator('#aiExplainBtn').click();

    const txt = page.locator('#aiExplainText');
    await expect(txt).toBeVisible();
    // Local fallback text is rendered without fetching AI when contacts === 0
    const content = await txt.textContent();
    expect(content.length).toBeGreaterThan(5);
  });

  test('AI explain box shows AI brief when API returns a response', async ({ page }) => {
    await injectMemberstackMock(page);

    const AI_BRIEF = 'Shade the RF three steps to right. This hitter has shown a clear pull tendency.';

    await page.route('**/api/ai-coach-brief', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ brief: AI_BRIEF }),
      });
    });

    await goToGameScreen(page);

    // Inject a player with contact data so AI fetch is triggered
    await page.evaluate(() => {
      if (!window.appData) window.appData = {};
      window.appData.currentGame = window.appData.currentGame || {};
      // Add a player with contact events so contacts > 0
      const player = {
        id: 'p1', name: 'Test Hitter', number: '12',
        currentEvents: [{ x: 70, y: 50, outcome: 'Single' }],
        previousEvents: [],
        outcomes: [],
      };
      if (typeof appData.currentGame.players === 'undefined') {
        appData.currentGame.players = [];
      }
      appData.currentGame.players = [player];
      appData.currentGame.activeIndex = 0;
    });

    await page.locator('#aiExplainBtn').click();

    const txt = page.locator('#aiExplainText');
    await expect(txt).toContainText('right', { timeout: 5000 });
  });

  test('AI explain box closes when Got it is clicked', async ({ page }) => {
    await injectMemberstackMock(page);
    await page.route('**/api/ai-coach-brief', route => route.abort());

    await goToGameScreen(page);
    await page.locator('#aiExplainBtn').click();
    await expect(page.locator('#aiExplainBox')).toHaveClass(/active/);

    await page.locator('.ai-got-it-btn').click();
    await expect(page.locator('#aiExplainBox')).not.toHaveClass(/active/);
  });

  test('AI explain box shows local text on API failure', async ({ page }) => {
    await injectMemberstackMock(page);

    await page.route('**/api/ai-coach-brief', route => {
      route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'OpenAI API error' }),
      });
    });

    await goToGameScreen(page);

    await page.evaluate(() => {
      if (!window.appData) window.appData = {};
      const player = {
        id: 'p2', name: 'Error Hitter', number: '9',
        currentEvents: [{ x: 30, y: 55, outcome: 'Groundout', isOut: true }],
        previousEvents: [],
        outcomes: [],
      };
      if (!appData.currentGame) appData.currentGame = {};
      appData.currentGame.players = [player];
      appData.currentGame.activeIndex = 0;
    });

    await page.locator('#aiExplainBtn').click();

    const txt = page.locator('#aiExplainText');
    await expect(txt).toBeVisible();
    // After failure the fallback local text should be shown (not empty, not the AI brief error)
    const content = await txt.textContent();
    expect(content.length).toBeGreaterThan(5);
    expect(content).not.toContain('502');
  });
});

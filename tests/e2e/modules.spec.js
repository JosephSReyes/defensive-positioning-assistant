/**
 * E2E tests — Step 4: JS Modularization
 *
 * Verifies that after extracting JS into modules:
 * - All module files are served with HTTP 200
 * - Core game functions are present on window
 * - Recommendation functions are present on window
 * - Gameplay flow works end-to-end (add team → add player → start game)
 * - No critical JS errors introduced by modularization
 */

import { test, expect } from '@playwright/test';

// ── auth mock helper ────────────────────────────────────────────────────────
// Gameplay tests navigate to protected screens (homeScreen, teamScreen,
// gameScreen). The auth guard in memberstack.js requires Memberstack auth.
// Block the CDN and inject a logged-in mock so these tests work without a
// real Memberstack session.
async function blockCdnAndInjectLoggedInMock(page) {
  await page.route('**/static.memberstack.com/**', route => route.abort());
  await page.addInitScript(() => {
    window.$memberstackDom = {
      getCurrentMember: function () {
        return Promise.resolve({ data: { id: 'test-member', email: 'test@example.com' } });
      },
      logout: function () { return Promise.resolve(); },
      loginMemberEmailPassword: function () { return Promise.resolve({ data: { id: 'test-member' } }); },
      signupMemberEmailPassword: function () { return Promise.resolve({ data: { id: 'test-member' } }); }
    };
  });
}

// ── module file serving ────────────────────────────────────────────────────

const modules = [
  'js/storage.js',
  'js/utils.js',
  'js/game.js',
  'js/recommendations.js',
  'js/ui.js',
  'js/roster-import.js',
  'js/memberstack.js',
  'js/batter.js',
  'js/spray-charts.js',
  'js/app.js',
];

for (const mod of modules) {
  test(`${mod} is served with HTTP 200`, async ({ page }) => {
    const response = await page.goto(`/${mod}`);
    expect(response.status()).toBe(200);
  });
}

// ── global function availability ──────────────────────────────────────────

test('core game functions are defined on window after load', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(300);

  const fns = await page.evaluate(() => ({
    load: typeof load,
    save: typeof save,
    getCurrentTeam: typeof getCurrentTeam,
    getActivePlayer: typeof getActivePlayer,
    startGame: typeof startGame,
    saveHit: typeof saveHit,
    undoLast: typeof undoLast,
    endGame: typeof endGame,
  }));

  for (const [name, type] of Object.entries(fns)) {
    expect(type, `${name} should be a function`).toBe('function');
  }
});

test('recommendation functions are defined on window after load', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(300);

  const fns = await page.evaluate(() => ({
    renderSmartFielding: typeof renderSmartFielding,
    buildAIExplainText: typeof buildAIExplainText,
    toggleAIExplain: typeof toggleAIExplain,
  }));

  for (const [name, type] of Object.entries(fns)) {
    expect(type, `${name} should be a function`).toBe('function');
  }
});

test('utility functions are defined on window after load', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(300);

  const fns = await page.evaluate(() => ({
    escapeHtml: typeof escapeHtml,
    zoneLabel: typeof zoneLabel,
    shortOutcome: typeof shortOutcome,
    pct: typeof pct,
  }));

  for (const [name, type] of Object.entries(fns)) {
    expect(type, `${name} should be a function`).toBe('function');
  }
});

// ── gameplay flow ─────────────────────────────────────────────────────────

test('gameplay flow: add team → add player → start game', async ({ page }) => {
  await blockCdnAndInjectLoggedInMock(page);

  const errors = [];
  page.on('pageerror', err => {
    const msg = err.message || '';
    const isThirdParty =
      msg.includes('MemberStack') || msg.includes('memberstack') ||
      msg.includes('Stripe') || msg.includes('stripe') ||
      msg.includes('CORS') || msg.includes('cors') ||
      msg.includes('net::ERR_');
    if (!isThirdParty) errors.push(msg);
  });

  await page.goto('/');
  await page.waitForTimeout(300);

  // Navigate to home screen by calling showScreen directly
  await page.evaluate(() => showScreen('homeScreen'));

  // Add a team via the addTeam function
  await page.evaluate(() => {
    document.getElementById('teamNameInput').value = 'Test Team';
    addTeam();
  });

  // Should be on team screen now
  const teamScreen = page.locator('#teamScreen');
  await expect(teamScreen).toHaveClass(/active/);

  // Add a player
  await page.evaluate(() => {
    document.getElementById('playerNumberInput').value = '42';
    document.getElementById('playerNameInput').value = 'Test Player';
    addPlayer();
  });

  // Start game
  await page.evaluate(() => startGame());

  // Should be on game screen
  const gameScreen = page.locator('#gameScreen');
  await expect(gameScreen).toHaveClass(/active/);

  // Active player name should show
  const playerName = page.locator('#activePlayerName');
  await expect(playerName).toContainText('Test Player');

  expect(errors).toHaveLength(0);
});

test('recommendations: renderSmartFielding runs without errors on game screen', async ({ page }) => {
  await blockCdnAndInjectLoggedInMock(page);

  const errors = [];
  page.on('pageerror', err => {
    const msg = err.message || '';
    const isThirdParty =
      msg.includes('MemberStack') || msg.includes('memberstack') ||
      msg.includes('Stripe') || msg.includes('stripe') ||
      msg.includes('CORS') || msg.includes('cors') ||
      msg.includes('net::ERR_');
    if (!isThirdParty) errors.push(msg);
  });

  await page.goto('/');
  await page.waitForTimeout(300);

  // Set up game state and navigate to game screen
  await page.evaluate(() => {
    showScreen('homeScreen');
    document.getElementById('teamNameInput').value = 'Rec Test Team';
    addTeam();
    document.getElementById('playerNumberInput').value = '7';
    document.getElementById('playerNameInput').value = 'Rec Player';
    addPlayer();
    startGame();
  });

  // Call renderSmartFielding directly — should not throw
  const result = await page.evaluate(() => {
    try {
      const player = getActivePlayer();
      if (player) renderSmartFielding(player);
      return 'ok';
    } catch (e) {
      return e.message;
    }
  });

  expect(result).toBe('ok');
  expect(errors).toHaveLength(0);
});

test('no critical JS errors after modularization', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => {
    const msg = err.message || '';
    const isThirdParty =
      msg.includes('MemberStack') || msg.includes('memberstack') ||
      msg.includes('Stripe') || msg.includes('stripe') ||
      msg.includes('CORS') || msg.includes('cors') ||
      msg.includes('net::ERR_');
    if (!isThirdParty) errors.push(msg);
  });

  // Block external CDN scripts so they don't produce unhandled rejections
  await page.route('**/static.memberstack.com/**', route => route.abort());
  await page.goto('/');
  await page.waitForTimeout(600);

  expect(errors).toHaveLength(0);
});

// tests/e2e/play-log-import.spec.js
// Step 13 — Play-Log Import E2E
// Verifies the Team-screen button is gated on a non-empty roster and that a
// mocked import writes data and shows the summary. Uses the Memberstack mock
// from the other specs so it runs without the live auth CDN.

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');

const MOBILE = { width: 375, height: 812 };

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

async function goToTeamScreen(page) {
  await page.goto('http://localhost:3000');
  await page.waitForTimeout(300);
  await page.evaluate(() => showScreen('teamScreen'));
  await page.waitForTimeout(150);
}

function seedTeam(page, players) {
  return page.evaluate((players) => {
    appData.teams = [{ id: 't1', name: 'Riverside Rockets 12U', players }];
    appData.selectedTeamId = 't1';
    appData.selectedPlayerIndex = 0;
    save();
    showScreen('teamScreen');
    renderTeamScreen();
  }, players);
}

const PLAYER = (id, name, number) => ({ id, name, number, currentEvents: [], previousEvents: [], outcomes: [] });

test.describe('Play-Log Import (mobile)', () => {
  test.use({ viewport: MOBILE });

  test('import button is disabled with an empty roster, enabled after a player is added', async ({ page }) => {
    await injectMemberstackMock(page);
    await goToTeamScreen(page);

    await seedTeam(page, []);
    await expect(page.locator('#playLogImportBtn')).toBeDisabled();

    await seedTeam(page, [PLAYER('a', 'Avery Nolan', '7')]);
    await expect(page.locator('#playLogImportBtn')).toBeEnabled();
  });

  test('a mocked import writes previous-game data and shows the summary', async ({ page }) => {
    await injectMemberstackMock(page);

    await page.route('**/api/openai-play-log-import', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          plays: [
            { game: { date: 'Jun 3' }, battingTeam: 'Riverside Rockets 12U', batter: { name: 'A Nolan', jersey: '' }, result: 'Single', battedBallType: 'line', location: { explicit: 'right field', fielder: '' }, strikeoutKind: '', rawText: 'A Nolan singles to right field' },
            { game: { date: 'Jun 3' }, battingTeam: 'Riverside Rockets 12U', batter: { name: 'J Pike', jersey: '' }, result: 'Walk', battedBallType: 'none', location: { explicit: '', fielder: '' }, strikeoutKind: '', rawText: 'J Pike walks' },
          ],
        }),
      });
    });

    await goToTeamScreen(page);
    await seedTeam(page, [PLAYER('a', 'Avery Nolan', '7'), PLAYER('b', 'Jordan Pike', '11')]);

    const tmpFile = path.join(os.tmpdir(), 'test-playlog.png');
    const pngBytes = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108020000009001' +
      '2e00000000c4944415478016360f8cfc00000000200016dd8a600000000049454e44ae426082',
      'hex'
    );
    fs.writeFileSync(tmpFile, pngBytes);

    await page.locator('#playLogImageInput').setInputFiles(tmpFile);

    await expect(page.locator('#playLogSummaryModal')).toHaveClass(/active/, { timeout: 8000 });
    await expect(page.locator('#playLogSummaryBody')).toContainText('Players Updated');

    // Verify the data actually landed in the model.
    const data = await page.evaluate(() => {
      const team = appData.teams[0];
      const nolan = team.players.find(p => p.id === 'a');
      const pike = team.players.find(p => p.id === 'b');
      return {
        nolanMarkers: nolan.previousEvents.length,
        nolanOutcomes: nolan.outcomes.length,
        pikeMarkers: pike.previousEvents.length,
        pikeOutcomes: pike.outcomes.length,
        playerCount: team.players.length,
      };
    });

    expect(data.nolanMarkers).toBe(1);   // the single → blue dot
    expect(data.nolanOutcomes).toBe(1);
    expect(data.pikeMarkers).toBe(0);    // the walk → no marker
    expect(data.pikeOutcomes).toBe(1);
    expect(data.playerCount).toBe(2);    // no roster player was created

    fs.unlinkSync(tmpFile);
  });
});

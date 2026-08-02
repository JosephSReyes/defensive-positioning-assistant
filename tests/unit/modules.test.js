/**
 * Unit tests — Step 4: JS Modularization
 *
 * Verifies that all extracted JS module files exist and contain
 * the expected functions/constants. Also tests pure utility functions
 * directly (storage helpers, recommendation logic, roster parsing).
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, beforeAll } from 'vitest';

// ── helpers ────────────────────────────────────────────────────────────────
function readModule(rel) {
  const p = resolve(process.cwd(), rel);
  expect(existsSync(p), `${rel} must exist`).toBe(true);
  return readFileSync(p, 'utf-8');
}

// ── Step 4: module file existence and content ──────────────────────────────

describe('Step 4 — JS module files exist', () => {
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

  modules.forEach(mod => {
    it(`${mod} exists and is non-empty`, () => {
      const src = readModule(mod);
      expect(src.length).toBeGreaterThan(0);
    });
  });
});

describe('Step 4 — storage.js', () => {
  let src;
  beforeAll(() => { src = readModule('js/storage.js'); });

  it('defines STORAGE_KEY', () => {
    expect(src).toContain('STORAGE_KEY');
  });

  it('defines appData', () => {
    expect(src).toContain('appData');
  });

  it('defines load()', () => {
    expect(src).toContain('function load(');
  });

  it('defines save()', () => {
    expect(src).toContain('function save(');
  });
});

describe('Step 4 — utils.js', () => {
  let src;
  beforeAll(() => { src = readModule('js/utils.js'); });

  it('defines id()', () => {
    expect(src).toContain('function id(');
  });

  it('defines escapeHtml()', () => {
    expect(src).toContain('function escapeHtml(');
  });

  it('defines shortOutcome()', () => {
    expect(src).toContain('function shortOutcome(');
  });

  it('defines pct()', () => {
    expect(src).toContain('function pct(');
  });

  it('defines zoneLabel()', () => {
    expect(src).toContain('function zoneLabel(');
  });
});

describe('Step 4 — game.js', () => {
  let src;
  beforeAll(() => { src = readModule('js/game.js'); });

  it('defines getCurrentTeam()', () => {
    expect(src).toContain('function getCurrentTeam(');
  });

  it('defines getActivePlayer()', () => {
    expect(src).toContain('function getActivePlayer(');
  });

  it('defines startGame()', () => {
    expect(src).toContain('function startGame(');
  });

  it('defines saveHit()', () => {
    expect(src).toContain('function saveHit(');
  });

  it('defines undoLast()', () => {
    expect(src).toContain('function undoLast(');
  });

  it('defines endGame()', () => {
    expect(src).toContain('function endGame(');
  });

  it('defines openEndGameModal()', () => {
    expect(src).toContain('function openEndGameModal(');
  });

  it('defines closeEndGameModal()', () => {
    expect(src).toContain('function closeEndGameModal(');
  });

  it('defines confirmEndGame()', () => {
    expect(src).toContain('function confirmEndGame(');
  });

  it('endGame() no longer uses native confirm() dialog', () => {
    const endGameBody = src.match(/function endGame\(\)\{[\s\S]*?\n\}/);
    expect(endGameBody).not.toBeNull();
    expect(endGameBody[0]).not.toContain('confirm(');
  });

  it('defines setupDoubleTap()', () => {
    expect(src).toContain('function setupDoubleTap(');
  });
});

describe('Step 4 — recommendations.js', () => {
  let src;
  beforeAll(() => { src = readModule('js/recommendations.js'); });

  it('defines renderSmartFielding()', () => {
    expect(src).toContain('function renderSmartFielding(');
  });

  it('defines requestAICoachBrief() — Step 9 addition', () => {
    expect(src).toContain('function requestAICoachBrief(');
  });

  it('defines weightedHitProfile()', () => {
    expect(src).toContain('function weightedHitProfile(');
  });

  it('defines buildAIExplainText()', () => {
    expect(src).toContain('function buildAIExplainText(');
  });
});

describe('Step 4 — ui.js', () => {
  let src;
  beforeAll(() => { src = readModule('js/ui.js'); });

  it('defines showScreen()', () => {
    expect(src).toContain('function showScreen(');
  });

  it('defines render()', () => {
    expect(src).toContain('function render(');
  });

  it('defines renderGame()', () => {
    expect(src).toContain('function renderGame(');
  });

  it('defines renderTeamScreen()', () => {
    expect(src).toContain('function renderTeamScreen(');
  });

  it('defines rotateVerse()', () => {
    expect(src).toContain('function rotateVerse(');
  });
});

describe('Step 4 — roster-import.js', () => {
  let src;
  beforeAll(() => { src = readModule('js/roster-import.js'); });

  it('defines parseRosterText()', () => {
    expect(src).toContain('function parseRosterText(');
  });

  it('defines cleanRosterText()', () => {
    expect(src).toContain('function cleanRosterText(');
  });

  it('defines applyRosterImport()', () => {
    expect(src).toContain('function applyRosterImport(');
  });

  it('defines preprocessRosterImage() for contrast enhancement', () => {
    expect(src).toContain('function preprocessRosterImage(');
  });

  it('preprocessRosterImage uses canvas contrast filter', () => {
    expect(src).toMatch(/contrast\(/);
  });

  it('imageRosterNotice uses preprocessRosterImage before sending to API', () => {
    expect(src).toContain('preprocessRosterImage(file)');
  });
});

describe('Step 4 — memberstack.js', () => {
  let src;
  beforeAll(() => { src = readModule('js/memberstack.js'); });

  it('defines showDpaAuth()', () => {
    expect(src).toContain('function showDpaAuth(');
  });

  it('contains memberstack auth state handler', () => {
    expect(src).toContain('handleMemberState');
  });
});

describe('Step 4 — app.js', () => {
  let src;
  beforeAll(() => { src = readModule('js/app.js'); });

  it('calls load()', () => {
    expect(src).toContain('load()');
  });

  it('calls render()', () => {
    expect(src).toContain('render()');
  });

  it('calls setupDoubleTap()', () => {
    expect(src).toContain('setupDoubleTap()');
  });
});

describe('Step 4 — index.html script references', () => {
  let html;
  beforeAll(() => {
    html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf-8');
  });

  it('links js/storage.js', () => {
    expect(html).toContain('src="js/storage.js"');
  });

  it('links js/utils.js', () => {
    expect(html).toContain('src="js/utils.js"');
  });

  it('links js/game.js', () => {
    expect(html).toContain('src="js/game.js"');
  });

  it('links js/recommendations.js', () => {
    expect(html).toContain('src="js/recommendations.js"');
  });

  it('links js/ui.js', () => {
    expect(html).toContain('src="js/ui.js"');
  });

  it('links js/app.js', () => {
    expect(html).toContain('src="js/app.js"');
  });

  it('inline script blocks only appear inside #landingScreen', () => {
    // The landing screen hosts a small DefensivePositioningProAccess shim so the Memberstack
    // modal triggers work even before the SDK has loaded. All other app logic
    // must come from external js/*.js files.
    // NOTE: avoid literal '<script' without src — Vite import-analysis may
    // misidentify test files. Use RegExp constructor.
    const inlinePattern = new RegExp('<' + 'script' + '>', 'g');
    const landingStart = html.indexOf('id="landingScreen"');
    const landingEnd = html.indexOf('</section>', landingStart);
    expect(landingStart).toBeGreaterThan(0);
    expect(landingEnd).toBeGreaterThan(landingStart);

    let m;
    while ((m = inlinePattern.exec(html)) !== null) {
      expect(m.index, 'inline <script> found outside #landingScreen').toBeGreaterThan(landingStart);
      expect(m.index, 'inline <script> found outside #landingScreen').toBeLessThan(landingEnd);
    }
  });
});

// ── Pure function unit tests ───────────────────────────────────────────────

describe('Step 4 — utility function logic (roster parsing)', () => {
  // parseRosterText is a pure function we can eval from source
  let parseRosterText;
  let cleanRosterText;

  beforeAll(() => {
    const src = readFileSync(resolve(process.cwd(), 'js/roster-import.js'), 'utf-8');
    // eslint-disable-next-line no-new-func
    const fn = new Function(src + '\nreturn { parseRosterText, cleanRosterText };');
    ({ parseRosterText, cleanRosterText } = fn());
  });

  it('parseRosterText returns array', () => {
    const result = parseRosterText('12 Smith\n34 Jones');
    expect(Array.isArray(result)).toBe(true);
  });

  it('parseRosterText extracts player names', () => {
    const result = parseRosterText('12 Smith\n34 Jones');
    expect(result.length).toBe(2);
    expect(result[0].name).toBe('Smith');
    expect(result[0].number).toBe('12');
    expect(result[1].name).toBe('Jones');
  });

  it('parseRosterText deduplicates entries', () => {
    const result = parseRosterText('12 Smith\n12 Smith');
    expect(result.length).toBe(1);
  });

  it('parseRosterText handles empty input', () => {
    const result = parseRosterText('');
    expect(result).toEqual([]);
  });

  it('cleanRosterText removes position abbreviations', () => {
    const result = cleanRosterText('12 Smith SS\n34 Jones 1B');
    expect(result).not.toContain(' SS');
    expect(result).not.toContain(' 1B');
  });
});

describe('Step 4 — game state initialization', () => {
  // Test the shape of appData default as defined in storage.js
  it('appData default has required keys', () => {
    const src = readFileSync(resolve(process.cwd(), 'js/storage.js'), 'utf-8');
    expect(src).toContain('teams: []');
    expect(src).toContain('selectedTeamId: null');
    expect(src).toContain('selectedPlayerIndex: 0');
    expect(src).toContain('mode: "current"');
  });
});

describe('Step 4 — localStorage key stability', () => {
  it('STORAGE_KEY value is unchanged', () => {
    const src = readFileSync(resolve(process.cwd(), 'js/storage.js'), 'utf-8');
    expect(src).toContain('"field_iq_final_full_product_v1"');
  });
});

// ── Player-perspective fielding text ──────────────────────────────────────
// Movement directions are stated from the fielder's own perspective (facing
// home plate), so a Right Side pull shifts the fielder to their left toward
// the 1B line, and a Left Side pull shifts them to their right toward the 3B line.

describe('Fielding recommendation text — player perspective', () => {
  let src;
  beforeAll(() => { src = readModule('js/recommendations.js'); });

  function rightSideBlock() {
    const m = src.match(/if\(top === "Right Side"\)\{[\s\S]*?\}else if/);
    expect(m, 'Right Side branch must exist').not.toBeNull();
    return m[0];
  }

  function leftSideBlock() {
    const m = src.match(/\}else if\(top === "Left Side"\)\{[\s\S]*?\}else\{/);
    expect(m, 'Left Side branch must exist').not.toBeNull();
    return m[0];
  }

  it('Right Side pull sends outfielders/middle infielders to their LEFT', () => {
    const block = rightSideBlock();
    expect(block).toContain('moveRF');
    expect(block).toContain('left');
    expect(block).not.toMatch(/move(RF|2B|CF)[^`]*`[^`]*\bright\b/);
  });

  it('Left Side pull sends outfielders/middle infielders to their RIGHT', () => {
    const block = leftSideBlock();
    expect(block).toContain('moveLF');
    expect(block).toContain('right');
    expect(block).not.toMatch(/move(LF|SS|CF)[^`]*`[^`]*\bleft\b/);
  });

  it('1B "Hold bag" and 3B "Guard line" are perspective-neutral and preserved', () => {
    expect(src).toContain('"Hold bag"');
    expect(src).toContain('"Guard line"');
  });
});

// ── Touch-swipe batter navigation ─────────────────────────────────────────

describe('Batter navigation — touch swipe', () => {
  let src;
  beforeAll(() => { src = readModule('js/batter.js'); });

  it('defines setupSwipeNavigation()', () => {
    expect(src).toContain('function setupSwipeNavigation(');
  });

  it('binds touchstart and touchend on the field-wrap', () => {
    expect(src).toMatch(/touchstart/);
    expect(src).toMatch(/touchend/);
    expect(src).toContain('#gameScreen .field-wrap');
  });

  it('calls prevPlayer on right-swipe and nextPlayer on left-swipe', () => {
    expect(src).toContain('nextPlayer()');
    expect(src).toContain('prevPlayer()');
    // Standard carousel: left-swipe (dx < 0) advances; right-swipe (dx > 0) goes back.
    expect(src).toMatch(/dx > 0[\s\S]{0,80}prevPlayer\(\)/);
  });

  it('ignores swipes that start on interactive controls', () => {
    expect(src).toMatch(/closest\(['"]button/);
  });
});

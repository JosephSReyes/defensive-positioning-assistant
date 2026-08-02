// Regression coverage for the game-screen field.
//
// CONTRACT (two things that must hold together on every device):
//   1. NO SCROLL / NO CLIP — everything from the top bar down to the Run Analysis
//      button fits on one screen; the coach never has to scroll to reach a
//      control, and nothing is cut off the bottom. (The Bible-verse footer is
//      fixed below.)
//   2. The field COMMANDS the space — it is sized by the screen WIDTH: a
//      full-bleed, edge-to-edge SQUARE (402x402 on a 402-wide phone). It is NOT
//      starved by the leftover height; the control rows divide whatever height
//      is left and scale their own text/buttons to it (container-query units),
//      so the layout keeps its proportions and never scrolls. (The old leftover
//      model gave a height-starved ~298px field on a 402-wide phone.)
//
// The field background is a single inline <svg viewBox="0 0 100 100"> drawn in
// the same 0-100 coordinate space the hit data uses, so the drawn diamond and
// the recorded hits stay pixel-aligned, and #field is locked to a square aspect
// ratio so the diamond never distorts.
//
// These tests force the game screen visible directly so they do not depend on
// the Memberstack auth flow (which needs network and otherwise redirects away
// from protected screens).
//
// Sizes are CSS logical pixels (physical px ÷ devicePixelRatio) — the size the
// browser actually lays out in. e.g. iPhone 16 Pro is 1206x2622 physical at
// DPR 3 → 402x874 logical. Short heights also stand in for the case where the
// mobile address bar is showing (which, with no-scroll, it stays).
const { test, expect } = require('@playwright/test');

const PHONES = [
  { w: 360, h: 640, name: 'small Android 360x640' },
  { w: 375, h: 667, name: 'iPhone SE 375x667' },
  { w: 402, h: 760, name: 'iPhone 16 Pro, address bar shown 402x760' },
  { w: 393, h: 852, name: 'iPhone 16 393x852' },
  { w: 402, h: 874, name: 'iPhone 16 Pro 402x874' },
  { w: 440, h: 956, name: 'iPhone 16 Pro Max 440x956' },
];

async function showGameScreen(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
    document.getElementById('gameScreen').classList.add('active');
    if (window.DefensivePositioningCompactBatter) window.DefensivePositioningCompactBatter.render();
  });
  await page.waitForTimeout(200);
}

async function metrics(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('#gameScreen .field-svg');
    const field = document.getElementById('field');
    const wrap = document.querySelector('#gameScreen .field-wrap');
    const gs = document.querySelector('#gameScreen .game-screen');
    const run = document.querySelector('#gameScreen .run-dpa-row');
    const verse = document.getElementById('verseDisplay');
    const fr = field.getBoundingClientRect();
    const wr = wrap.getBoundingClientRect();
    const runr = run.getBoundingClientRect();
    const verser = verse.getBoundingClientRect();
    // Map an SVG geometry point (first base = data 76,62) to screen pixels and
    // compare it to where the data %-overlay places the same coordinate.
    const pt = svg.createSVGPoint();
    pt.x = 76; pt.y = 62;
    const scr = pt.matrixTransform(svg.getScreenCTM());
    // Stacking check: no control may overlap the next one down.
    const order = ['.game-top', '.mode-tabs', '.legend', '.tendency-pills',
      '.field-wrap', '#dpaCompactBatter', '.last-card', '.actions', '.run-dpa-row'];
    const overlaps = [];
    let prevBottom = -Infinity, prevName = '';
    for (const sel of order) {
      const el = document.querySelector('#gameScreen ' + sel) || document.querySelector(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.top < prevBottom - 1) overlaps.push(`${prevName} overlaps ${sel}`);
      prevBottom = r.bottom; prevName = sel;
    }
    return {
      fieldAR: fr.width / fr.height,
      fieldW: fr.width,
      largestSquareThatFits: Math.min(wr.width, wr.height),
      svgViewBox: svg.getAttribute('viewBox'),
      verticalScroll: gs.scrollHeight - gs.clientHeight,
      runBottomVsViewport: runr.bottom - window.innerHeight,
      runBottomVsVerseTop: runr.bottom - verser.top,
      overlaps,
      alignDx: Math.abs(scr.x - (fr.left + 0.76 * fr.width)),
      alignDy: Math.abs(scr.y - (fr.top + 0.62 * fr.height)),
      horizontalOverflow:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

for (const phone of PHONES) {
  test(`game screen fits one screen with the largest possible field on ${phone.name}`, async ({ page }) => {
    await page.setViewportSize({ width: phone.w, height: phone.h });
    await page.goto('/');
    await showGameScreen(page);
    const m = await metrics(page);

    // The field is the SVG drawn in the data's own coordinate space, locked square.
    expect(m.svgViewBox).toBe('0 0 100 100');
    expect(Math.abs(m.fieldAR - 1)).toBeLessThan(0.06);

    // (2) The field commands the space: it is sized by WIDTH — a full-bleed,
    // edge-to-edge square spanning the whole screen width (NOT starved by the
    // leftover height). It is also, by construction, the largest square that fits.
    expect(Math.abs(m.fieldW - phone.w)).toBeLessThan(2);
    expect(Math.abs(m.fieldW - m.largestSquareThatFits)).toBeLessThan(3);

    // (1a) No scroll — the whole screen is one page.
    expect(m.verticalScroll).toBeLessThanOrEqual(1);

    // (1b) No clip — the last control (Run Analysis) is fully inside the viewport,
    // so every button is reachable without scrolling. THIS is the guard for
    // "the user shouldn't have to scroll to hit buttons".
    expect(m.runBottomVsViewport).toBeLessThanOrEqual(1);

    // ...and it sits clear of the fixed Bible-verse footer (not hidden behind it).
    expect(m.runBottomVsVerseTop).toBeLessThanOrEqual(1);

    // Controls stack without overlapping each other.
    expect(m.overlaps).toEqual([]);

    // The drawn geometry and the recorded-hit %-overlay land on the same pixel.
    expect(m.alignDx).toBeLessThan(1.5);
    expect(m.alignDy).toBeLessThan(1.5);

    // No horizontal scrollbar.
    expect(m.horizontalOverflow).toBeLessThanOrEqual(1);
  });
}

// PROPORTIONAL SCALING — the field must keep its share of the screen as the
// height shrinks, and the controls must scale down WITH it. The old model sized
// the controls at a fixed pixel height and let the field (the only flexible
// block) absorb every pixel of lost height, so on shorter screens the field
// collapsed (≈39% → ≈22% of the height) while the buttons stayed big. The
// "largest square that fits" check above did NOT catch this — the field was
// still the largest square that fit the squished space. This guards the fix:
// controls are sized in dvh so the field holds a strong, stable share.
async function fieldAndButton(page, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto('/');
  await showGameScreen(page);
  return page.evaluate(() => {
    const field = document.getElementById('field').getBoundingClientRect();
    const gs = document.querySelector('#gameScreen .game-screen');
    const btn = document.querySelector('#gameScreen .actions button').getBoundingClientRect();
    return { fieldW: field.width, actionBtnH: btn.height, scroll: gs.scrollHeight - gs.clientHeight };
  });
}

test('field is full-width at every height and the controls scale to fit (no scroll)', async ({ page }) => {
  const tall = await fieldAndButton(page, 402, 874);
  const short = await fieldAndButton(page, 402, 640);

  // The field is sized by WIDTH — a full-bleed 402 square at BOTH heights, never
  // starved by the leftover space (the old leftover model gave ~298 at 402x874).
  expect(Math.abs(tall.fieldW - 402)).toBeLessThan(2);
  expect(Math.abs(short.fieldW - 402)).toBeLessThan(2);

  // The controls scale down with the screen: an action button is clearly shorter
  // on the short screen. (Old fixed-height model: no change.)
  expect(short.actionBtnH).toBeLessThan(tall.actionBtnH - 6);

  // Never scrolls at either height.
  expect(tall.scroll).toBeLessThanOrEqual(1);
  expect(short.scroll).toBeLessThanOrEqual(1);
});

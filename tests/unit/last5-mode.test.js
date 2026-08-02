/**
 * Unit tests — Last 5 At Bats follows the game-mode toggle (renderLast5)
 *
 * Spec 01. The Last 5 At Bats card must track the Current Game / Previous Games
 * toggle: in Current mode it shows the newest current-game at-bats (the existing
 * behavior); in Previous mode it shows the newest previous-game at-bats. The
 * stats row tracks the same mode (Walk/Bunt excluded from the at-bat count per
 * DECISIONS.md #9), blanking the inactive Current/Previous label. These tests
 * lock that in and guard the current-mode behavior against regression.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, beforeAll } from 'vitest';

function read(rel) {
  return readFileSync(resolve(process.cwd(), rel), 'utf-8');
}

// Minimal DOM stub — the test runs in the `node` environment (no jsdom), so we
// provide just the slice of `document` that renderLast5 touches.
function makeEl() {
  const classes = new Set();
  return {
    children: [],
    innerHTML: '',
    textContent: '',
    className: '',
    classList: { add: (c) => classes.add(c), has: (c) => classes.has(c) },
    appendChild(c) { this.children.push(c); },
  };
}

describe('renderLast5() — follows the Current/Previous game-mode toggle', () => {
  let makeUI;
  beforeAll(() => {
    // renderLast5 closes over `document`, `appData`, and the utils helpers
    // (escapeHtml/shortOutcome/zoneLabel live in utils.js). Inject them all.
    const src = read('js/ui.js');
    // eslint-disable-next-line no-new-func
    makeUI = new Function(
      'document', 'appData', 'escapeHtml', 'shortOutcome', 'zoneLabel',
      src + '\nreturn { renderLast5 };'
    );
  });

  // outcomes are stored newest-first (unshift), so index 0 is the most recent.
  function render(player, mode) {
    const nodes = {
      last5: makeEl(),
      currentStats: makeEl(),
      previousStats: makeEl(),
      outStats: makeEl(),
    };
    const document = {
      getElementById: (id) => nodes[id],
      createElement: () => makeEl(),
    };
    const appData = { mode };
    const { renderLast5 } = makeUI(
      document, appData,
      (s) => String(s),       // escapeHtml
      (o) => o,               // shortOutcome (identity)
      () => 'Z'               // zoneLabel
    );
    renderLast5(player);
    return nodes;
  }

  // A cell is "filled" when renderLast5 did not mark it empty.
  const filledCells = (last5) => last5.children.filter((c) => !c.classList.has('empty'));
  const emptyCells = (last5) => last5.children.filter((c) => c.classList.has('empty'));

  const curHit  = (outcome) => ({ outcome, mode: 'current',  type: 'hit',    isOut: false, x: 50, y: 50 });
  const curK    = ()        => ({ outcome: 'Strikeout', mode: 'current',  type: 'noBall', isOut: true });
  const prevHit = (outcome) => ({ outcome, mode: 'previous', type: 'hit',    isOut: false, x: 30, y: 30 });
  const prevOut = ()        => ({ outcome: 'Groundout', mode: 'previous', type: 'hit', isOut: true, x: 40, y: 40 });

  it('Current mode shows only current at-bats and Current stats (regression guard)', () => {
    const player = {
      outcomes: [curHit('Single'), curK(), prevHit('Double')],
    };
    const n = render(player, 'current');

    expect(n.last5.children).toHaveLength(5);          // always 5 cells
    const filled = filledCells(n.last5);
    expect(filled).toHaveLength(2);                     // Single + Strikeout, not the previous Double
    expect(filled[0].innerHTML).toContain('Single');    // newest first
    expect(filled[1].innerHTML).toContain('Strikeout');
    expect(filled.some((c) => c.innerHTML.includes('Double'))).toBe(false);

    expect(n.currentStats.textContent).toBe('Current: 1 for 2');
    expect(n.previousStats.textContent).toBe('');       // inactive label blanked
    expect(n.outStats.textContent).toBe('Outs: 1');
  });

  it('Previous mode shows only previous at-bats and Previous stats', () => {
    const player = {
      outcomes: [curHit('Single'), curK(), prevHit('Double')],
    };
    const n = render(player, 'previous');

    const filled = filledCells(n.last5);
    expect(filled).toHaveLength(1);                     // only the previous Double
    expect(filled[0].innerHTML).toContain('Double');
    expect(filled.some((c) => c.innerHTML.includes('Single'))).toBe(false);

    expect(n.previousStats.textContent).toBe('Previous: 1 for 1');
    expect(n.currentStats.textContent).toBe('');        // inactive label blanked
    expect(n.outStats.textContent).toBe('Outs: 0');
  });

  it('Previous mode shows a Walk in the grid but excludes it from the at-bat count', () => {
    const player = {
      outcomes: [
        { outcome: 'Walk', mode: 'previous', type: 'noBall', isOut: false },
        prevHit('Single'),
      ],
    };
    const n = render(player, 'previous');

    expect(filledCells(n.last5)).toHaveLength(2);        // Walk still renders
    expect(n.previousStats.textContent).toBe('Previous: 1 for 1'); // Walk not counted
  });

  it('pads with empty placeholder cells when the active mode has fewer than 5', () => {
    const player = { outcomes: [curHit('Single'), prevHit('Double'), prevHit('Triple')] };

    const cur = render(player, 'current');
    expect(filledCells(cur.last5)).toHaveLength(1);
    expect(emptyCells(cur.last5)).toHaveLength(4);
    expect(emptyCells(cur.last5)[0].innerHTML).toContain('&ndash;');

    const prev = render(player, 'previous');
    expect(filledCells(prev.last5)).toHaveLength(2);
    expect(emptyCells(prev.last5)).toHaveLength(3);
  });

  it('caps the grid at the 5 most recent at-bats of the active mode', () => {
    const player = {
      outcomes: [
        prevHit('a'), prevHit('b'), prevHit('c'), prevHit('d'), prevHit('e'), prevHit('f'),
      ],
    };
    const n = render(player, 'previous');
    expect(filledCells(n.last5)).toHaveLength(5);        // 6 logged, only 5 shown
    expect(filledCells(n.last5)[0].innerHTML).toContain('a'); // newest first
  });

  it('counts outs from the active mode only', () => {
    const player = {
      outcomes: [curK(), prevOut(), prevOut()], // 1 current out, 2 previous outs
    };
    expect(render(player, 'current').outStats.textContent).toBe('Outs: 1');
    expect(render(player, 'previous').outStats.textContent).toBe('Outs: 2');
  });
});

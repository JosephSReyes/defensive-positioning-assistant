/**
 * Unit tests — Strikeout pitch type is stored and rendered (Spec 02)
 *
 * With pitch tracking ON, recording a Strikeout (or Walk) opens the pitch modal;
 * picking a pitch must store that pitch on the recorded outcome so the Last 5 At
 * Bats card can show <span class="ab-pitch">FB</span>. The bug was in
 * selectPitch(): it cleared pendingPitch one line before the capture callback
 * read it, so the pitch was never stored. These tests lock in:
 *   1. Strikeout + pitch stores `pitch` on the outcome (the fix / regression guard).
 *   2. Skip records the strikeout with no pitch (Skip must stay "no pitch").
 *   3. Walk in pitch mode records directly — no modal, no pitch (a walk isn't pitch-caused).
 *   4. selectPitch's highlight branch still runs when no capture is pending.
 *   5. renderLast5 emits the ab-pitch tag for a stored pitch in both modes.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, beforeAll } from 'vitest';

function read(rel) {
  return readFileSync(resolve(process.cwd(), rel), 'utf-8');
}

// --- minimal DOM stubs (suite runs in the `node` environment, no jsdom) -------

function makeClassList() {
  const set = new Set();
  return {
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    toggle: (c, on) => { if (on) set.add(c); else set.delete(c); },
    contains: (c) => set.has(c),
    has: (c) => set.has(c),
  };
}

// document stub for the game.js pitch flow: a #pitchModal node and the
// #pitchPickRow buttons selectPitch/clearPitchSelection iterate over.
function makeGameDoc() {
  const pitchModal = { classList: makeClassList() };
  const buttons = ['FB', 'CU', 'CH', 'SL', 'OT'].map((code) => ({
    getAttribute: (a) => (a === 'data-pitch' ? code : null),
    classList: makeClassList(),
  }));
  return {
    pitchModal,
    buttons,
    getElementById: (id) => (id === 'pitchModal' ? pitchModal : { classList: makeClassList() }),
    querySelectorAll: (sel) => (sel.includes('pitchPickRow') ? buttons : []),
  };
}

describe('selectPitch() / recordOutcome() — stores the picked pitch on the outcome', () => {
  let makeGame;
  beforeAll(() => {
    // The pitch capture functions close over appData, save(), renderGame(),
    // getActivePlayer() (defined in the module), and `document`. Injecting them
    // mirrors tests/unit/undo-last.test.js. recordOutcome/saveHit return the
    // overridden versions (last assignment wins).
    const src = read('js/game.js');
    // eslint-disable-next-line no-new-func
    makeGame = new Function(
      'appData', 'save', 'renderGame', 'document',
      src + '\nreturn { recordOutcome, selectPitch, skipPitch };'
    );
  });

  function setup() {
    const player = { currentEvents: [], previousEvents: [], outcomes: [] };
    const appData = {
      teams: [{ id: 't1', players: [player] }],
      selectedTeamId: 't1',
      selectedPlayerIndex: 0,
      mode: 'current',
      trackPitch: true,
    };
    const document = makeGameDoc();
    const api = makeGame(appData, () => {}, () => {}, document);
    return { player, appData, document, ...api };
  }

  it('Strikeout + picked pitch stores `pitch` on the outcome (the fix)', () => {
    const { player, document, recordOutcome, selectPitch } = setup();

    recordOutcome('Strikeout');                 // pitch mode on → opens modal, defers record
    expect(player.outcomes).toHaveLength(0);    // nothing recorded until a pitch/skip is chosen
    expect(document.pitchModal.classList.contains('active')).toBe(true); // modal opened

    selectPitch('FB');                          // pick Fastball → confirms with the pitch set
    expect(player.outcomes).toHaveLength(1);
    expect(player.outcomes[0]).toMatchObject({
      outcome: 'Strikeout',
      type: 'noBall',
      mode: 'current',
      isOut: true,
      pitch: 'FB',
    });
  });

  it('Skip records the strikeout with no pitch tag', () => {
    const { player, recordOutcome, skipPitch } = setup();

    recordOutcome('Strikeout');
    skipPitch();                                // explicit "no pitch" path

    expect(player.outcomes).toHaveLength(1);
    expect(player.outcomes[0].outcome).toBe('Strikeout');
    expect(player.outcomes[0].isOut).toBe(true);
    expect(player.outcomes[0].pitch).toBeUndefined();
  });

  it('Walk in pitch mode records directly — no modal, no pitch tag', () => {
    const { player, document, recordOutcome } = setup();

    // A walk isn't caused by a single pitch, so pitch mode does not prompt for one.
    recordOutcome('Walk');

    expect(player.outcomes).toHaveLength(1);     // recorded immediately, no deferred capture
    expect(player.outcomes[0]).toMatchObject({ outcome: 'Walk', type: 'noBall', isOut: false });
    expect(player.outcomes[0].pitch).toBeUndefined();
    expect(document.pitchModal.classList.contains('active')).toBe(false); // modal never opened
  });

  it('highlight branch still runs (and records nothing) when no capture is pending', () => {
    const { player, document, selectPitch } = setup();

    // No recordOutcome first → pitchCaptureCallback is null → selectPitch should
    // only toggle the outcome-modal pitch-row highlight, not record an outcome.
    selectPitch('SL');

    expect(player.outcomes).toHaveLength(0);
    const sl = document.buttons.find((b) => b.getAttribute('data-pitch') === 'SL');
    const fb = document.buttons.find((b) => b.getAttribute('data-pitch') === 'FB');
    expect(sl.classList.contains('selected')).toBe(true);
    expect(fb.classList.contains('selected')).toBe(false);
  });
});

describe('renderLast5() — renders the ab-pitch tag for a stored pitch', () => {
  let makeUI;
  beforeAll(() => {
    const src = read('js/ui.js');
    // eslint-disable-next-line no-new-func
    makeUI = new Function(
      'document', 'appData', 'escapeHtml', 'shortOutcome', 'zoneLabel',
      src + '\nreturn { renderLast5 };'
    );
  });

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

  function render(player, mode) {
    const nodes = {
      last5: makeEl(),
      currentStats: makeEl(),
      previousStats: makeEl(),
      outStats: makeEl(),
    };
    const document = { getElementById: (id) => nodes[id], createElement: () => makeEl() };
    const { renderLast5 } = makeUI(
      document, { mode },
      (s) => String(s),   // escapeHtml (identity)
      (o) => o,           // shortOutcome (identity)
      () => 'Z'           // zoneLabel
    );
    renderLast5(player);
    return nodes;
  }

  const filled = (n) => n.last5.children.filter((c) => !c.classList.has('empty'));

  it('Current mode: a current strikeout logged with a pitch shows ab-pitch=FB', () => {
    const player = {
      outcomes: [{ outcome: 'Strikeout', mode: 'current', type: 'noBall', isOut: true, pitch: 'FB' }],
    };
    const cell = filled(render(player, 'current'))[0].innerHTML;
    expect(cell).toContain('class="ab-pitch"');
    expect(cell).toContain('FB');
  });

  it('Previous mode: a previous strikeout that carries a pitch shows ab-pitch=FB', () => {
    const player = {
      outcomes: [{ outcome: 'Strikeout', mode: 'previous', type: 'noBall', isOut: true, pitch: 'FB' }],
    };
    const cell = filled(render(player, 'previous'))[0].innerHTML;
    expect(cell).toContain('class="ab-pitch"');
    expect(cell).toContain('FB');
  });
});

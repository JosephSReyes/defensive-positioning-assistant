/**
 * Unit tests — Undo button (undoLast)
 *
 * The Undo button must only ever undo the CURRENT game. Previous-game data
 * (imported play logs or manually-charted previous-game hits) must never be
 * removed by Undo. The earlier implementation popped the newest outcome
 * regardless of mode and, when that outcome was a previous-game hit, deleted a
 * previousEvents marker — wiping historical data. These tests lock in that
 * Undo skips previous-mode entries and touches only current-game data.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, beforeAll } from 'vitest';

function read(rel) {
  return readFileSync(resolve(process.cwd(), rel), 'utf-8');
}

describe('undoLast() — only undoes the current game', () => {
  let makeApp;
  beforeAll(() => {
    // undoLast() closes over appData, save(), renderGame() and getActivePlayer()
    // (defined in the same module). save/renderGame are no-op stubs here; appData
    // is injected so the test controls the active player.
    const src = read('js/game.js');
    // eslint-disable-next-line no-new-func
    makeApp = new Function(
      'appData', 'save', 'renderGame',
      src + '\nreturn { undoLast };'
    );
  });

  // outcomes/currentEvents/previousEvents are all stored newest-first (unshift).
  const curHit = () => ({ outcome: 'Single', mode: 'current', type: 'hit', x: 50, y: 50 });
  const prevHit = () => ({ outcome: 'Double', mode: 'previous', type: 'hit', x: 30, y: 30 });
  const curK = () => ({ outcome: 'Strikeout', mode: 'current', type: 'noBall' });

  function run(player) {
    const appData = { teams: [{ id: 't1', players: [player] }], selectedTeamId: 't1', selectedPlayerIndex: 0 };
    const { undoLast } = makeApp(appData, () => {}, () => {});
    undoLast();
  }

  it('removes the most recent current hit and its marker', () => {
    const h = curHit();
    const player = { currentEvents: [h], previousEvents: [], outcomes: [{ ...h }] };
    run(player);
    expect(player.outcomes).toHaveLength(0);
    expect(player.currentEvents).toHaveLength(0);
  });

  it('never removes previous-game data even when a previous entry is newest', () => {
    const c = curHit();
    const p = prevHit();
    // Coach logged a current hit, then switched to previous mode and logged a
    // previous hit — so the previous entry is the newest in the log.
    const player = {
      currentEvents: [c],
      previousEvents: [p],
      outcomes: [{ ...p }, { ...c }],
    };
    run(player);
    // The current hit is undone; the previous hit is untouched.
    expect(player.previousEvents).toHaveLength(1);
    expect(player.previousEvents[0].outcome).toBe('Double');
    expect(player.currentEvents).toHaveLength(0);
    expect(player.outcomes).toHaveLength(1);
    expect(player.outcomes[0].mode).toBe('previous');
  });

  it('undoing a current no-ball outcome leaves current hit markers intact', () => {
    const c = curHit();
    const player = {
      currentEvents: [c],
      previousEvents: [],
      outcomes: [curK(), { ...c }],
    };
    run(player);
    // Only the strikeout is removed; the current hit and its marker remain.
    expect(player.outcomes).toHaveLength(1);
    expect(player.outcomes[0].type).toBe('hit');
    expect(player.currentEvents).toHaveLength(1);
  });

  it('does nothing when there are no current-game outcomes', () => {
    const p = prevHit();
    const player = { currentEvents: [], previousEvents: [p], outcomes: [{ ...p }] };
    run(player);
    expect(player.outcomes).toHaveLength(1);
    expect(player.previousEvents).toHaveLength(1);
  });
});

/**
 * Unit tests — Bunt quick-button (replaces the former HBP button)
 *
 * The client removed "Hit By Pitch" and asked for a "Bunt" quick button in the
 * same action row. A bunt is logged through recordOutcome() as a no-location
 * plate-appearance event (the same mechanism Walk/HBP used), so it must be
 * excluded from contact tendency, the hot/cold (🔥/🧊) indicator, the
 * slump/hot-streak pills, and the "Current: X for Y" at-bat count — exactly the
 * way Walk and HBP were treated before. These tests lock in that behavior so a
 * future change cannot let a bunt silently skew a hitter's live read.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, beforeAll } from 'vitest';

function read(rel) {
  return readFileSync(resolve(process.cwd(), rel), 'utf-8');
}

describe('Bunt button — index.html', () => {
  let html;
  beforeAll(() => { html = read('index.html'); });

  it('exposes a Bunt quick-action button wired to recordOutcome', () => {
    expect(html).toContain("recordOutcome('Bunt')");
    expect(html).toContain('>Bunt<');
  });

  it('no longer exposes the HBP button or any HBP copy', () => {
    expect(html).not.toContain("recordOutcome('HBP')");
    expect(html).not.toContain('HBP');
  });
});

describe('Bunt excluded from tracking — source wiring', () => {
  it('recommendations.js filters out Bunt (and no longer references HBP)', () => {
    const src = read('js/recommendations.js');
    expect(src).toContain('"Bunt"');
    expect(src).not.toContain('HBP');
  });

  it('ui.js filters out Bunt in hot/cold + AB count (and no longer references HBP)', () => {
    const src = read('js/ui.js');
    expect(src).toContain('"Bunt"');
    expect(src).not.toContain('HBP');
  });

  it('ai.js filters out Bunt from coach-brief context (and no longer references HBP)', () => {
    const src = read('js/ai.js');
    expect(src).toContain("'Bunt'");
    expect(src).not.toContain('HBP');
  });
});

describe('hitterStatus() — a Bunt must not corrupt the hot/cold read', () => {
  let hitterStatus;
  beforeAll(() => {
    // hitterStatus(player) is a pure function of player.outcomes — it touches no
    // DOM — so we can extract it straight from the module source and exercise it.
    const src = read('js/ui.js');
    // eslint-disable-next-line no-new-func
    hitterStatus = new Function(src + '\nreturn hitterStatus;')();
  });

  // outcomes are stored most-recent-first
  const ab = (outcome) => ({ outcome, mode: 'current' });

  it('a bunt between two cold at-bats preserves the cold (🧊) read', () => {
    const player = { outcomes: [ab('Strikeout'), ab('Bunt'), ab('Strikeout')] };
    expect(hitterStatus(player)).toBe('🧊');
  });

  it('a bunt between two hot at-bats preserves the hot (🔥) read', () => {
    const player = { outcomes: [ab('Home Run'), ab('Bunt'), ab('Double')] };
    expect(hitterStatus(player)).toBe('🔥');
  });

  it('a bunt does not by itself trigger any hot/cold icon', () => {
    const player = { outcomes: [ab('Bunt'), ab('Bunt')] };
    expect(hitterStatus(player)).toBe('');
  });

  it('Walk remains excluded from the read alongside Bunt', () => {
    const player = { outcomes: [ab('Strikeout'), ab('Walk'), ab('Strikeout')] };
    expect(hitterStatus(player)).toBe('🧊');
  });
});

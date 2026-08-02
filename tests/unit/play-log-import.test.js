/**
 * Unit tests — Step 13: Play-Log Import (pure logic)
 *
 * The matching, classification, location-mapping, dedup, and event-building
 * helpers in js/play-log-import.js touch no DOM, so they are extracted from the
 * source and exercised directly. zoneLabel (js/utils.js) is loaded alongside so
 * we can prove imported markers land in the zone they claim — and, critically,
 * that ground balls plot in the INFIELD, never the outfield.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, beforeAll } from 'vitest';

function read(rel) {
  return readFileSync(resolve(process.cwd(), rel), 'utf-8');
}

let M; // extracted module functions

beforeAll(() => {
  const utils = read('js/utils.js');
  const src = read('js/play-log-import.js');
  // eslint-disable-next-line no-new-func
  M = new Function(
    utils + '\n' + src + '\n' +
    'return { classifyPlayResult, canonicalOutcome, battedBallType, explicitDirection,' +
    ' fielderToPosition, playLogLocation, jitterCoord, normName, nameCompatible,' +
    ' matchBatterToRoster, dedupPlays, buildEventFromPlay, importPlayLogPlays,' +
    ' zoneLabel, PLAY_LOG_ZONES };'
  )();
});

describe('Step 13 — file exists and loads in the right order', () => {
  it('js/play-log-import.js exists', () => {
    expect(existsSync(resolve(process.cwd(), 'js/play-log-import.js'))).toBe(true);
  });
  it('index.html loads it after roster-import and before memberstack', () => {
    const html = read('index.html');
    const roster = html.indexOf('js/roster-import.js');
    const playLog = html.indexOf('js/play-log-import.js');
    const member = html.indexOf('js/memberstack.js');
    expect(playLog).toBeGreaterThan(roster);
    expect(member).toBeGreaterThan(playLog);
  });
  it('does not name the third-party scorekeeping app', () => {
    const src = read('js/play-log-import.js');
    expect(src.toLowerCase()).not.toContain('gamechanger');
  });
});

describe('classifyPlayResult', () => {
  const cases = [
    ['Single', 'hit'], ['Double', 'hit'], ['Triple', 'hit'], ['Home Run', 'hit'],
    ['Error', 'hit'], ['Fielders Choice', 'hit'],
    ['Ground Out', 'out'], ['Fly Out', 'out'], ['Line Out', 'out'], ['Pop Out', 'out'],
    ['Double Play', 'out'], ['Sac Bunt', 'out'], ['Sac Fly', 'out'],
    ['Walk', 'walk'], ['Hit By Pitch', 'walk'], ["Catcher's Interference", 'walk'],
    ['Strikeout', 'strikeout'],
    ['Runner Out', null], ['', null],
  ];
  cases.forEach(([input, expected]) => {
    it(`${input || '(empty)'} → ${expected}`, () => {
      expect(M.classifyPlayResult(input)).toBe(expected);
    });
  });
});

describe('matchBatterToRoster', () => {
  const roster = [
    { id: 'a', name: 'Avery Nolan', number: '7' },
    { id: 'b', name: 'Jordan Pike', number: '11' },
    { id: 'c', name: 'Casey Vance', number: '9' },
    { id: 'd', name: 'Micah Ellis', number: '3' },
    { id: 'e', name: 'Marcus Ellis', number: '5' },
    { id: 'f', name: 'Devon Ruiz', number: '21' },
  ];

  it('matches "F Last" form uniquely', () => {
    expect(M.matchBatterToRoster({ name: 'A Nolan' }, roster).id).toBe('a');
    expect(M.matchBatterToRoster({ name: 'J Pike' }, roster).id).toBe('b');
  });
  it('matches "First L" form uniquely', () => {
    expect(M.matchBatterToRoster({ name: 'Devon R' }, roster).id).toBe('f');
  });
  it('drops an ambiguous name (two players share initial + last name)', () => {
    expect(M.matchBatterToRoster({ name: 'M Ellis' }, roster)).toBe(null);
  });
  it('matches by jersey alone when unique', () => {
    expect(M.matchBatterToRoster({ name: '', jersey: '9' }, roster).id).toBe('c');
  });
  it('jersey + name disambiguates', () => {
    expect(M.matchBatterToRoster({ name: 'Marcus Ellis', jersey: '5' }, roster).id).toBe('e');
  });
  it('drops a batter who is not on the roster', () => {
    expect(M.matchBatterToRoster({ name: 'Z Smith' }, roster)).toBe(null);
  });
  it('drops when roster is empty', () => {
    expect(M.matchBatterToRoster({ name: 'A Nolan' }, [])).toBe(null);
  });
});

describe('playLogLocation + zoneLabel — ground balls stay in the infield', () => {
  const inOutfield = (z) => z === 'LF' || z === 'CF' || z === 'RF';

  it('ground ball to shortstop → left infield lane (not outfield)', () => {
    const coords = M.playLogLocation({ battedBallType: 'ground', location: { fielder: 'shortstop' } });
    expect(coords).toEqual(M.PLAY_LOG_ZONES.laneLeft);
    expect(inOutfield(M.zoneLabel(coords))).toBe(false);
    expect(coords.x).toBeLessThan(40); // pull side preserved
  });

  it('"hard ground ball to left fielder" → left infield lane, NOT left field', () => {
    const coords = M.playLogLocation({ battedBallType: 'ground', location: { fielder: 'left fielder' } });
    expect(coords).toEqual(M.PLAY_LOG_ZONES.laneLeft);
    expect(inOutfield(M.zoneLabel(coords))).toBe(false);
  });

  it('ground ball up the middle → middle lane (infield)', () => {
    const coords = M.playLogLocation({ battedBallType: 'ground', location: { explicit: 'up the middle' } });
    expect(coords).toEqual(M.PLAY_LOG_ZONES.laneMiddle);
    expect(inOutfield(M.zoneLabel(coords))).toBe(false);
  });

  it('ground ball through the right side → right infield lane', () => {
    const coords = M.playLogLocation({ battedBallType: 'ground', location: { explicit: 'through the right side' } });
    expect(coords).toEqual(M.PLAY_LOG_ZONES.laneRight);
    expect(coords.x).toBeGreaterThan(60);
  });
});

describe('playLogLocation + zoneLabel — line/fly balls go to the outfield', () => {
  it('line drive to right field → RF', () => {
    const coords = M.playLogLocation({ battedBallType: 'line', location: { explicit: 'right field' } });
    expect(M.zoneLabel(coords)).toBe('RF');
    expect(coords.x).toBeGreaterThan(60);
  });
  it('fly ball to center fielder → CF', () => {
    const coords = M.playLogLocation({ battedBallType: 'fly', location: { fielder: 'center fielder' } });
    expect(M.zoneLabel(coords)).toBe('CF');
  });
  it('fly ball to left field → LF', () => {
    const coords = M.playLogLocation({ battedBallType: 'fly', location: { explicit: 'left field' } });
    expect(M.zoneLabel(coords)).toBe('LF');
  });
  it('pop out to second baseman stays in the infield near 2B', () => {
    const coords = M.playLogLocation({ battedBallType: 'popup', location: { fielder: 'second baseman' } });
    expect(coords).toEqual(M.PLAY_LOG_ZONES['2B']);
  });
  it('returns null when no location can be determined', () => {
    expect(M.playLogLocation({ battedBallType: 'none', location: {} })).toBe(null);
  });
});

describe('battedBallType inference from text', () => {
  it('infers ground from the description when no explicit type', () => {
    expect(M.battedBallType({ result: 'Single', rawText: 'singles on a hard ground ball to shortstop' })).toBe('ground');
  });
  it('infers fly from the description', () => {
    expect(M.battedBallType({ result: 'Fly Out', rawText: 'flies out to center fielder' })).toBe('fly');
  });
});

describe('jitterCoord', () => {
  it('is a no-op offset at rnd 0.5 (centered)', () => {
    expect(M.jitterCoord(50, 0.5)).toBe(50);
  });
  it('offsets within ±2.5 and clamps to 2..98', () => {
    expect(M.jitterCoord(50, 0)).toBeCloseTo(47.5, 5);
    expect(M.jitterCoord(50, 1)).toBeCloseTo(52.5, 5);
    expect(M.jitterCoord(1, 0)).toBe(2);
    expect(M.jitterCoord(99, 1)).toBe(98);
  });
});

describe('buildEventFromPlay', () => {
  it('a hit gets a marker with coordinates and isOut false', () => {
    const built = M.buildEventFromPlay({ result: 'Single', battedBallType: 'line', location: { explicit: 'right field' } });
    expect(built.marker).toBe(true);
    expect(built.event.type).toBe('hit');
    expect(built.event.isOut).toBe(false);
    expect(built.event.mode).toBe('previous');
    expect(typeof built.event.x).toBe('number');
    expect(typeof built.event.y).toBe('number');
    expect(built.event.outcome).toBe('Single');
  });
  it('an out in play gets a marker with isOut true', () => {
    const built = M.buildEventFromPlay({ result: 'Ground Out', battedBallType: 'ground', location: { fielder: 'shortstop' } });
    expect(built.marker).toBe(true);
    expect(built.event.isOut).toBe(true);
  });
  it('a walk is a no-location no-marker outcome', () => {
    const built = M.buildEventFromPlay({ result: 'Walk' });
    expect(built.marker).toBe(false);
    expect(built.event).toMatchObject({ outcome: 'Walk', type: 'noBall', mode: 'previous', isOut: false });
    expect(built.event.x).toBeUndefined();
  });
  it('a strikeout is a no-marker out and keeps its kind', () => {
    const built = M.buildEventFromPlay({ result: 'Strikeout', strikeoutKind: 'looking' });
    expect(built.marker).toBe(false);
    expect(built.event).toMatchObject({ outcome: 'Strikeout', type: 'noBall', isOut: true, kind: 'looking' });
  });
  it('returns null for a non-plate-appearance result', () => {
    expect(M.buildEventFromPlay({ result: 'Runner Out' })).toBe(null);
  });
});

describe('dedupPlays', () => {
  it('collapses identical overlapping plays', () => {
    const p = { game: { date: 'Jun 3' }, batter: { name: 'A Nolan' }, result: 'Single', rawText: 'A Nolan singles to left' };
    expect(M.dedupPlays([p, { ...p }, { ...p }])).toHaveLength(1);
  });
  it('keeps distinct plays', () => {
    const p1 = { game: { date: 'Jun 3' }, batter: { name: 'A Nolan' }, result: 'Single', rawText: 'a' };
    const p2 = { game: { date: 'Jun 3' }, batter: { name: 'A Nolan' }, result: 'Walk', rawText: 'b' };
    expect(M.dedupPlays([p1, p2])).toHaveLength(2);
  });
});

describe('importPlayLogPlays — end to end into a team', () => {
  function team() {
    return {
      name: 'Test Team',
      players: [
        { id: 'a', name: 'Avery Nolan', number: '7', currentEvents: [], previousEvents: [], outcomes: [] },
        { id: 'b', name: 'Jordan Pike', number: '11', currentEvents: [], previousEvents: [], outcomes: [] },
      ],
    };
  }

  it('writes markers for balls in play, outcomes for walks/strikeouts, drops unmatched', () => {
    const t = team();
    const plays = [
      { game: { date: 'Jun 3' }, batter: { name: 'A Nolan' }, result: 'Single', battedBallType: 'line', location: { explicit: 'right field' }, rawText: '1' },
      { game: { date: 'Jun 3' }, batter: { name: 'A Nolan' }, result: 'Ground Out', battedBallType: 'ground', location: { fielder: 'shortstop' }, rawText: '2' },
      { game: { date: 'Jun 3' }, batter: { name: 'J Pike' }, result: 'Walk', rawText: '3' },
      { game: { date: 'Jun 3' }, batter: { name: 'J Pike' }, result: 'Strikeout', strikeoutKind: 'looking', rawText: '4' },
      { game: { date: 'Jun 3' }, batter: { name: 'X Unknown' }, result: 'Single', battedBallType: 'line', location: { explicit: 'left field' }, rawText: '5' },
    ];
    const summary = M.importPlayLogPlays(plays, t);

    const nolan = t.players[0];
    const pike = t.players[1];

    // Nolan: one hit + one out, both with markers
    expect(nolan.previousEvents).toHaveLength(2);
    expect(nolan.outcomes).toHaveLength(2);
    // Pike: walk + strikeout, no markers
    expect(pike.previousEvents).toHaveLength(0);
    expect(pike.outcomes).toHaveLength(2);

    expect(summary).toMatchObject({
      playersUpdated: 2, walks: 1, strikeouts: 1, hits: 1, outs: 1, markers: 2, imported: 4,
    });
  });

  it('never creates a roster player for an unmatched batter', () => {
    const t = team();
    M.importPlayLogPlays(
      [{ game: { date: 'x' }, batter: { name: 'Z Nobody' }, result: 'Single', battedBallType: 'line', location: { explicit: 'left field' }, rawText: 'z' }],
      t
    );
    expect(t.players).toHaveLength(2);
  });
});

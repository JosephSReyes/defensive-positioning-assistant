/* Defensive Positioning Assistant — Play-Log Import
 * Imports play-by-play log screenshots into PREVIOUS-game data: it matches each
 * play's batter to the existing roster and writes balls-in-play (spray markers)
 * and walks/strikeouts (no marker) into the same arrays manual charting uses.
 * Unmatched plays are dropped — there is no "Unknown Player" concept.
 * Depends on: storage.js, utils.js, game.js, ui.js, roster-import.js (preprocess)
 *
 * The pure functions below touch no DOM, so they can be unit-tested directly.
 */

// Reference coordinates in the field's 0–100 space (matches js/utils.js zoneLabel
// and the field SVG). Lanes sit INSIDE the dirt diamond so a grounder reads as an
// infield play; outfield zones sit beyond the dirt.
const PLAY_LOG_ZONES = {
  laneLeft:   { x: 32, y: 57 },  // SS–3B lane (reads 3B)
  laneMiddle: { x: 50, y: 50 },  // SS–2B lane (reads 2B)
  laneRight:  { x: 68, y: 57 },  // 1B–2B lane (reads 1B)
  P:   { x: 50, y: 66 },
  C:   { x: 50, y: 78 },
  '1B':{ x: 73, y: 60 },
  '2B':{ x: 62, y: 52 },
  '3B':{ x: 26, y: 58 },
  SS:  { x: 38, y: 52 },
  LF:  { x: 25, y: 25 },
  LCF: { x: 40, y: 18 },
  CF:  { x: 50, y: 15 },
  RCF: { x: 60, y: 18 },
  RF:  { x: 75, y: 25 },
};

// ── classification ───────────────────────────────────────────────────────────
// "hit" (blue dot), "out" (X), "walk" (no marker), "strikeout" (no marker),
// or null to ignore (e.g. base-running outs).
function classifyPlayResult(result) {
  const r = String(result || '').toLowerCase().trim();
  if (!r) return null;
  if (/walk|hit by pitch|hbp|catcher.?s interference/.test(r)) return 'walk';
  if (/strikeout|strikes out|struck out|dropped (3rd|third) strike/.test(r)) return 'strikeout';
  if (/home run|grand slam/.test(r)) return 'hit';
  if (/triple/.test(r)) return 'hit';
  if (/double(?! play)/.test(r)) return 'hit';
  if (/single/.test(r)) return 'hit';
  if (/error|fielder.?s choice|reaches on/.test(r)) return 'hit';
  if (/double play|ground(s)? (out|into)|groundout|fly( |)out|flies out|line( |)out|lines out|pop( |)out|pops out|sac(rifice)? fly|sac(rifice)? bunt/.test(r)) return 'out';
  return null;
}

// Clean, display-friendly outcome label (read by shortOutcome / Last-5).
function canonicalOutcome(result) {
  const r = String(result || '').toLowerCase();
  if (/home run|grand slam/.test(r)) return 'Home Run';
  if (/triple/.test(r)) return 'Triple';
  if (/double(?! play)/.test(r)) return 'Double';
  if (/single/.test(r)) return 'Single';
  if (/fielder.?s choice/.test(r)) return "Fielder's Choice";
  if (/error|reaches on/.test(r)) return 'Error';
  if (/double play|ground|grounds/.test(r)) return 'Ground Out';
  if (/sac(rifice)? fly|fly|flies/.test(r)) return 'Fly Out';
  if (/line|lines/.test(r)) return 'Line Out';
  if (/pop/.test(r)) return 'Pop Out';
  if (/sac(rifice)? bunt/.test(r)) return 'Sac Bunt';
  return String(result || '').trim() || 'In Play';
}

// ── location ─────────────────────────────────────────────────────────────────
function battedBallType(play) {
  const explicit = String(play && play.battedBallType || '').toLowerCase();
  if (/ground/.test(explicit)) return 'ground';
  if (/line/.test(explicit)) return 'line';
  if (/pop/.test(explicit)) return 'popup';
  if (/fly/.test(explicit)) return 'fly';
  const r = (String(play && play.result || '') + ' ' + String(play && play.rawText || '')).toLowerCase();
  if (/ground|grounder|grounds/.test(r)) return 'ground';
  if (/line drive|lines out/.test(r)) return 'line';
  if (/pop(s)? (out|up)|popup|pop fly/.test(r)) return 'popup';
  if (/fly|flies/.test(r)) return 'fly';
  return 'none';
}

// Normalize an explicit hit-location phrase to a direction token.
function explicitDirection(loc) {
  if (!loc) return null;
  const s = String(loc).toLowerCase();
  if (/left.?center/.test(s)) return 'leftcenter';
  if (/right.?center/.test(s)) return 'rightcenter';
  if (/up the middle|through (the )?middle|through center|center/.test(s)) return 'center';
  if (/through (the )?left side|left side|past shortstop|between (shortstop|ss) and (third|3b)/.test(s)) return 'leftside';
  if (/through (the )?right side|right side|between (first|1b) and (second|2b)|past second/.test(s)) return 'rightside';
  if (/left/.test(s)) return 'left';
  if (/right/.test(s)) return 'right';
  return null;
}

// Normalize a fielder phrase to a position code.
function fielderToPosition(f) {
  if (!f) return null;
  const s = String(f).toLowerCase();
  if (/shortstop|\bss\b/.test(s)) return 'SS';
  if (/second base|\b2b\b/.test(s)) return '2B';
  if (/third base|\b3b\b/.test(s)) return '3B';
  if (/first base|\b1b\b/.test(s)) return '1B';
  if (/catcher/.test(s)) return 'C';
  if (/pitcher/.test(s)) return 'P';
  if (/left.?center/.test(s)) return 'LCF';
  if (/right.?center/.test(s)) return 'RCF';
  if (/left field|left fielder/.test(s)) return 'LF';
  if (/center field|center fielder/.test(s)) return 'CF';
  if (/right field|right fielder/.test(s)) return 'RF';
  return null;
}

function infieldLaneCoords(dir) {
  if (dir === 'left' || dir === 'leftside' || dir === 'leftcenter') return PLAY_LOG_ZONES.laneLeft;
  if (dir === 'right' || dir === 'rightside' || dir === 'rightcenter') return PLAY_LOG_ZONES.laneRight;
  return PLAY_LOG_ZONES.laneMiddle;
}

function outfieldZoneCoords(dir) {
  switch (dir) {
    case 'left': case 'leftside': return PLAY_LOG_ZONES.LF;
    case 'leftcenter': return PLAY_LOG_ZONES.LCF;
    case 'rightcenter': return PLAY_LOG_ZONES.RCF;
    case 'right': case 'rightside': return PLAY_LOG_ZONES.RF;
    default: return PLAY_LOG_ZONES.CF;
  }
}

// Resolve a play to base (un-jittered) {x,y} in 0–100 space, or null when no
// location can be determined (the at-bat is still logged, just without a marker).
function playLogLocation(play) {
  const bbt = battedBallType(play);
  const loc = (play && play.location) || {};
  const dir = explicitDirection(loc.explicit);
  const pos = fielderToPosition(loc.fielder);
  const isOutfieldPos = pos && /^(LF|LCF|CF|RCF|RF)$/.test(pos);

  if (bbt === 'ground') {
    // Ground balls always plot in the infield lane they traveled through.
    let d = dir;
    if (!d && pos) {
      if (pos === 'SS' || pos === '3B' || pos === 'LF' || pos === 'LCF') d = 'leftside';
      else if (pos === '1B' || pos === '2B' || pos === 'RF' || pos === 'RCF') d = 'rightside';
      else d = 'middle'; // P, C, CF — up the middle
    }
    return infieldLaneCoords(d || 'middle');
  }

  // Line drives / fly balls / pop-ups go to the outfield, or to the infielder
  // who caught a pop/line if that is all we know.
  if (dir) return outfieldZoneCoords(dir);
  if (isOutfieldPos) return PLAY_LOG_ZONES[pos];
  if (pos && PLAY_LOG_ZONES[pos]) return PLAY_LOG_ZONES[pos];
  return null;
}

// Small offset so repeated balls to one zone don't stack, kept tight enough to
// stay in the same zone. Deterministic jitter is injected for testing.
function jitterCoord(v, rnd) {
  const r = typeof rnd === 'number' ? rnd : Math.random();
  const offset = (r - 0.5) * 5; // ±2.5
  return Math.max(2, Math.min(98, Math.round((v + offset) * 10) / 10));
}

// ── roster matching ──────────────────────────────────────────────────────────
function normName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function nameParts(name) {
  const toks = normName(name).split(' ').filter(Boolean);
  if (toks.length === 0) return null;
  if (toks.length === 1) return { single: toks[0] };
  return { first: toks[0], last: toks[toks.length - 1] };
}

// Two tokens match if equal, or one is a single-letter initial of the other.
function tokenMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length === 1) return b[0] === a;
  if (b.length === 1) return a[0] === b;
  return false;
}

function nameCompatible(batterName, rosterName) {
  const bp = nameParts(batterName);
  const rp = nameParts(rosterName);
  if (!bp || !rp) return false;
  if (bp.single || rp.single) {
    if (bp.single && rp.single) return tokenMatch(bp.single, rp.single);
    if (bp.single) return tokenMatch(bp.single, rp.first) || tokenMatch(bp.single, rp.last);
    return tokenMatch(rp.single, bp.first) || tokenMatch(rp.single, bp.last);
  }
  return tokenMatch(bp.first, rp.first) && tokenMatch(bp.last, rp.last);
}

// Returns the single confidently-matched roster player, or null to drop the play.
function matchBatterToRoster(batter, roster) {
  if (!Array.isArray(roster) || !roster.length) return null;
  const jersey = String(batter && batter.jersey || '').replace(/\D/g, '');
  const name = (batter && batter.name) || '';

  if (jersey) {
    const byJersey = roster.filter(p => String(p.number || '').replace(/\D/g, '') === jersey);
    if (byJersey.length) {
      if (name) {
        const both = byJersey.filter(p => nameCompatible(name, p.name));
        if (both.length === 1) return both[0];
      }
      if (byJersey.length === 1) return byJersey[0];
      return null; // ambiguous jersey, name didn't disambiguate
    }
  }

  if (name) {
    const byName = roster.filter(p => nameCompatible(name, p.name));
    if (byName.length === 1) return byName[0];
  }
  return null;
}

// ── de-duplication ───────────────────────────────────────────────────────────
function playKey(play) {
  const date = (play.game && play.game.date) || '';
  const batter = normName(play.batter && play.batter.name) ||
                 String(play.batter && play.batter.jersey || '');
  const result = String(play.result || '').toLowerCase().trim();
  const raw = String(play.rawText || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return [date, batter, result, raw].join('|');
}

function dedupPlays(plays) {
  const seen = new Set();
  const out = [];
  (plays || []).forEach(p => {
    const k = playKey(p);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(p);
  });
  return out;
}

// ── event building ───────────────────────────────────────────────────────────
// Returns { event, marker } or null. `marker` is true when the event carries
// spray coordinates and must go into previousEvents.
function buildEventFromPlay(play, rnd) {
  const cls = classifyPlayResult(play && play.result);
  if (!cls) return null;
  const time = Date.now();

  if (cls === 'walk') {
    return { event: { outcome: 'Walk', type: 'noBall', mode: 'previous', time, isOut: false }, marker: false };
  }
  if (cls === 'strikeout') {
    const ev = { outcome: 'Strikeout', type: 'noBall', mode: 'previous', time, isOut: true };
    if (play.strikeoutKind) ev.kind = play.strikeoutKind;
    return { event: ev, marker: false };
  }

  const coords = playLogLocation(play);
  const ev = { outcome: canonicalOutcome(play.result), type: 'hit', mode: 'previous', time, isOut: cls === 'out' };
  if (coords) {
    ev.x = jitterCoord(coords.x, rnd);
    ev.y = jitterCoord(coords.y, rnd);
    return { event: ev, marker: true };
  }
  // Ball in play we couldn't locate: log the at-bat, but no marker.
  return { event: ev, marker: false };
}

// Apply a list of extracted plays to the team in place. Returns a summary.
function importPlayLogPlays(plays, team) {
  const roster = (team && team.players) || [];
  const summary = { playersUpdated: 0, walks: 0, strikeouts: 0, hits: 0, outs: 0, markers: 0, imported: 0 };
  const updated = new Set();

  dedupPlays(plays).forEach(play => {
    const player = matchBatterToRoster(play.batter || {}, roster);
    if (!player) return; // unmatched → dropped
    const built = buildEventFromPlay(play);
    if (!built) return;

    player.previousEvents = player.previousEvents || [];
    player.outcomes = player.outcomes || [];
    if (built.marker) player.previousEvents.unshift(built.event);
    player.outcomes.unshift({ ...built.event });
    player.outcomes = player.outcomes.slice(0, 50);

    const cls = classifyPlayResult(play.result);
    if (cls === 'walk') summary.walks++;
    else if (cls === 'strikeout') summary.strikeouts++;
    else if (cls === 'out') summary.outs++;
    else if (cls === 'hit') summary.hits++;
    if (built.marker) summary.markers++;
    summary.imported++;
    updated.add(player.id);
  });

  summary.playersUpdated = updated.size;
  return summary;
}

// ── DOM wiring ───────────────────────────────────────────────────────────────
function openPlayLogImport() {
  const team = getCurrentTeam();
  if (!team || !team.players.length) return;
  const input = document.getElementById('playLogImageInput');
  if (input) input.click();
}

async function readPlayLogFiles(e) {
  const files = e.target.files ? Array.from(e.target.files) : [];
  e.target.value = '';
  if (!files.length) return;

  const team = getCurrentTeam();
  const status = document.getElementById('importStatus');
  if (!team || !team.players.length) {
    if (status) status.textContent = 'Add at least one player before importing plays.';
    return;
  }

  const MAX_FILES = 12;
  if (files.length > MAX_FILES) {
    if (status) status.textContent = `Please select ${MAX_FILES} screenshots or fewer.`;
    return;
  }

  if (status) status.textContent = `Reading ${files.length} screenshot${files.length === 1 ? '' : 's'}…`;

  let images;
  try {
    images = await Promise.all(files.map(async f => ({
      image: await preprocessRosterImage(f),
      mimeType: 'image/jpeg',
    })));
  } catch {
    if (status) status.textContent = 'Could not read one of the images. Try again.';
    return;
  }

  const roster = team.players.map(p => ({ name: p.name, number: p.number }));

  let result;
  try {
    const response = await fetch('/api/openai-play-log-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images, teamName: team.name, roster }),
    });
    result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Server error');
  } catch (err) {
    console.error('Play-log import error:', err);
    if (status) status.textContent = 'Import failed: ' + (err.message || 'Unknown error') + '.';
    return;
  }

  const plays = (result && result.plays) || [];
  if (!plays.length) {
    if (status) status.textContent = 'No plays for this team were found in those screenshots.';
    return;
  }

  const summary = importPlayLogPlays(plays, team);
  save();
  renderTeamScreen();
  if (status) status.textContent = `Imported ${summary.imported} play${summary.imported === 1 ? '' : 's'} for ${summary.playersUpdated} player${summary.playersUpdated === 1 ? '' : 's'}.`;
  showPlayLogSummary(summary);
}

function showPlayLogSummary(summary) {
  const body = document.getElementById('playLogSummaryBody');
  const modal = document.getElementById('playLogSummaryModal');
  if (!body || !modal) return;
  const rows = [
    ['Players Updated', summary.playersUpdated],
    ['Walks Recorded', summary.walks],
    ['Strikeouts Recorded', summary.strikeouts],
    ['Hits Added', summary.hits],
    ['Outs Added', summary.outs],
    ['Spray-Chart Markers Added', summary.markers],
  ];
  body.innerHTML = rows.map(([label, n]) =>
    `<div class="play-log-summary-row"><span>${label}</span><strong>${n}</strong></div>`
  ).join('');
  modal.classList.add('active');
}

function closePlayLogSummary() {
  const modal = document.getElementById('playLogSummaryModal');
  if (modal) modal.classList.remove('active');
}

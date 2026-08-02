/* Defensive Positioning Assistant — AI Coach Brief
 * Fetches AI-generated coaching explanations via /api/ai-coach-brief.
 * Caches recent responses in localStorage to reduce API calls.
 * Depends on: storage.js, game.js, recommendations.js
 */

(function () {
  var CACHE_KEY = 'dpa_coach_brief_cache';
  var CACHE_MAX = 5;
  var CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

  function loadCache() {
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function saveCache(entries) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(entries));
    } catch (e) {
      // localStorage full — silently ignore
    }
  }

  function makeCacheKey(ctx) {
    return [
      ctx.tendency || '',
      ctx.contacts || 0,
      ctx.liveContacts || 0,
      ctx.xbh || 0,
      ctx.deep || 0,
      ctx.slump ? '1' : '0',
      ctx.buntLikely ? '1' : '0',
      (ctx.pitchAdvice || []).join(','),
      ctx.localAnalysis || '',
    ].join('|');
  }

  function getCached(key) {
    var now = Date.now();
    var entries = loadCache().filter(function (e) { return now - e.ts < CACHE_TTL_MS; });
    var found = entries.filter(function (e) { return e.key === key; })[0];
    return found ? found.brief : null;
  }

  function setCache(key, brief) {
    var now = Date.now();
    var entries = loadCache()
      .filter(function (e) { return now - e.ts < CACHE_TTL_MS && e.key !== key; });
    entries.unshift({ key: key, brief: brief, ts: now });
    if (entries.length > CACHE_MAX) entries = entries.slice(0, CACHE_MAX);
    saveCache(entries);
  }

  function readMoveText(pos) {
    var el = document.getElementById('move' + pos);
    if (!el) return null;
    var text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    return /^normal/i.test(text) ? null : text;
  }

  function buildContext() {
    var player = (typeof getActivePlayer === 'function') ? getActivePlayer() : null;
    var tendencyEl = document.getElementById('tendencyText');
    var tendency = tendencyEl ? tendencyEl.textContent : '';

    // Capture the rules-based analysis text currently shown in the explain box
    var localAnalysisEl = document.getElementById('aiExplainText');
    var localAnalysis = localAnalysisEl ? localAnalysisEl.textContent : '';

    // Capture any non-default fielder move recommendations
    var positions = ['LF', 'CF', 'RF', 'SS', '2B', '3B', '1B', 'P'];
    var moves = {};
    positions.forEach(function (pos) {
      var text = readMoveText(pos);
      if (text) moves[pos] = text;
    });

    if (!player) {
      return {
        tendency: tendency,
        localAnalysis: localAnalysis,
        moves: moves,
        contacts: 0,
        liveContacts: 0,
        xbh: 0,
        deep: 0,
        slump: false,
        bunts: 0,
        buntRate: 0,
        buntLikely: false,
        pitchAdvice: [],
      };
    }

    // Count bunts across all history (both modes)
    var allBunts = (player.outcomes || []).filter(function (o) { return o.outcome === 'Bunt'; });
    var buntCount = allBunts.length;
    var totalAbs = (player.outcomes || []).filter(function (o) { return o.outcome !== 'Walk'; }).length;
    var buntRate = totalAbs ? (buntCount / totalAbs) : 0;

    // Bunt is "likely" if 2+ bunts in the last 5 at-bats
    var last5Abs = (player.outcomes || []).slice(0, 5);
    var buntsInLast5 = last5Abs.filter(function (o) { return o.outcome === 'Bunt'; }).length;
    var buntLikely = buntsInLast5 >= 2;

    var allContacts = (player.previousEvents || []).concat(player.currentEvents || [])
      .filter(function (e) { return e.x !== undefined; });
    var liveContacts = (player.currentEvents || []).filter(function (e) { return e.x !== undefined; }).length;
    var xbh = allContacts.filter(function (e) {
      return e.outcome === 'Double' || e.outcome === 'Triple' || e.outcome === 'Home Run';
    }).length;
    var deep = allContacts.filter(function (e) { return e.y < 38 || e.outcome === 'Flyout'; }).length;

    var lastAbs = (player.outcomes || [])
      .filter(function (o) { return o.mode === 'current' && o.outcome !== 'Walk' && o.outcome !== 'Bunt'; })
      .slice(0, 5);
    var coldResults = ['Strikeout', 'Groundout', 'Flyout'];
    var slump = lastAbs.slice(0, 2).length === 2 &&
      lastAbs.slice(0, 2).every(function (o) { return coldResults.indexOf(o.outcome) >= 0; });

    // Pitch effectiveness analysis — deterministic engine
    // Computes per-pitch-type stats, then flags ATTACK / AVOID / NEUTRAL
    // ATTACK: 60%+ out rate with 2+ samples — pitcher should target this pitch
    // AVOID:  50%+ hit rate with 2+ samples — pitcher should avoid this pitch
    // NEUTRAL: insufficient data or mixed results
    var allWithPitch = (player.outcomes || []).filter(function (o) { return o.pitch; });
    var pitchStats = {};
    var pitchLabels = { 'FB': 'Fastball', 'CU': 'Curveball', 'CH': 'Changeup', 'SL': 'Slider', 'OT': 'Other' };
    allWithPitch.forEach(function (o) {
      var p = o.pitch;
      if (!pitchStats[p]) pitchStats[p] = { total: 0, outs: 0, hits: 0, walks: 0 };
      pitchStats[p].total++;
      if (o.isOut) pitchStats[p].outs++;
      else if (o.type === 'hit') pitchStats[p].hits++;
      else if (o.outcome === 'Walk') pitchStats[p].walks++;
    });
    var pitchAdvice = [];
    Object.keys(pitchStats).forEach(function (p) {
      var s = pitchStats[p];
      if (s.total < 2) return;
      var label = pitchLabels[p] || p;
      var outRate = Math.round((s.outs / s.total) * 100);
      var hitRate = Math.round((s.hits / s.total) * 100);
      if (outRate >= 60) {
        pitchAdvice.push(label + ': ATTACK — ' + outRate + '% outs (' + s.outs + '/' + s.total + ')');
      } else if (hitRate >= 50 && s.hits >= 2) {
        pitchAdvice.push(label + ': AVOID — ' + hitRate + '% hits (' + s.hits + '/' + s.total + ')');
      }
    });

    var playerName = (player.number ? '#' + player.number + ' ' : '') + (player.name || '');

    return {
      playerName: playerName,
      tendency: tendency,
      localAnalysis: localAnalysis,
      moves: moves,
      contacts: allContacts.length,
      liveContacts: liveContacts,
      xbh: xbh,
      deep: deep,
      slump: slump,
      bunts: buntCount,
      buntRate: buntRate,
      buntLikely: buntLikely,
      pitchAdvice: pitchAdvice,
    };
  }

  function fetchCoachBrief(ctx) {
    var key = makeCacheKey(ctx);
    var cached = getCached(key);
    if (cached) return Promise.resolve(cached);

    return fetch('/api/ai-coach-brief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: ctx }),
    }).then(function (res) {
      if (!res.ok) throw new Error('Coach brief request failed: ' + res.status);
      return res.json();
    }).then(function (data) {
      var brief = (data && data.brief) ? data.brief : '';
      if (brief) setCache(key, brief);
      return brief;
    });
  }

  window.fetchAICoachBrief = fetchCoachBrief;
  window.buildAIBriefContext = buildContext;
  window._aiCacheFns = { makeCacheKey: makeCacheKey, getCached: getCached, setCache: setCache };
})();

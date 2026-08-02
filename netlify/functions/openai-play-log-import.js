// netlify/functions/openai-play-log-import.js
// Receives one or more play-by-play log screenshots (base64) plus the selected
// team's name and roster, calls OpenAI Vision, and returns a structured list of
// plays for the coach's team only. The model identifies the BATTER of each play
// (never a fielder) and only emits plays it is confident about.
// OPENAI_API_KEY is server-side only — never exposed to the frontend.

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MAX_BASE64_LENGTH = 7 * 1024 * 1024; // ~5 MB image after base64 overhead
const MAX_IMAGES = 12;

// In-memory rate limiter — 5 requests per IP per minute (resets on cold start).
// Lower than roster import because each call may carry many images.
const _rateMap = {};
const RATE_MAX = 5;
const RATE_WINDOW_MS = 60 * 1000;

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = _rateMap[ip];
  if (!entry || now > entry.resetAt) {
    _rateMap[ip] = { count: 1, resetAt: now + RATE_WINDOW_MS };
    return true;
  }
  if (entry.count >= RATE_MAX) return false;
  entry.count++;
  return true;
}

function buildPrompt(teamName, roster) {
  const rosterLines = roster
    .map(p => `- ${p.number ? '#' + p.number + ' ' : ''}${p.name}`)
    .join('\n');

  return [
    'You read play-by-play log screenshots from a baseball/softball scorekeeping app',
    "and pull out only the plays that belong to one coach's roster.",
    '',
    "THE COACH'S ROSTER (these are the only batters whose plays you keep):",
    rosterLines || '(none provided)',
    `(In our app the coach calls this team "${teamName}", but the screenshots may use`,
    ' a different name for it.)',
    '',
    "HOW TO FIND THE COACH'S PLAYS:",
    '- The log is grouped by half-inning ("TOP" = the away team bats, "BOTTOM" = the',
    '  home team bats). BOTH teams appear in the log — one is the coach\'s, one is the',
    '  opponent.',
    '- A team whose roster was entered shows its players BY NAME; a team whose roster',
    '  was not shows them BY JERSEY NUMBER (e.g. "#9 doubles"). The coach\'s team may be',
    '  either one.',
    '- Decide which side is the coach\'s BY THE ROSTER, NOT THE TEAM NAME. In each',
    '  half-inning: if the BATTERS match roster players, the coach\'s team is BATTING —',
    '  keep those plays. If instead the FIELDERS named in the descriptions match the',
    '  roster (the coach\'s players are on defense), the coach\'s team is FIELDING — the',
    '  batters are opponents, so SKIP that whole half-inning, even if a batter\'s jersey',
    '  number happens to match a roster number.',
    '',
    'CRITICAL RULES:',
    '1. Keep a play ONLY if its BATTER is one of the coach\'s roster players, judged by',
    '   the half-inning rule above. Match a named batter by NAME (allow truncated',
    '   "First L" / "F Last" forms, e.g. "Micah E", "Devon R"); match a batter shown',
    '   only as "#N" by JERSEY NUMBER, but ONLY inside a half-inning where the coach\'s',
    '   team is batting. If you are not confident, OMIT the play. Never invent an',
    '   "unknown" batter.',
    '2. Each play has exactly ONE batter — the player who is hitting (the subject of',
    '   the result: "Micah E singles", "Devon R walks", "#12 grounds out").',
    '   NEVER treat a fielder as the batter. Fielders appear after "to shortstop",',
    '   "to catcher", "error by third baseman", "X to Y" — they are defense.',
    '3. A base-runner is NOT the batter. In a strikeout/in-play description where a',
    '   runner "steals 2nd", "advances", or "scores", the batter is whoever the result',
    '   belongs to (e.g. who struck out) — never the runner. Skip base-running outs',
    '   ("Runner Out", "picked off", "caught stealing"), substitutions, and pickoffs;',
    '   they are not plate appearances.',
    '',
    'FOR EACH KEPT PLAY, RETURN AN OBJECT:',
    '{',
    '  "date": "<game date from the screenshot header, e.g. \\"Jun 3\\", or \\"\\">",',
    '  "battingTeam": "<team from the inning header>",',
    '  "batterName": "<batter exactly as written, e.g. \\"A Nolan\\">",',
    '  "batterJersey": "<digits only if the batter is shown as #N, else \\"\\">",',
    '  "result": "<Single|Double|Triple|Home Run|Walk|Hit By Pitch|Catchers Interference|Strikeout|Ground Out|Fly Out|Line Out|Pop Out|Sac Fly|Sac Bunt|Error|Fielders Choice|Double Play>",',
    '  "battedBallType": "<ground|line|fly|popup|none>",',
    '  "locationExplicit": "<explicit hit location if stated, e.g. \\"left field\\", \\"up the middle\\", \\"through the right side\\", else \\"\\">",',
    '  "fielder": "<the fielder position that made the play if stated, e.g. \\"shortstop\\", \\"center fielder\\", else \\"\\">",',
    '  "strikeoutKind": "<looking|swinging if a strikeout and stated, else \\"\\">",',
    '  "rawText": "<the play\'s description text, for de-duplication>"',
    '}',
    '',
    'Return ONLY a valid JSON array of these objects. No markdown, no code fences, no',
    'explanation — just the array. If no plays qualify, return [].',
  ].join('\n');
}

// Recover the complete leading {...} objects from a possibly-truncated JSON array
// string. A response cut off by max_tokens looks like `[ {...}, {...}, {...` —
// every object up to the last complete brace is still valid data. Scans brace
// depth while respecting string literals + escapes (no eval, no dependency).
function salvageObjects(str) {
  const out = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      if (depth > 0) depth--;
      if (depth === 0 && start >= 0) {
        try {
          const obj = JSON.parse(str.slice(start, i + 1));
          if (obj && typeof obj === 'object') out.push(obj);
        } catch {
          /* skip an object we can't parse */
        }
        start = -1;
      }
    }
  }
  return out;
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const rawIp = (event.headers && (event.headers['x-forwarded-for'] || event.headers['x-nf-client-connection-ip'] || '')) || 'unknown';
  const ip = rawIp.split(',')[0].trim().slice(0, 45);
  if (!checkRateLimit(ip)) {
    return { statusCode: 429, body: JSON.stringify({ error: 'Too many requests. Please wait and try again.' }) };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'OpenAI API key not configured' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { images, teamName, roster } = body;

  if (!Array.isArray(images) || images.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing images' }) };
  }
  if (images.length > MAX_IMAGES) {
    return { statusCode: 413, body: JSON.stringify({ error: `Too many images. Maximum ${MAX_IMAGES}.` }) };
  }
  if (!teamName || typeof teamName !== 'string') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing team name' }) };
  }
  if (!Array.isArray(roster) || roster.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Roster is empty — add players before importing.' }) };
  }

  const imageParts = [];
  for (const img of images) {
    const image = img && img.image;
    const mimeType = img && img.mimeType;
    if (!image || typeof image !== 'string') {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing image data' }) };
    }
    if (!mimeType || typeof mimeType !== 'string' || !mimeType.startsWith('image/')) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid image type' }) };
    }
    if (image.length > MAX_BASE64_LENGTH) {
      return { statusCode: 413, body: JSON.stringify({ error: 'Image too large. Maximum 5 MB each.' }) };
    }
    imageParts.push({ type: 'image_url', image_url: { url: `data:${mimeType};base64,${image}`, detail: 'high' } });
  }

  const cleanRoster = roster
    .filter(p => p && typeof p === 'object')
    .map(p => ({
      number: String(p.number || '').replace(/[^\d]/g, '').slice(0, 3),
      name: String(p.name || '').replace(/[<>"&]/g, '').trim().slice(0, 60),
    }))
    .filter(p => p.name);

  const cleanTeamName = String(teamName).replace(/[<>"&]/g, '').trim().slice(0, 80);

  let openAIResponse;
  try {
    openAIResponse = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        // A full game of plays overflowed 4000 output tokens, truncating the JSON
        // array so it failed to parse (7+ screenshots → "Try clearer images").
        // gpt-4o supports up to 16,384 completion tokens; give the array room.
        max_tokens: 16000,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: buildPrompt(cleanTeamName, cleanRoster) },
            ...imageParts,
          ],
        }],
      }),
    });
  } catch (err) {
    console.error('OpenAI fetch error:', err.message);
    return { statusCode: 502, body: JSON.stringify({ error: 'Failed to reach OpenAI' }) };
  }

  if (!openAIResponse.ok) {
    const errText = await openAIResponse.text().catch(() => '');
    console.error('OpenAI API error:', openAIResponse.status, errText);
    return { statusCode: 502, body: JSON.stringify({ error: 'OpenAI API error' }) };
  }

  let data;
  try {
    data = await openAIResponse.json();
  } catch {
    return { statusCode: 502, body: JSON.stringify({ error: 'Invalid response from OpenAI' }) };
  }

  const rawContent = data?.choices?.[0]?.message?.content || '';

  let plays;
  const cleaned = rawContent.replace(/```(?:json)?\n?/g, '').trim();
  try {
    plays = JSON.parse(cleaned);
    if (!Array.isArray(plays)) throw new Error('Response is not an array');
  } catch {
    // A large import can overflow max_tokens and truncate the array mid-stream.
    // Recover the complete leading objects instead of dropping the whole
    // response; only give up if nothing salvageable came back.
    plays = salvageObjects(cleaned);
    if (!plays.length) {
      console.error('Failed to parse play-log response:', rawContent);
      return {
        statusCode: 422,
        body: JSON.stringify({ error: 'Could not read plays from the screenshots. Try clearer images.' }),
      };
    }
  }

  const clean = s => String(s == null ? '' : s).replace(/[<>"&]/g, '').trim().slice(0, 200);

  const sanitized = plays
    .filter(p => p && typeof p === 'object')
    .map(p => ({
      game: { date: clean(p.date).slice(0, 40) },
      battingTeam: clean(p.battingTeam).slice(0, 80),
      batter: {
        name: clean(p.batterName).slice(0, 60),
        jersey: String(p.batterJersey || '').replace(/[^\d]/g, '').slice(0, 3),
      },
      result: clean(p.result).slice(0, 40),
      battedBallType: clean(p.battedBallType).toLowerCase().slice(0, 12),
      location: {
        explicit: clean(p.locationExplicit).slice(0, 60),
        fielder: clean(p.fielder).slice(0, 40),
      },
      strikeoutKind: clean(p.strikeoutKind).toLowerCase().slice(0, 12),
      rawText: clean(p.rawText),
    }))
    .filter(p => p.result && (p.batter.name || p.batter.jersey));

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plays: sanitized }),
  };
};

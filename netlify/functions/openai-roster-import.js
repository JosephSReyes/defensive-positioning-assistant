// netlify/functions/openai-roster-import.js
// Receives a roster image (base64) from the frontend, calls OpenAI Vision,
// and returns a structured JSON array of { number, name } player objects.
// OPENAI_API_KEY is server-side only — never exposed to the frontend.

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MAX_BASE64_LENGTH = 7 * 1024 * 1024; // ~5 MB image after base64 overhead

// In-memory rate limiter — 10 requests per IP per minute (resets on cold start)
const _rateMap = {};
const RATE_MAX = 10;
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

const EXTRACT_PROMPT = [
  'You are an expert baseball and softball roster extractor.',
  'Extract player names and jersey numbers from this image.',
  '',
  'The image may be any of these formats:',
  '- A handwritten lineup card (jersey number column on the left, handwritten names beside it)',
  '- A printed team roster or lineup sheet',
  '- A mobile app screenshot (e.g. a scorekeeping or team-management app) with entries like "F Last #N (Pos)" or "First Last #N (Pos)"',
  '- A photo of a whiteboard, chalkboard, or paper roster',
  '',
  'EXTRACTION RULES:',
  '1. Extract the PRIMARY starting lineup only. If a separate substitute/bench section exists, ignore it.',
  '2. Handwritten cards: the jersey number is in the leftmost column; the player name is the handwritten text to its right. Ignore POS, SUBS, and INN columns.',
  '3. App screenshots: the jersey number follows a # symbol (e.g. "J Pike #11"). Extract digits after # as the number.',
  '4. TRUNCATED NAMES: If a name is cut off with "..." (e.g. "C Van...", "M Elli..."), find the full name elsewhere in the image — check the stats notes, totals section, or any text block at the bottom — and use the complete name.',
  '5. Do NOT include: coaches, managers, team totals rows, statistical columns (AB, R, H, RBI, BB, SO), scores, header rows, or any non-player text.',
  '6. Use First Last name format. If only an initial and last name are visible and no full first name exists elsewhere, use what is shown (e.g. "C Vance").',
  '',
  'Return ONLY a valid JSON array. No markdown, no explanation, no code fences — only the array.',
  'Format: [{"number":"12","name":"Sam Okafor"},{"number":"9","name":"C Vance"}]',
  '- number: digits only, empty string if not visible',
  '- name: as written or reconstructed from the image, max 40 characters',
].join('\n');

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

  const { image, mimeType } = body;

  if (!image || typeof image !== 'string') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing image data' }) };
  }

  if (!mimeType || !mimeType.startsWith('image/')) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid image type' }) };
  }

  if (image.length > MAX_BASE64_LENGTH) {
    return { statusCode: 413, body: JSON.stringify({ error: 'Image too large. Maximum 5 MB.' }) };
  }

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
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: EXTRACT_PROMPT },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${image}`, detail: 'high' } },
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

  let players;
  try {
    const cleaned = rawContent.replace(/```(?:json)?\n?/g, '').trim();
    players = JSON.parse(cleaned);
    if (!Array.isArray(players)) throw new Error('Response is not an array');
  } catch {
    console.error('Failed to parse OpenAI roster response:', rawContent);
    return {
      statusCode: 422,
      body: JSON.stringify({ error: 'Could not parse roster from image. Try a clearer photo.' }),
    };
  }

  const sanitized = players
    .filter(p => p && typeof p === 'object')
    .map(p => ({
      number: String(p.number || '').replace(/[^\d]/g, '').slice(0, 3),
      name: String(p.name || '').replace(/[<>"&]/g, '').trim().slice(0, 60),
    }))
    .filter(p => p.name && /[a-zA-Z]/.test(p.name));

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ players: sanitized }),
  };
};

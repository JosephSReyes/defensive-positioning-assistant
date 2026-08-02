// tests/integration/roster-import.integration.test.js
// Step 8 — AI Roster Import
// Tests the openai-roster-import Netlify Function handler directly
// using a mocked fetch so no real OpenAI calls are made.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(process.cwd());
const FUNCTION_PATH = resolve(ROOT, 'netlify', 'functions', 'openai-roster-import.js');

// ── helper: build a mock OpenAI response ──────────────────────────────────────
function mockOpenAIResponse(content) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content } }],
    }),
    text: async () => content,
  };
}

function mockOpenAIError(status) {
  return {
    ok: false,
    status,
    text: async () => 'OpenAI error',
    json: async () => ({ error: 'OpenAI error' }),
  };
}

// ── helper: build a minimal POST event ───────────────────────────────────────
function makeEvent(body, method = 'POST') {
  return {
    httpMethod: method,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

// ── file existence ────────────────────────────────────────────────────────────
describe('Step 8 — openai-roster-import.js file', () => {
  it('exists', () => {
    expect(existsSync(FUNCTION_PATH)).toBe(true);
  });

  it('exports a handler function', () => {
    const src = readFileSync(FUNCTION_PATH, 'utf-8');
    expect(src).toMatch(/exports\.handler\s*=/);
  });

  it('does not contain hardcoded API keys', () => {
    const src = readFileSync(FUNCTION_PATH, 'utf-8');
    expect(src).not.toMatch(/sk-[A-Za-z0-9]{20,}/);
  });

  it('uses detail: high for better handwriting recognition', () => {
    const src = readFileSync(FUNCTION_PATH, 'utf-8');
    expect(src).toMatch(/detail\s*:\s*['"]high['"]/);
  });

  it('prompt instructs extraction of truncated names from notes section', () => {
    const src = readFileSync(FUNCTION_PATH, 'utf-8');
    expect(src).toMatch(/TRUNCATED/i);
  });
});

// ── handler behavior ──────────────────────────────────────────────────────────
describe('Step 8 — openai-roster-import handler', () => {
  let handler;
  const VALID_IMAGE = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';

  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn());
    process.env.OPENAI_API_KEY = 'sk-test-key';
    // Re-require to pick up fresh env/globals each test
    vi.resetModules();
    const mod = await import(FUNCTION_PATH + '?t=' + Date.now());
    handler = mod.handler || (await import(FUNCTION_PATH)).handler;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
  });

  it('returns 405 for non-POST requests', async () => {
    const res = await handler(makeEvent({}, 'GET'));
    expect(res.statusCode).toBe(405);
  });

  it('returns 500 when OPENAI_API_KEY is missing', async () => {
    delete process.env.OPENAI_API_KEY;
    const res = await handler(makeEvent({ image: VALID_IMAGE, mimeType: 'image/png' }));
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toMatch(/api key/i);
  });

  it('returns 400 for invalid JSON body', async () => {
    const res = await handler({ httpMethod: 'POST', body: 'not-json' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when image is missing', async () => {
    const res = await handler(makeEvent({ mimeType: 'image/png' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/missing image/i);
  });

  it('returns 400 when mimeType is not an image', async () => {
    const res = await handler(makeEvent({ image: VALID_IMAGE, mimeType: 'text/plain' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/invalid image type/i);
  });

  it('returns 413 when image is too large', async () => {
    const hugeImage = 'A'.repeat(8 * 1024 * 1024);
    const res = await handler(makeEvent({ image: hugeImage, mimeType: 'image/jpeg' }));
    expect(res.statusCode).toBe(413);
  });

  it('returns 502 when OpenAI is unreachable', async () => {
    fetch.mockRejectedValueOnce(new Error('Network failure'));
    const res = await handler(makeEvent({ image: VALID_IMAGE, mimeType: 'image/png' }));
    expect(res.statusCode).toBe(502);
    expect(JSON.parse(res.body).error).toMatch(/reach openai/i);
  });

  it('returns 502 when OpenAI returns an error status', async () => {
    fetch.mockResolvedValueOnce(mockOpenAIError(429));
    const res = await handler(makeEvent({ image: VALID_IMAGE, mimeType: 'image/png' }));
    expect(res.statusCode).toBe(502);
  });

  it('returns 422 when OpenAI returns unparseable content', async () => {
    fetch.mockResolvedValueOnce(mockOpenAIResponse('Sorry, I cannot read that.'));
    const res = await handler(makeEvent({ image: VALID_IMAGE, mimeType: 'image/png' }));
    expect(res.statusCode).toBe(422);
  });

  it('returns 200 with players on valid OpenAI response', async () => {
    const players = [{ number: '12', name: 'John Smith' }, { number: '', name: 'Jane Doe' }];
    fetch.mockResolvedValueOnce(mockOpenAIResponse(JSON.stringify(players)));
    const res = await handler(makeEvent({ image: VALID_IMAGE, mimeType: 'image/png' }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.players).toHaveLength(2);
    expect(body.players[0].name).toBe('John Smith');
    expect(body.players[0].number).toBe('12');
  });

  it('strips markdown code fences from OpenAI response', async () => {
    const players = [{ number: '7', name: 'Carter Jones' }];
    fetch.mockResolvedValueOnce(mockOpenAIResponse('```json\n' + JSON.stringify(players) + '\n```'));
    const res = await handler(makeEvent({ image: VALID_IMAGE, mimeType: 'image/png' }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).players[0].name).toBe('Carter Jones');
  });

  it('sanitizes player names — strips HTML special chars so they cannot be injected', async () => {
    const players = [{ number: '3', name: '<script>alert("xss")</script>' }];
    fetch.mockResolvedValueOnce(mockOpenAIResponse(JSON.stringify(players)));
    const res = await handler(makeEvent({ image: VALID_IMAGE, mimeType: 'image/png' }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.players).toHaveLength(1);
    expect(body.players[0].name).not.toContain('<');
    expect(body.players[0].name).not.toContain('>');
    expect(body.players[0].name).not.toContain('"');
    expect(body.players[0].name).not.toContain('&');
  });

  it('sanitizes jersey numbers — keeps only digits', async () => {
    const players = [{ number: '#12a', name: 'Test Player' }];
    fetch.mockResolvedValueOnce(mockOpenAIResponse(JSON.stringify(players)));
    const res = await handler(makeEvent({ image: VALID_IMAGE, mimeType: 'image/png' }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).players[0].number).toBe('12');
  });

  it('filters out players with no alphabetic name', async () => {
    const players = [
      { number: '1', name: 'Valid Player' },
      { number: '2', name: '   ' },
      { number: '3', name: '123' },
    ];
    fetch.mockResolvedValueOnce(mockOpenAIResponse(JSON.stringify(players)));
    const res = await handler(makeEvent({ image: VALID_IMAGE, mimeType: 'image/png' }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).players).toHaveLength(1);
  });

  it('returns empty players array when OpenAI finds no names', async () => {
    fetch.mockResolvedValueOnce(mockOpenAIResponse('[]'));
    const res = await handler(makeEvent({ image: VALID_IMAGE, mimeType: 'image/png' }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).players).toHaveLength(0);
  });
});

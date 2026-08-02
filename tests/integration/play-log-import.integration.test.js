// tests/integration/play-log-import.integration.test.js
// Step 13 — Play-Log Import
// Tests the openai-play-log-import Netlify Function handler directly with a
// mocked fetch so no real OpenAI calls are made.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(process.cwd());
const FUNCTION_PATH = resolve(ROOT, 'netlify', 'functions', 'openai-play-log-import.js');

const VALID_IMAGE = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';

function mockOpenAIResponse(content) {
  return { ok: true, json: async () => ({ choices: [{ message: { content } }] }), text: async () => content };
}
function mockOpenAIError(status) {
  return { ok: false, status, text: async () => 'OpenAI error', json: async () => ({ error: 'OpenAI error' }) };
}
function makeEvent(body, method = 'POST') {
  return { httpMethod: method, body: typeof body === 'string' ? body : JSON.stringify(body) };
}
function validBody(overrides = {}) {
  return {
    images: [{ image: VALID_IMAGE, mimeType: 'image/png' }],
    teamName: 'Riverside Rockets 12U',
    roster: [{ name: 'Avery Nolan', number: '7' }, { name: 'Jordan Pike', number: '11' }],
    ...overrides,
  };
}

describe('Step 13 — openai-play-log-import.js file', () => {
  it('exists', () => {
    expect(existsSync(FUNCTION_PATH)).toBe(true);
  });
  it('exports a handler function', () => {
    expect(readFileSync(FUNCTION_PATH, 'utf-8')).toMatch(/exports\.handler\s*=/);
  });
  it('defines a rate limiter', () => {
    expect(readFileSync(FUNCTION_PATH, 'utf-8')).toMatch(/checkRateLimit/);
  });
  it('does not contain hardcoded API keys', () => {
    expect(readFileSync(FUNCTION_PATH, 'utf-8')).not.toMatch(/sk-[A-Za-z0-9]{20,}/);
  });
  it('instructs the model to identify the team by the roster, anchor jersey matches per half-inning, and not confuse runners/fielders for the batter', () => {
    const src = readFileSync(FUNCTION_PATH, 'utf-8');
    expect(src).toMatch(/never\s+treat a fielder as the batter/i);
    expect(src).toMatch(/by the roster, not the team name/i);
    // jersey numbers are only trusted inside the coach's batting half-inning
    expect(src).toMatch(/skip that whole half-inning/i);
    expect(src).toMatch(/jersey number/i);
    // a base-runner must not be credited as the batter
    expect(src).toMatch(/base-runner is not the batter/i);
  });
  it('does not name the third-party scorekeeping app', () => {
    expect(readFileSync(FUNCTION_PATH, 'utf-8').toLowerCase()).not.toContain('gamechanger');
  });
});

describe('Step 13 — openai-play-log-import handler', () => {
  let handler;

  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn());
    process.env.OPENAI_API_KEY = 'sk-test-key';
    vi.resetModules();
    const mod = await import(FUNCTION_PATH + '?t=' + Date.now());
    handler = mod.handler;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
  });

  it('returns 405 for non-POST requests', async () => {
    expect((await handler(makeEvent({}, 'GET'))).statusCode).toBe(405);
  });
  it('returns 500 when OPENAI_API_KEY is missing', async () => {
    delete process.env.OPENAI_API_KEY;
    const res = await handler(makeEvent(validBody()));
    expect(res.statusCode).toBe(500);
  });
  it('returns 400 for invalid JSON body', async () => {
    expect((await handler({ httpMethod: 'POST', body: 'not-json' })).statusCode).toBe(400);
  });
  it('returns 400 when images are missing', async () => {
    const res = await handler(makeEvent(validBody({ images: [] })));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/missing images/i);
  });
  it('returns 400 when team name is missing', async () => {
    const res = await handler(makeEvent(validBody({ teamName: '' })));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/team name/i);
  });
  it('returns 400 when roster is empty', async () => {
    const res = await handler(makeEvent(validBody({ roster: [] })));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/roster is empty/i);
  });
  it('returns 413 when too many images are sent', async () => {
    const many = Array.from({ length: 13 }, () => ({ image: VALID_IMAGE, mimeType: 'image/png' }));
    expect((await handler(makeEvent(validBody({ images: many })))).statusCode).toBe(413);
  });
  it('returns 400 when an image has a non-image mime type', async () => {
    const res = await handler(makeEvent(validBody({ images: [{ image: VALID_IMAGE, mimeType: 'text/plain' }] })));
    expect(res.statusCode).toBe(400);
  });
  it('returns 502 when OpenAI is unreachable', async () => {
    fetch.mockRejectedValueOnce(new Error('Network failure'));
    expect((await handler(makeEvent(validBody()))).statusCode).toBe(502);
  });
  it('returns 502 when OpenAI returns an error status', async () => {
    fetch.mockResolvedValueOnce(mockOpenAIError(429));
    expect((await handler(makeEvent(validBody()))).statusCode).toBe(502);
  });
  it('returns 422 when OpenAI returns unparseable content', async () => {
    fetch.mockResolvedValueOnce(mockOpenAIResponse('Sorry, I cannot read that.'));
    expect((await handler(makeEvent(validBody()))).statusCode).toBe(422);
  });

  it('requests a high output-token ceiling so large imports are not truncated', async () => {
    // Spec 03: max_tokens:4000 truncated the plays array at ~7+ screenshots.
    fetch.mockResolvedValueOnce(mockOpenAIResponse('[]'));
    await handler(makeEvent(validBody()));
    const sentBody = JSON.parse(fetch.mock.calls[0][1].body);
    expect(sentBody.max_tokens).toBeGreaterThanOrEqual(16000);
  });

  it('salvages complete plays from a response truncated by the token limit', async () => {
    // A cut-off array (no closing `]`) — the first object even carries a brace
    // inside a string value to prove the salvage scanner is string-aware.
    const truncated =
      '[{"date":"Jun 3","batterName":"A Nolan","result":"Single","rawText":"single {bizarre} note"},' +
      '{"date":"Jun 3","batterName":"J Pike","result":"Double","rawText":"J Pike doubles"},' +
      '{"date":"Jun 3","batterName":"M Smith","result":"Wal';
    fetch.mockResolvedValueOnce(mockOpenAIResponse(truncated));
    const res = await handler(makeEvent(validBody()));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.plays).toHaveLength(2); // two complete objects kept, partial dropped
    expect(body.plays.map((p) => p.result)).toEqual(['Single', 'Double']);
  });

  it('still returns 422 when a truncated response has no complete plays', async () => {
    fetch.mockResolvedValueOnce(mockOpenAIResponse('[{"date":"Jun 3","batterName":"A Nol'));
    expect((await handler(makeEvent(validBody()))).statusCode).toBe(422);
  });

  it('returns 200 with structured, sanitized plays', async () => {
    const plays = [{
      date: 'Jun 3', battingTeam: 'Riverside Rockets 12U', batterName: 'A Nolan', batterJersey: '',
      result: 'Single', battedBallType: 'ground', locationExplicit: '', fielder: 'left fielder',
      strikeoutKind: '', rawText: 'A Nolan singles to left fielder',
    }];
    fetch.mockResolvedValueOnce(mockOpenAIResponse(JSON.stringify(plays)));
    const res = await handler(makeEvent(validBody()));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.plays).toHaveLength(1);
    expect(body.plays[0]).toMatchObject({
      battingTeam: 'Riverside Rockets 12U',
      batter: { name: 'A Nolan', jersey: '' },
      result: 'Single',
      location: { fielder: 'left fielder' },
    });
    expect(body.plays[0].game.date).toBe('Jun 3');
  });

  it('strips markdown code fences from the response', async () => {
    const plays = [{ batterName: 'J Pike', result: 'Walk', rawText: 'J Pike walks' }];
    fetch.mockResolvedValueOnce(mockOpenAIResponse('```json\n' + JSON.stringify(plays) + '\n```'));
    const res = await handler(makeEvent(validBody()));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).plays[0].result).toBe('Walk');
  });

  it('drops entries with no result and sanitizes HTML from batter names', async () => {
    const plays = [
      { batterName: '<b>A Nolan</b>', result: 'Single', rawText: 'x' },
      { batterName: 'No Result Guy', result: '', rawText: 'y' },
    ];
    fetch.mockResolvedValueOnce(mockOpenAIResponse(JSON.stringify(plays)));
    const res = await handler(makeEvent(validBody()));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.plays).toHaveLength(1);
    expect(body.plays[0].batter.name).not.toContain('<');
    expect(body.plays[0].batter.name).not.toContain('>');
  });

  it('returns an empty array when the model finds no qualifying plays', async () => {
    fetch.mockResolvedValueOnce(mockOpenAIResponse('[]'));
    const res = await handler(makeEvent(validBody()));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).plays).toHaveLength(0);
  });
});

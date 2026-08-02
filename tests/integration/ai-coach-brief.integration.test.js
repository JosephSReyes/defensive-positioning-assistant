// tests/integration/ai-coach-brief.integration.test.js
// Step 9 — AI Coach Brief
// Tests the ai-coach-brief Netlify Function handler directly
// using a mocked fetch so no real OpenAI calls are made.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(process.cwd());
const FUNCTION_PATH = resolve(ROOT, 'netlify', 'functions', 'ai-coach-brief.js');

// helper: build a mock OpenAI response
function mockOpenAIResponse(content) {
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
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

function makeEvent(body, method = 'POST') {
  return {
    httpMethod: method,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

const VALID_CONTEXT = {
  playerName: '#12 John Smith',
  tendency: '52% Right Side',
  contacts: 5,
  liveContacts: 2,
  xbh: 1,
  deep: 2,
  slump: false,
  outs: 1,
  runners: ['1st'],
  score: 'normal',
};

// ── file existence ────────────────────────────────────────────────────────────
describe('Step 9 — ai-coach-brief.js file', () => {
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

  it('uses gpt-4o-mini for cost-efficient text generation', () => {
    const src = readFileSync(FUNCTION_PATH, 'utf-8');
    expect(src).toMatch(/gpt-4o-mini/);
  });

  it('exports _buildUserPrompt for testing', () => {
    const src = readFileSync(FUNCTION_PATH, 'utf-8');
    expect(src).toMatch(/_buildUserPrompt/);
  });

  it('system prompt instructs AI to use player-perspective left/right', () => {
    const src = readFileSync(FUNCTION_PATH, 'utf-8');
    // The prompt must tell the model to describe movement from the fielder's
    // own perspective (facing home plate), matching the on-field tags.
    // Match the literal source — the apostrophe is backslash-escaped in JS.
    expect(src).toContain("fielder\\'s own perspective");
    expect(src).toContain('Right Side pull');
    expect(src).toContain('Left Side pull');
  });
});

// ── prompt builder ────────────────────────────────────────────────────────────
describe('Step 9 — buildUserPrompt', () => {
  let buildUserPrompt;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import(FUNCTION_PATH + '?t=' + Date.now());
    buildUserPrompt = mod._buildUserPrompt;
  });

  it('includes player name when provided', () => {
    const prompt = buildUserPrompt({ playerName: '#7 Jane Doe', tendency: '60% Left Side' });
    expect(prompt).toContain('#7 Jane Doe');
  });

  it('includes tendency in prompt', () => {
    const prompt = buildUserPrompt({ tendency: '60% Left Side' });
    expect(prompt).toContain('60% Left Side');
  });

  it('includes contacts count', () => {
    const prompt = buildUserPrompt({ contacts: 5, liveContacts: 2 });
    expect(prompt).toContain('5');
    expect(prompt).toContain('2');
  });

  it('includes slump notice when hitter is cold', () => {
    const prompt = buildUserPrompt({ tendency: '50% Middle', slump: true });
    expect(prompt).toMatch(/cold/i);
  });

  it('omits slump line when hitter is not cold', () => {
    const prompt = buildUserPrompt({ tendency: '50% Middle', slump: false });
    expect(prompt).not.toMatch(/cold/i);
  });

  it('includes runners on base', () => {
    const prompt = buildUserPrompt({ tendency: '50% Middle', runners: ['1st', '2nd'] });
    expect(prompt).toContain('1st');
    expect(prompt).toContain('2nd');
  });

  it('omits score line when normal', () => {
    const prompt = buildUserPrompt({ tendency: '50% Middle', score: 'normal' });
    expect(prompt).not.toContain('Score situation');
  });

  it('includes score situation when not normal', () => {
    const prompt = buildUserPrompt({ tendency: '50% Middle', score: 'protect' });
    expect(prompt).toContain('protect');
  });

  it('returns empty string for empty context', () => {
    const prompt = buildUserPrompt({});
    expect(prompt.trim()).toBe('');
  });
});

// ── handler behavior ──────────────────────────────────────────────────────────
describe('Step 9 — ai-coach-brief handler', () => {
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
    const res = await handler(makeEvent({}, 'GET'));
    expect(res.statusCode).toBe(405);
  });

  it('returns 500 when OPENAI_API_KEY is missing', async () => {
    delete process.env.OPENAI_API_KEY;
    const res = await handler(makeEvent({ context: VALID_CONTEXT }));
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toMatch(/api key/i);
  });

  it('returns 400 for invalid JSON body', async () => {
    const res = await handler({ httpMethod: 'POST', body: 'not-json' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when context is missing', async () => {
    const res = await handler(makeEvent({ notContext: {} }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/missing context/i);
  });

  it('returns 400 when context is an array', async () => {
    const res = await handler(makeEvent({ context: [] }));
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when context produces empty prompt', async () => {
    const res = await handler(makeEvent({ context: {} }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/insufficient/i);
  });

  it('returns 502 when OpenAI is unreachable', async () => {
    fetch.mockRejectedValueOnce(new Error('Network failure'));
    const res = await handler(makeEvent({ context: VALID_CONTEXT }));
    expect(res.statusCode).toBe(502);
    expect(JSON.parse(res.body).error).toMatch(/reach openai/i);
  });

  it('returns 502 when OpenAI returns an error status', async () => {
    fetch.mockResolvedValueOnce(mockOpenAIError(429));
    const res = await handler(makeEvent({ context: VALID_CONTEXT }));
    expect(res.statusCode).toBe(502);
  });

  it('returns 502 when OpenAI returns empty content', async () => {
    fetch.mockResolvedValueOnce(mockOpenAIResponse(''));
    const res = await handler(makeEvent({ context: VALID_CONTEXT }));
    expect(res.statusCode).toBe(502);
    expect(JSON.parse(res.body).error).toMatch(/empty/i);
  });

  it('returns 200 with brief on valid OpenAI response', async () => {
    fetch.mockResolvedValueOnce(mockOpenAIResponse('Shift the outfield three steps toward right. This hitter consistently drives to right field.'));
    const res = await handler(makeEvent({ context: VALID_CONTEXT }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.brief).toContain('right');
  });

  it('sanitizes HTML special chars in OpenAI response', async () => {
    fetch.mockResolvedValueOnce(mockOpenAIResponse('<script>alert("xss")</script>Shift right.'));
    const res = await handler(makeEvent({ context: VALID_CONTEXT }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.brief).not.toContain('<script>');
    expect(body.brief).not.toContain('"');
    expect(body.brief).toContain('&lt;');
  });

  it('trims whitespace from OpenAI response', async () => {
    fetch.mockResolvedValueOnce(mockOpenAIResponse('  Shift right.  \n'));
    const res = await handler(makeEvent({ context: VALID_CONTEXT }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).brief).toBe('Shift right.');
  });

  it('sends Authorization header with API key', async () => {
    fetch.mockResolvedValueOnce(mockOpenAIResponse('Good read.'));
    await handler(makeEvent({ context: VALID_CONTEXT }));
    const callArgs = fetch.mock.calls[0];
    expect(callArgs[1].headers['Authorization']).toBe('Bearer sk-test-key');
  });

  it('sends system prompt to OpenAI', async () => {
    fetch.mockResolvedValueOnce(mockOpenAIResponse('Good read.'));
    await handler(makeEvent({ context: VALID_CONTEXT }));
    const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
    expect(requestBody.messages[0].role).toBe('system');
    expect(requestBody.messages[0].content).toMatch(/coaching assistant/i);
  });
});

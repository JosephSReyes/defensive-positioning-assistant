// tests/integration/security.integration.test.js
// Step 11 — Security Hardening
// Validates security headers, rate limiting, input validation, secret isolation,
// and storage schema safety. Does not duplicate existing Step 5/8/9 tests.

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(process.cwd());

// ── 1. netlify.toml security headers ─────────────────────────────────────────

describe('Step 11 — netlify.toml security headers', () => {
  let toml;
  beforeAll(() => { toml = readFileSync(resolve(ROOT, 'netlify.toml'), 'utf-8'); });

  it('has X-Frame-Options: DENY', () => {
    expect(toml).toMatch(/X-Frame-Options\s*=\s*["']?DENY["']?/);
  });

  it('has X-Content-Type-Options: nosniff', () => {
    expect(toml).toMatch(/X-Content-Type-Options\s*=\s*["']?nosniff["']?/);
  });

  it('has Referrer-Policy', () => {
    expect(toml).toMatch(/Referrer-Policy/);
  });

  it('has Strict-Transport-Security (HSTS)', () => {
    expect(toml).toMatch(/Strict-Transport-Security/);
    expect(toml).toMatch(/max-age=/);
  });

  it('has Permissions-Policy restricting camera and microphone', () => {
    expect(toml).toMatch(/Permissions-Policy/);
    expect(toml).toMatch(/camera=\(\)/);
    expect(toml).toMatch(/microphone=\(\)/);
  });

  it('has Content-Security-Policy header', () => {
    expect(toml).toMatch(/Content-Security-Policy/);
  });

  it('CSP blocks frame-src', () => {
    expect(toml).toMatch(/frame-src\s+'none'/);
  });

  it('CSP blocks object-src', () => {
    expect(toml).toMatch(/object-src\s+'none'/);
  });

  it('CSP restricts base-uri to self', () => {
    expect(toml).toMatch(/base-uri\s+'self'/);
  });
});

// ── 2. No secrets in frontend JS files ────────────────────────────────────────

describe('Step 11 — No secrets in frontend JS files', () => {
  const jsFiles = [
    'js/app.js', 'js/storage.js', 'js/utils.js', 'js/game.js',
    'js/recommendations.js', 'js/ui.js', 'js/memberstack.js',
    'js/roster-import.js', 'js/batter.js', 'js/spray-charts.js', 'js/ai.js',
  ];
  const secretPatterns = [
    [/sk-[A-Za-z0-9]{20,}/, 'bare OpenAI key'],
    [/sk_(live|test)_[A-Za-z0-9]{20,}/, 'Stripe secret key'],
    [/OPENAI_API_KEY\s*=\s*["'][^"']+["']/, 'hardcoded OPENAI_API_KEY assignment'],
    [/Bearer\s+sk-[A-Za-z0-9]/, 'Bearer token with key'],
  ];

  for (const jsFile of jsFiles) {
    const filePath = resolve(ROOT, jsFile);
    if (!existsSync(filePath)) continue;
    it(`${jsFile} has no hardcoded secrets`, () => {
      const src = readFileSync(filePath, 'utf-8');
      for (const [pattern, label] of secretPatterns) {
        expect(src, `${jsFile} contains ${label}`).not.toMatch(pattern);
      }
    });
  }

  it('index.html has no hardcoded OpenAI or Stripe keys', () => {
    const html = readFileSync(resolve(ROOT, 'index.html'), 'utf-8');
    expect(html).not.toMatch(/sk-[A-Za-z0-9]{20,}/);
    expect(html).not.toMatch(/sk_(live|test)_[A-Za-z0-9]{20,}/);
  });
});

// ── 3. Rate limiting in Netlify functions ─────────────────────────────────────

describe('Step 11 — Rate limiting code in Netlify functions', () => {
  it('openai-roster-import.js defines a rate limiter', () => {
    const src = readFileSync(resolve(ROOT, 'netlify/functions/openai-roster-import.js'), 'utf-8');
    expect(src).toMatch(/checkRateLimit/);
    expect(src).toMatch(/429/);
    expect(src).toMatch(/Too many requests/i);
  });

  it('ai-coach-brief.js defines a rate limiter', () => {
    const src = readFileSync(resolve(ROOT, 'netlify/functions/ai-coach-brief.js'), 'utf-8');
    expect(src).toMatch(/checkRateLimit/);
    expect(src).toMatch(/429/);
    expect(src).toMatch(/Too many requests/i);
  });

  it('rate limiter keys by IP address from x-forwarded-for header', () => {
    const rosterSrc = readFileSync(resolve(ROOT, 'netlify/functions/openai-roster-import.js'), 'utf-8');
    const briefSrc = readFileSync(resolve(ROOT, 'netlify/functions/ai-coach-brief.js'), 'utf-8');
    expect(rosterSrc).toMatch(/x-forwarded-for/);
    expect(briefSrc).toMatch(/x-forwarded-for/);
  });
});

// ── 4. Rate limiting blocks excessive requests ────────────────────────────────

describe('Step 11 — Rate limiting functional test', () => {
  it('openai-roster-import.js returns 429 after rate limit is exceeded', async () => {
    vi.resetModules();
    // Do not set OPENAI_API_KEY — requests will fail with 500 until rate-limited
    delete process.env.OPENAI_API_KEY;

    const FUNCTION_PATH = resolve(ROOT, 'netlify/functions/openai-roster-import.js');
    const mod = await import(FUNCTION_PATH + '?rate-test=' + Date.now());
    const handler = mod.handler;

    const event = {
      httpMethod: 'POST',
      body: JSON.stringify({ image: 'abc', mimeType: 'image/jpeg' }),
      headers: { 'x-forwarded-for': '77.88.99.100' },
    };

    // First 10 requests (RATE_MAX) pass the limiter; they fail for other reasons (no API key)
    const results = [];
    for (let i = 0; i < 10; i++) {
      results.push(await handler(event));
    }
    for (const res of results) {
      expect(res.statusCode, 'expected non-429 for first 10 requests').not.toBe(429);
    }

    // 11th request must be blocked
    const blocked = await handler(event);
    expect(blocked.statusCode).toBe(429);
    expect(JSON.parse(blocked.body).error).toMatch(/Too many requests/i);
  });

  it('ai-coach-brief.js returns 429 after rate limit is exceeded', async () => {
    vi.resetModules();
    delete process.env.OPENAI_API_KEY;

    const FUNCTION_PATH = resolve(ROOT, 'netlify/functions/ai-coach-brief.js');
    const mod = await import(FUNCTION_PATH + '?rate-test=' + Date.now());
    const handler = mod.handler;

    const event = {
      httpMethod: 'POST',
      body: JSON.stringify({ context: { tendency: 'Right' } }),
      headers: { 'x-forwarded-for': '77.88.99.101' },
    };

    // First 30 requests (RATE_MAX) pass; fail for other reasons
    const results = [];
    for (let i = 0; i < 30; i++) {
      results.push(await handler(event));
    }
    for (const res of results) {
      expect(res.statusCode, 'expected non-429 for first 30 requests').not.toBe(429);
    }

    // 31st request must be blocked
    const blocked = await handler(event);
    expect(blocked.statusCode).toBe(429);
  });
});

// ── 5. Storage.js schema validation ───────────────────────────────────────────

describe('Step 11 — storage.js schema validation', () => {
  let src;
  beforeAll(() => { src = readFileSync(resolve(ROOT, 'js/storage.js'), 'utf-8'); });

  it('rejects non-object parsed values', () => {
    expect(src).toMatch(/Array\.isArray\(parsed\)/);
  });

  it('validates teams is an array', () => {
    expect(src).toMatch(/Array\.isArray.*teams/);
    expect(src).toMatch(/parsed\.teams\s*=\s*\[\]/);
  });

  it('validates selectedTeamId type', () => {
    expect(src).toMatch(/selectedTeamId/);
  });

  it('validates selectedPlayerIndex is a number', () => {
    expect(src).toMatch(/selectedPlayerIndex/);
  });

  it('deletes prototype pollution keys', () => {
    expect(src).toMatch(/delete\s+parsed\.__proto__/);
    expect(src).toMatch(/delete\s+parsed\.constructor/);
  });
});

// ── 6. API key server-side isolation ──────────────────────────────────────────

describe('Step 11 — API key server-side isolation', () => {
  it('Netlify functions read OPENAI_API_KEY from process.env only', () => {
    const roster = readFileSync(resolve(ROOT, 'netlify/functions/openai-roster-import.js'), 'utf-8');
    const brief = readFileSync(resolve(ROOT, 'netlify/functions/ai-coach-brief.js'), 'utf-8');
    expect(roster).toMatch(/process\.env\.OPENAI_API_KEY/);
    expect(brief).toMatch(/process\.env\.OPENAI_API_KEY/);
  });

  it('Netlify functions return 500 when API key is not configured', async () => {
    vi.resetModules();
    delete process.env.OPENAI_API_KEY;
    const ROSTER_PATH = resolve(ROOT, 'netlify/functions/openai-roster-import.js');
    const mod = await import(ROSTER_PATH + '?secret-test=' + Date.now());
    const res = await mod.handler({
      httpMethod: 'POST',
      body: JSON.stringify({ image: 'abc', mimeType: 'image/jpeg' }),
      headers: { 'x-forwarded-for': '10.0.0.1' },
    });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toMatch(/api key/i);
  });

  it('AI brief function returns 500 when API key is not configured', async () => {
    vi.resetModules();
    delete process.env.OPENAI_API_KEY;
    const BRIEF_PATH = resolve(ROOT, 'netlify/functions/ai-coach-brief.js');
    const mod = await import(BRIEF_PATH + '?secret-test2=' + Date.now());
    const res = await mod.handler({
      httpMethod: 'POST',
      body: JSON.stringify({ context: { tendency: 'Right' } }),
      headers: { 'x-forwarded-for': '10.0.0.2' },
    });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toMatch(/api key/i);
  });
});

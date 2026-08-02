// tests/unit/ai-coach-brief.test.js
// Step 9 — AI Coach Brief
// Unit tests for js/ai.js structure and recommendations.js fallback behavior.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(process.cwd());
const AI_JS_PATH = resolve(ROOT, 'js', 'ai.js');
const REC_PATH = resolve(ROOT, 'js', 'recommendations.js');

// ── js/ai.js existence and structure ─────────────────────────────────────────
describe('Step 9 — js/ai.js file', () => {
  it('exists', () => {
    expect(existsSync(AI_JS_PATH)).toBe(true);
  });

  it('exposes fetchAICoachBrief on window', () => {
    const src = readFileSync(AI_JS_PATH, 'utf-8');
    expect(src).toContain('window.fetchAICoachBrief');
  });

  it('exposes buildAIBriefContext on window', () => {
    const src = readFileSync(AI_JS_PATH, 'utf-8');
    expect(src).toContain('window.buildAIBriefContext');
  });

  it('does not contain hardcoded secrets', () => {
    const src = readFileSync(AI_JS_PATH, 'utf-8');
    expect(src).not.toMatch(/sk-[A-Za-z0-9]{20,}/);
    expect(src).not.toMatch(/OPENAI_API_KEY\s*=/);
  });

  it('uses localStorage for caching', () => {
    const src = readFileSync(AI_JS_PATH, 'utf-8');
    expect(src).toContain('localStorage');
  });

  it('calls /api/ai-coach-brief endpoint', () => {
    const src = readFileSync(AI_JS_PATH, 'utf-8');
    expect(src).toContain('/api/ai-coach-brief');
  });

  it('cache key includes tendency, contacts, slump, and localAnalysis', () => {
    const src = readFileSync(AI_JS_PATH, 'utf-8');
    expect(src).toContain('tendency');
    expect(src).toContain('contacts');
    expect(src).toContain('slump');
    expect(src).toContain('localAnalysis');
  });

  it('has a TTL constant for cache expiry', () => {
    const src = readFileSync(AI_JS_PATH, 'utf-8');
    expect(src).toMatch(/CACHE_TTL/);
  });

  it('limits cache to a maximum number of entries', () => {
    const src = readFileSync(AI_JS_PATH, 'utf-8');
    expect(src).toMatch(/CACHE_MAX/);
  });

  it('wraps logic in an IIFE to avoid polluting global scope', () => {
    const src = readFileSync(AI_JS_PATH, 'utf-8');
    expect(src).toMatch(/\(function\s*\(\)/);
  });
});

// ── recommendations.js toggleAIExplain changes ───────────────────────────────
describe('Step 9 — recommendations.js toggleAIExplain updates', () => {
  it('calls fetchAICoachBrief when available', () => {
    const src = readFileSync(REC_PATH, 'utf-8');
    expect(src).toContain('fetchAICoachBrief');
  });

  it('calls buildAIBriefContext to build context', () => {
    const src = readFileSync(REC_PATH, 'utf-8');
    expect(src).toContain('buildAIBriefContext');
  });

  it('guards AI call behind typeof check for safe fallback', () => {
    const src = readFileSync(REC_PATH, 'utf-8');
    expect(src).toMatch(/typeof fetchAICoachBrief.*function/);
  });

  it('requestAICoachBrief shows error message in catch block for fallback handling', () => {
    const src = readFileSync(REC_PATH, 'utf-8');
    expect(src).toMatch(/\.catch/);
    expect(src).toMatch(/unavailable|failed/i);
  });

  it('requestAICoachBrief is a separate user-triggered function', () => {
    const src = readFileSync(REC_PATH, 'utf-8');
    expect(src).toContain('function requestAICoachBrief');
    // toggleAIExplain must NOT call fetchAICoachBrief — user triggers it separately
    const toggleFn = src.slice(src.indexOf('function toggleAIExplain'), src.indexOf('function requestAICoachBrief'));
    expect(toggleFn).not.toContain('fetchAICoachBrief');
  });

  it('shows loading indicator while fetching', () => {
    const src = readFileSync(REC_PATH, 'utf-8');
    expect(src).toMatch(/AI coach|Loading|coach/i);
  });

  it('checks box is still active before rendering AI response', () => {
    const src = readFileSync(REC_PATH, 'utf-8');
    expect(src).toMatch(/classList\.contains\("active"\)/);
  });

  it('skips requestAICoachBrief in toggleAIExplain when player has no contact data', () => {
    const src = readFileSync(REC_PATH, 'utf-8');
    const toggleFn = src.slice(src.indexOf('function toggleAIExplain'), src.indexOf('function requestAICoachBrief'));
    // requestAICoachBrief call must be conditional, guarded by a contacts-length check
    expect(toggleFn).toContain('requestAICoachBrief');
    expect(toggleFn).toMatch(/_allContacts\.length/);
  });
});

// ── index.html includes ai.js ─────────────────────────────────────────────────
describe('Step 9 — index.html script inclusion', () => {
  it('includes js/ai.js', () => {
    const src = readFileSync(resolve(ROOT, 'index.html'), 'utf-8');
    expect(src).toContain('js/ai.js');
  });

  it('loads ai.js after recommendations.js', () => {
    const src = readFileSync(resolve(ROOT, 'index.html'), 'utf-8');
    const recIdx = src.indexOf('js/recommendations.js');
    const aiIdx = src.indexOf('js/ai.js');
    expect(recIdx).toBeGreaterThan(-1);
    expect(aiIdx).toBeGreaterThan(recIdx);
  });
});

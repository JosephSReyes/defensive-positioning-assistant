// tests/integration/env.test.js
// Step 5 — Netlify Configuration and Environment Variables
// Validates that required config files exist and contain correct structure.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(process.cwd());

// -------------------------------------------------------
// .env.example — required variable keys
// -------------------------------------------------------
describe('Step 5 — .env.example', () => {
  const envExamplePath = resolve(ROOT, '.env.example');

  it('file exists', () => {
    expect(existsSync(envExamplePath)).toBe(true);
  });

  it('contains OPENAI_API_KEY placeholder', () => {
    const content = readFileSync(envExamplePath, 'utf8');
    expect(content).toMatch(/^OPENAI_API_KEY=/m);
  });

  it('contains MEMBERSTACK_PUBLIC_KEY placeholder', () => {
    const content = readFileSync(envExamplePath, 'utf8');
    expect(content).toMatch(/^MEMBERSTACK_PUBLIC_KEY=/m);
  });

  it('does not contain any real secret values', () => {
    const content = readFileSync(envExamplePath, 'utf8');
    // Real OpenAI keys start with sk-
    expect(content).not.toMatch(/sk-[A-Za-z0-9]{20,}/);
    // Real Stripe secret keys start with sk_live_ or sk_test_
    expect(content).not.toMatch(/sk_(live|test)_[A-Za-z0-9]{20,}/);
  });
});

// -------------------------------------------------------
// netlify.toml — configuration file
// -------------------------------------------------------
describe('Step 5 — netlify.toml', () => {
  const tomlPath = resolve(ROOT, 'netlify.toml');

  it('file exists', () => {
    expect(existsSync(tomlPath)).toBe(true);
  });

  it('specifies functions directory', () => {
    const content = readFileSync(tomlPath, 'utf8');
    expect(content).toMatch(/functions\s*=\s*["']?netlify\/functions["']?/);
  });

  it('specifies publish directory', () => {
    const content = readFileSync(tomlPath, 'utf8');
    expect(content).toMatch(/publish\s*=\s*["']?\.["']?/);
  });
});

// -------------------------------------------------------
// netlify/functions — directory and stub files
// -------------------------------------------------------
describe('Step 5 — netlify/functions directory', () => {
  const functionsDir = resolve(ROOT, 'netlify', 'functions');

  it('netlify/functions directory exists', () => {
    expect(existsSync(functionsDir)).toBe(true);
  });

  it('openai-roster-import.js stub exists', () => {
    expect(existsSync(resolve(functionsDir, 'openai-roster-import.js'))).toBe(true);
  });

  it('ai-coach-brief.js stub exists', () => {
    expect(existsSync(resolve(functionsDir, 'ai-coach-brief.js'))).toBe(true);
  });

  it('each stub exports a handler function', () => {
    const stubs = [
      'openai-roster-import.js',
      'ai-coach-brief.js',
    ];
    for (const stub of stubs) {
      const content = readFileSync(resolve(functionsDir, stub), 'utf8');
      expect(content).toMatch(/exports\.handler\s*=/);
    }
  });
});

// -------------------------------------------------------
// Security — secrets must not appear in frontend JS files
// -------------------------------------------------------
describe('Step 5 — No secrets in frontend JS', () => {
  const jsFiles = [
    'js/app.js',
    'js/storage.js',
    'js/utils.js',
    'js/game.js',
    'js/recommendations.js',
    'js/ui.js',
    'js/memberstack.js',
    'js/roster-import.js',
    'js/batter.js',
    'js/spray-charts.js',
  ];

  const secretPatterns = [
    /OPENAI_API_KEY\s*=\s*["'][^"']+["']/,
    /sk-[A-Za-z0-9]{20,}/,
    /sk_(live|test)_[A-Za-z0-9]{20,}/,
  ];

  for (const jsFile of jsFiles) {
    const filePath = resolve(ROOT, jsFile);
    if (!existsSync(filePath)) continue;

    it(`${jsFile} does not contain hardcoded secrets`, () => {
      const content = readFileSync(filePath, 'utf8');
      for (const pattern of secretPatterns) {
        expect(content).not.toMatch(pattern);
      }
    });
  }
});

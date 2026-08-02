// tests/integration/stripe.integration.test.js
// Step 7 — Billing via Memberstack + Stripe
// Validates that billing is handled through Memberstack's native Stripe
// integration rather than a standalone Netlify Function checkout flow.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(process.cwd());

function readFile(rel) {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

// -------------------------------------------------------
// memberstack.js — plan assignment on signup
// -------------------------------------------------------
describe('Step 7 — memberstack.js plan assignment', () => {
  const src = readFile('js/memberstack.js');

  it('DPA_PLAN_ID is defined', () => {
    expect(src).toContain('DPA_PLAN_ID');
  });

  it('DPA_PRICE_ID is defined', () => {
    expect(src).toContain('DPA_PRICE_ID');
  });

  it('plan ID value is pln_pro-ay1e0594', () => {
    expect(src).toContain('pln_pro-ay1e0594');
  });

  it('price ID value is prc_defensivepositioningpro-monthly-7w2a01mb', () => {
    expect(src).toContain('prc_defensivepositioningpro-monthly-7w2a01mb');
  });

  it('signupMemberEmailPassword includes plans array', () => {
    expect(src).toContain('plans:');
  });

  it('plans array references DPA_PLAN_ID', () => {
    expect(src).toContain('planId: DPA_PLAN_ID');
  });

  it('purchasePlansWithCheckout used for post-signup checkout', () => {
    expect(src).toContain('purchasePlansWithCheckout');
  });

  it('signup resolves to homeScreen (no external checkout redirect)', () => {
    expect(src).toContain("showScreen('homeScreen')");
  });

  it('does not call dpaStartCheckout', () => {
    expect(src).not.toContain('dpaStartCheckout');
  });

  it('does not reference /api/stripe-create-checkout', () => {
    expect(src).not.toContain('stripe-create-checkout');
  });
});

// -------------------------------------------------------
// Stripe Netlify Functions removed — Memberstack owns billing
// -------------------------------------------------------
describe('Step 7 — standalone Stripe functions removed', () => {
  const functionsDir = resolve(ROOT, 'netlify', 'functions');

  it('stripe-create-checkout.js does not exist', () => {
    expect(existsSync(resolve(functionsDir, 'stripe-create-checkout.js'))).toBe(false);
  });

  it('stripe-webhook.js does not exist', () => {
    expect(existsSync(resolve(functionsDir, 'stripe-webhook.js'))).toBe(false);
  });
});

// -------------------------------------------------------
// js/stripe.js frontend module removed
// -------------------------------------------------------
describe('Step 7 — js/stripe.js removed', () => {
  it('js/stripe.js does not exist', () => {
    expect(existsSync(resolve(ROOT, 'js', 'stripe.js'))).toBe(false);
  });
});

// -------------------------------------------------------
// index.html — stripe.js script tag removed
// -------------------------------------------------------
describe('Step 7 — index.html has no stripe.js script tag', () => {
  const html = readFile('index.html');

  it('stripe.js is not loaded', () => {
    expect(html).not.toContain('src="js/stripe.js"');
  });

  it('memberstack.js is still loaded', () => {
    expect(html).toContain('src="js/memberstack.js"');
  });
});

// -------------------------------------------------------
// .env.example — no standalone Stripe keys needed
// -------------------------------------------------------
describe('Step 7 — .env.example Stripe billing note', () => {
  const content = readFile('.env.example');

  it('STRIPE_SECRET_KEY is not required as an env var', () => {
    expect(content).not.toMatch(/^STRIPE_SECRET_KEY=/m);
  });

  it('STRIPE_PRICE_ID is not present (Memberstack manages plan/price)', () => {
    expect(content).not.toMatch(/^STRIPE_PRICE_ID=/m);
  });

  it('STRIPE_WEBHOOK_SECRET is not present (Memberstack owns webhook events)', () => {
    expect(content).not.toMatch(/^STRIPE_WEBHOOK_SECRET=/m);
  });

  it('notes that Stripe is handled by Memberstack', () => {
    expect(content.toLowerCase()).toContain('memberstack');
  });
});

// -------------------------------------------------------
// package.json — stripe npm package removed
// -------------------------------------------------------
describe('Step 7 — stripe npm package removed', () => {
  const pkg = JSON.parse(readFile('package.json'));

  it('stripe is not in dependencies', () => {
    const deps = pkg.dependencies || {};
    expect(deps).not.toHaveProperty('stripe');
  });

  it('stripe is not in devDependencies', () => {
    const dev = pkg.devDependencies || {};
    expect(dev).not.toHaveProperty('stripe');
  });
});

// -------------------------------------------------------
// Security — no Stripe secrets in any frontend JS
// -------------------------------------------------------
describe('Step 7 — no Stripe secrets in frontend', () => {
  const jsFiles = [
    'js/memberstack.js',
    'js/app.js',
    'js/ui.js',
    'js/game.js',
    'js/storage.js',
    'js/utils.js',
  ];

  for (const jsFile of jsFiles) {
    it(`${jsFile} contains no hardcoded Stripe secret keys`, () => {
      const content = readFile(jsFile);
      expect(content).not.toMatch(/sk_(live|test)_[A-Za-z0-9]{20,}/);
    });
  }
});

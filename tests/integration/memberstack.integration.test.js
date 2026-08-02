// tests/integration/memberstack.integration.test.js
// Step 6 — Memberstack Authentication
// Validates that auth integration is correctly wired in HTML and JS.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(process.cwd());

function readFile(rel) {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

// -------------------------------------------------------
// HTML — Memberstack script tag
// -------------------------------------------------------
describe('Step 6 — Memberstack script tag', () => {
  const html = readFile('index.html');

  it('Memberstack CDN script tag is present', () => {
    expect(html).toContain('static.memberstack.com/scripts/v1/memberstack.js');
  });

  it('script tag includes the correct app ID', () => {
    expect(html).toContain('app_cmp1m2fbx008o0sye89c483i1');
  });

  it('script tag appears before closing </head>', () => {
    const scriptPos = html.indexOf('static.memberstack.com');
    const headClosePos = html.indexOf('</head>');
    expect(scriptPos).toBeGreaterThan(0);
    expect(scriptPos).toBeLessThan(headClosePos);
  });
});

// -------------------------------------------------------
// HTML — Default screen is landingScreen
// -------------------------------------------------------
describe('Step 6 — Default active screen', () => {
  const html = readFile('index.html');

  it('landingScreen is the default active screen', () => {
    expect(html).toContain('"landingScreen" class="screen active"');
  });

  it('homeScreen is NOT active by default', () => {
    expect(html).not.toContain('"homeScreen" class="screen active"');
  });

  it('homeScreen element still exists', () => {
    expect(html).toContain('id="homeScreen"');
  });
});

// -------------------------------------------------------
// HTML — Auth trigger structure
// Previously the app rendered custom <form> elements (dpaLoginForm /
// dpaSignupForm). The landing page now uses Memberstack's hosted modals,
// triggered via data-ms-modal attributes and a small DefensivePositioningProAccess shim
// that prevents the click from doing nothing if the SDK has not loaded yet.
// -------------------------------------------------------
describe('Step 6 — Auth trigger structure (Memberstack modals)', () => {
  const html = readFile('index.html');

  it('landing page exposes a signup trigger for the Memberstack modal', () => {
    expect(html).toContain('data-ms-modal="signup"');
  });

  it('landing page exposes a login trigger for the Memberstack modal', () => {
    expect(html).toContain('data-ms-modal="login"');
  });

  it('DefensivePositioningProAccess shim wires both buttons', () => {
    expect(html).toContain('DefensivePositioningProAccess.signup');
    expect(html).toContain('DefensivePositioningProAccess.login');
  });

  it('memberstack.js still defines showDpaAuth as a defensive no-op', () => {
    // Even though the custom forms are gone, the function should remain so
    // future builds can re-enable the toggle without re-wiring callers.
    const js = readFile('js/memberstack.js');
    expect(js).toContain('function showDpaAuth(');
  });
});

// -------------------------------------------------------
// HTML — Logout button
// -------------------------------------------------------
describe('Step 6 — Logout button', () => {
  const html = readFile('index.html');

  it('logout button is present in homeScreen', () => {
    expect(html).toContain('id="dpaLogoutBtn"');
  });

  it('logout button calls dpaLogout()', () => {
    expect(html).toContain('onclick="dpaLogout()"');
  });
});

// -------------------------------------------------------
// HTML — Test mode removed
// -------------------------------------------------------
describe('Step 6 — Test access mode removed', () => {
  const html = readFile('index.html');

  it('test access notice is gone', () => {
    expect(html).not.toContain('TEST ACCESS NOTICE');
    expect(html).not.toContain('TEST ACCESS ENABLED');
  });

  it('MEMBERSTACK GATE DISABLED comment is gone', () => {
    expect(html).not.toContain('MEMBERSTACK GATE DISABLED');
  });
});

// -------------------------------------------------------
// HTML — No secret keys exposed
// -------------------------------------------------------
describe('Step 6 — No secrets in frontend', () => {
  const html = readFile('index.html');
  const memberstackJs = readFile('js/memberstack.js');

  it('Memberstack secret key not in index.html', () => {
    expect(html).not.toMatch(/sk_[a-f0-9]{20,}/);
  });

  it('Memberstack secret key not in memberstack.js', () => {
    expect(memberstackJs).not.toMatch(/sk_[a-f0-9]{20,}/);
  });

  it('OpenAI key not in index.html', () => {
    expect(html).not.toMatch(/sk-[A-Za-z0-9]{20,}/);
  });

  it('Stripe secret key not in index.html', () => {
    expect(html).not.toMatch(/sk_(live|test)_[A-Za-z0-9]{20,}/);
  });
});

// -------------------------------------------------------
// memberstack.js — function definitions
// -------------------------------------------------------
describe('Step 6 — memberstack.js function definitions', () => {
  const src = readFile('js/memberstack.js');

  it('showDpaAuth function is defined', () => {
    expect(src).toContain('function showDpaAuth');
  });

  it('dpaLogout function is defined', () => {
    expect(src).toContain('function dpaLogout');
  });

  it('calls $memberstackDom.logout()', () => {
    expect(src).toContain('$memberstackDom.logout()');
  });

  it('calls loginMemberEmailPassword', () => {
    expect(src).toContain('loginMemberEmailPassword');
  });

  it('calls signupMemberEmailPassword', () => {
    expect(src).toContain('signupMemberEmailPassword');
  });

  it('references the plan ID', () => {
    expect(src).toContain('pln_pro-ay1e0594');
  });

  it('references the price ID', () => {
    expect(src).toContain('prc_defensivepositioningpro-monthly-7w2a01mb');
  });

  it('calls getCurrentMember for session check', () => {
    expect(src).toContain('getCurrentMember');
  });

  it('defines DPA_PROTECTED array with protected screens', () => {
    expect(src).toContain('homeScreen');
    expect(src).toContain('teamScreen');
    expect(src).toContain('gameScreen');
  });
});

// -------------------------------------------------------
// memberstack.js — auth guard logic
// -------------------------------------------------------
describe('Step 6 — auth guard', () => {
  const src = readFile('js/memberstack.js');

  it('wraps showScreen with auth guard', () => {
    expect(src).toContain('patchShowScreen');
  });

  it('falls back to landingScreen when no session', () => {
    expect(src).toContain("_orig('landingScreen')");
  });
});

// -------------------------------------------------------
// memberstack.js — plan status enforcement (dpaHasActivePlan)
// -------------------------------------------------------
describe('Plan status enforcement — dpaHasActivePlan', () => {
  const src = readFile('js/memberstack.js');

  it('dpaHasActivePlan function is defined', () => {
    expect(src).toContain('function dpaHasActivePlan(');
  });

  it('checks planConnections array on the member object', () => {
    expect(src).toContain('planConnections');
    expect(src).toContain('Array.isArray');
  });

  it('compares planId against DPA_PLAN_ID', () => {
    expect(src).toContain('c.planId === DPA_PLAN_ID');
  });

  it('accepts ACTIVE status', () => {
    expect(src).toContain("c.status === 'ACTIVE'");
  });

  it('accepts TRIALING status so trial users pass the gate', () => {
    expect(src).toContain("c.status === 'TRIALING'");
  });

  it('patchShowScreen uses dpaHasActivePlan instead of bare member check', () => {
    expect(src).toContain('dpaHasActivePlan(member)');
    // The old bare-member check should not appear in the guard branch
    expect(src).not.toContain('member ? id');
  });

  it('goToAppIfLoggedIn uses dpaHasActivePlan for the auto-redirect', () => {
    // Both call sites (patchShowScreen and goToAppIfLoggedIn) must use the helper;
    // count occurrences to confirm there are at least 2 uses
    const matches = src.match(/dpaHasActivePlan\(member\)/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('returns false for null member', () => {
    // Verify the null-guard is present
    expect(src).toContain('if (!member) return false');
  });
});

// -------------------------------------------------------
// memberstack.js — onAuthChange + purchasePlansWithCheckout
// -------------------------------------------------------
describe('Auth state handler — onAuthChange and checkout', () => {
  const src = readFile('js/memberstack.js');

  it('DPA_PRICE_ID constant is defined', () => {
    expect(src).toContain("var DPA_PRICE_ID = 'prc_defensivepositioningpro-monthly-7w2a01mb'");
  });

  it('registers an onAuthChange listener', () => {
    expect(src).toContain('onAuthChange');
  });

  it('calls purchasePlansWithCheckout for members with no active plan', () => {
    expect(src).toContain('purchasePlansWithCheckout');
  });

  it('passes DPA_PRICE_ID to purchasePlansWithCheckout', () => {
    expect(src).toContain('priceId: DPA_PRICE_ID');
  });

  it('guards against duplicate checkout calls with _checkoutInFlight flag', () => {
    expect(src).toContain('_checkoutInFlight');
  });

  it('performs an initial getCurrentMember check on load', () => {
    expect(src).toContain('getCurrentMember');
  });

  it('uses handleMemberState as a shared handler for both paths', () => {
    expect(src).toContain('handleMemberState');
  });
});

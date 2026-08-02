/**
 * Unit smoke tests -- Step 2 + Step 3
 *
 * Verifies the Defensive Positioning Assistant index.html file contains the expected
 * structural elements. These tests guard against accidental
 * deletion of critical DOM anchors during future refactors.
 *
 * Step 3 additions: CSS extraction regression tests verify that
 * inline style blocks have been removed and styles/main.css is
 * linked and non-empty.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, beforeAll } from 'vitest';

let html;

beforeAll(() => {
  html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf-8');
});

describe('Defensive Positioning Assistant App -- HTML Structure', () => {
  it('index.html exists and is non-empty', () => {
    expect(html).toBeTruthy();
    expect(html.length).toBeGreaterThan(0);
  });

  it('has the correct page title', () => {
    expect(html).toContain('<title>DefensivePositioningPro</title>');
  });

  it('contains the landing screen element', () => {
    expect(html).toContain('id="landingScreen"');
  });

  it('contains the home screen element', () => {
    expect(html).toContain('id="homeScreen"');
  });

  it('contains the game screen element', () => {
    expect(html).toContain('id="gameScreen"');
  });

  it('contains the field element', () => {
    expect(html).toContain('id="field"');
  });

  it('contains the team screen element', () => {
    expect(html).toContain('id="teamScreen"');
  });

  it('does not expose API secrets inline', () => {
    // Guard against accidental secret leakage in the HTML file
    expect(html).not.toMatch(/sk-[A-Za-z0-9]{20,}/); // OpenAI key pattern
    expect(html).not.toMatch(/sk_live_[A-Za-z0-9]{20,}/); // Stripe live key pattern
    expect(html).not.toMatch(/sk_test_[A-Za-z0-9]{20,}/); // Stripe test key pattern
  });
});

// -- Step 3: CSS Extraction Regression --

describe('Defensive Positioning Assistant CSS -- Step 3 Regression', () => {
  let css;

  beforeAll(() => {
    const cssPath = resolve(process.cwd(), 'styles/main.css');
    expect(existsSync(cssPath), 'styles/main.css must exist').toBe(true);
    css = readFileSync(cssPath, 'utf-8');
  });

  it('styles/main.css is non-empty', () => {
    expect(css.length).toBeGreaterThan(100);
  });

  it('styles/main.css contains :root CSS variables', () => {
    expect(css).toContain(':root');
    expect(css).toContain('--bg:');
    expect(css).toContain('--accent:');
  });

  it('styles/main.css contains core layout rules', () => {
    expect(css).toContain('html,body');
    expect(css).toContain('box-sizing:border-box');
  });

  it('index.html links to styles/main.css', () => {
    expect(html).toContain('href="styles/main.css"');
    expect(html).toContain('rel="stylesheet"');
  });

  it('inline style blocks only appear inside #landingScreen', () => {
    // The landing screen ships scoped inline styles for the marketing layout
    // so the rest of the app can keep all rules in styles/main.css. Any other
    // inline <style> block is a regression.
    // NOTE: avoid literal '<style' in this source -- Vite import-analysis
    // misidentifies files containing that sequence as HTML. Use RegExp constructor.
    const styleOpen = new RegExp('<' + 'style[\\s>]', 'gi');
    const styleClose = new RegExp('<' + '/style>', 'gi');
    const landingStart = html.indexOf('id="landingScreen"');
    const landingEnd = html.indexOf('</section>', landingStart);
    expect(landingStart).toBeGreaterThan(0);
    expect(landingEnd).toBeGreaterThan(landingStart);

    let m;
    while ((m = styleOpen.exec(html)) !== null) {
      expect(m.index, 'inline <style> found outside #landingScreen').toBeGreaterThan(landingStart);
      expect(m.index, 'inline <style> found outside #landingScreen').toBeLessThan(landingEnd);
    }
    while ((m = styleClose.exec(html)) !== null) {
      expect(m.index, 'inline </style> found outside #landingScreen').toBeGreaterThan(landingStart);
      expect(m.index, 'inline </style> found outside #landingScreen').toBeLessThan(landingEnd);
    }
  });

  it('styles/main.css contains pitch intelligence patch styles', () => {
    expect(css).toContain('dpa-pitch-brain-line');
  });

  it('AI Coach popup (.ai-explain-box) forces centering over JS inline styles', () => {
    // The popup opener writes inline left/width/right onto the element at
    // runtime. The stylesheet must override those with !important so the box
    // stays centered on every screen, with no horizontal margins to displace it.
    const start = css.indexOf('.ai-explain-box{');
    expect(start, '.ai-explain-box rule must exist').toBeGreaterThan(-1);
    const rule = css.slice(start, css.indexOf('}', start));
    expect(rule).toContain('left:50% !important');
    expect(rule).toContain('right:auto !important');
    expect(rule).toContain('transform:translate(-50%,-50%) !important');
    expect(rule).toContain('width:min(420px, calc(100% - 36px)) !important');
    expect(rule).toContain('margin:0 !important');
    expect(rule, 'horizontal margins would break centering').not.toMatch(/margin-left|margin-right/);
  });
});

import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { homePage } from '../src/page.js';
import { NEXT_CSS, NEXT_JS } from '../src/next-app.generated.js';

// GEL guard `next-cta`: the one thing a visitor most likely does next carries data-next-cta and the class next-cta
// (a spinning rainbow border), and it is the first link or button after the first <h1>. Here that is "Start free with GitHub".
const app = readFileSync(new URL('../web/src/App.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../web/src/app.css', import.meta.url), 'utf8');

test('the classic landing marks exactly one element, the first button after the h1', () => {
  const home = homePage();
  // The page's markup is the <main> element; the scripts and styles sit outside it.
  const body = home.slice(home.indexOf('<main'), home.indexOf('</main>'));
  const marked = [...body.matchAll(/<[a-z][^>]*>/gi)].filter((m) => /\sdata-next-cta(?=[\s=>/])/.test(m[0]));
  expect(marked).toHaveLength(1);
  expect(marked[0][0]).toMatch(/class="[^"]*\bnext-cta\b/);
  expect(marked[0][0]).toContain('class="btn go next-cta"');
  const afterH1 = body.slice(body.indexOf('</h1>'));
  expect(/<(a|button|input|textarea)\b[^>]*>/i.exec(afterH1)[0]).toBe(marked[0][0]);
  expect(afterH1).toContain('>Start free with GitHub</a>');
});

test('the app landing marks the hero button once, and the built app carries it', () => {
  expect(app.match(/data-next-cta/g)).toHaveLength(1);
  expect(app).toContain('<Button label="Start free with GitHub" variant="primary" className="next-cta" data-next-cta="" href={HERO_SIGNIN} />');
  expect(NEXT_JS).toContain('data-next-cta');
  expect(NEXT_JS.match(/data-next-cta/g)).toHaveLength(1);
});

test('the CSS spins the border and has a prefers-reduced-motion rule, in source and in the build', () => {
  for (const c of [css, NEXT_CSS]) {
    expect(c).toMatch(/\.next-cta\s*\{[^}]*animation:[^;}]*next-cta-spin/);
    expect(c).toMatch(/\.next-cta\s*\{[^}]*conic-gradient\(from var\(--next-cta-angle\)/);
    expect(c).toMatch(/@keyframes next-cta-spin/);
    expect(c).toMatch(/@property --next-cta-angle/);
    expect(c).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^{}]*\.next-cta\s*\{[^}]*animation:\s*none/);
  }
});

test('the classic page has the same CSS recipe', () => {
  const home = homePage();
  expect(home).toMatch(/\.next-cta\{[^}]*animation:next-cta-spin 3s linear infinite/);
  expect(home).toMatch(/@media \(prefers-reduced-motion:reduce\)\{[^{}]*\.next-cta\{[^}]*animation:none/);
});

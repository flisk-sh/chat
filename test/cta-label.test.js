import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { homePage } from '../src/page.js';
import { UK } from '../src/i18n.js';
import { handle } from '../src/index.js';

// The Flisk standard for the primary sign-in button: chat has no key to give, so it says "Start free with GitHub",
// with the line "No card. Free to start." under it, and the link carries the utm tag for this one button only.
const LABEL = 'Start free with GitHub';
const LINE = 'No card. Free to start.';
const UTM = 'utm_source=chat&utm_medium=cta&utm_campaign=free-key';
const app = readFileSync(new URL('../web/src/App.jsx', import.meta.url), 'utf8');

test('the signed-out home page has one primary button with the standard label, line and utm tag', () => {
  const home = homePage();
  expect(home).toContain(`<a class="btn go" href="/auth/start?${UTM.replaceAll('&', '&amp;')}">${LABEL}</a>`);
  expect(home).toContain(LINE);
  expect(home).not.toContain('>Sign in with GitHub<');
  expect(app).toContain(`label="${LABEL}" variant="primary" href={HERO_SIGNIN}`);
  expect(app).toContain(`const HERO_SIGNIN = '/auth/start?${UTM}'`);
  expect(app).toContain(LINE);
  expect(app).not.toContain('Sign in with GitHub to start');
  expect(app).not.toContain('label="Sign in with GitHub" variant="primary"');
});

test('only the hero button carries the utm tag; the small Sign in links stay plain', () => {
  expect(app.match(/utm_campaign=free-key/g)).toHaveLength(1);
  expect(app).toContain('<Button label="Sign in" size="sm" variant="primary" href="/auth/start" />');
});

test('the hero first screen text is short and plain', () => {
  const home = homePage();
  const h1 = /<h1[^>]*>([^<]*)<\/h1>/.exec(home)[1];
  const lead = /<\/h1><p[^>]*>([^<]*)<\/p>/.exec(home)[1];
  expect(h1.split(/\s+/).length).toBeLessThanOrEqual(12);
  expect(lead.split(/\s+/).length).toBeLessThanOrEqual(32);
  expect(lead).not.toMatch(/sandbox/i);
});

test('the label and the line are translated into Ukrainian', () => {
  expect(UK[LABEL]).toBeTruthy();
  expect(UK[LINE]).toBeTruthy();
});

test('/auth/start ignores the utm params and still signs in to the same page', async () => {
  const env = { SESSION_SECRET: 'x'.repeat(32), LOGIN_PUBLIC_KEY: 'k', LOGIN_ORIGIN: 'https://login.example' };
  const res = await handle(new Request(`https://chat.flisk.si/auth/start?${UTM}`), env, {});
  expect(res.status).toBe(302);
  const to = new URL(res.headers.get('location'));
  expect(to.origin).toBe('https://login.example');
  const back = new URL(to.searchParams.get('return'));
  expect(back.pathname).toBe('/auth/done');
  expect(back.search).not.toContain('utm_');
});

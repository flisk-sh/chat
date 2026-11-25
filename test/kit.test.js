import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { handle, publishSite } from '../src/index.js';
import { BUILD, BUILD_SYSTEM, GAME, GAME_SYSTEM, answer } from '../src/answer.js';
import { KIT_CSS, KIT_MARK, withKit } from '../src/kit.js';
import { friendlyUrl, previewHost } from '../src/share.js';
import { fleetClient } from '../src/fleet.js';
import { indexHtml } from '../src/system.js';
import { fakeD1 } from './d1.js';

const SCHEMA = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const ORIGIN = 'https://chat.test';
const env = (extra = {}) => ({ DB: fakeD1(SCHEMA), PUBLIC_ORIGIN: ORIGIN, SESSION_SECRET: 's', FLEET_URL: 'https://fleet.test', FLEET_SERVICE_SECRET: 'x'.repeat(40), INFERENCE_KEY: 'ik', INFERENCE_URL: 'https://inf.test/v1/chat/completions', ...extra });

describe('the Astryx app kit', () => {
  test('uses Astryx tokens in light and dark and stays small', () => {
    expect(KIT_CSS).toContain('light-dark(#f1f1f1');
    expect(KIT_CSS).toContain('Figtree');
    for (const c of ['.app', '.side', '.stat', '.table', '.badge', '.board', '.lane', '.game']) expect(KIT_CSS).toContain(c);
    expect(KIT_CSS.length).toBeLessThan(14000);
  });

  test('withKit puts the CSS in for the marker or a link, and leaves other pages alone', () => {
    const a = withKit(`<head>${KIT_MARK}</head><body>x</body>`);
    expect(a).toContain('<style id="astryx">');
    expect(a).not.toContain(KIT_MARK);
    expect(withKit('<head><link rel="stylesheet" href="/_kit/astryx.css"></head>')).toContain('<style id="astryx">');
    expect(withKit('<head></head><body>plain</body>')).toBe('<head></head><body>plain</body>');
  });

  test('a published page with the marker is served with the kit; the stylesheet is served too', async () => {
    const e = env();
    const made = await publishSite(e, 'octo', `<!doctype html><html><head>${KIT_MARK}</head><body><div class="app">hi</div></body></html>`, ORIGIN);
    const res = await handle(new Request(made.url), e, {});
    const body = await res.text();
    expect(body).toContain('--accent');
    expect(body).not.toContain(KIT_MARK);
    const css = await handle(new Request(`${ORIGIN}/_kit/astryx.css`), e, {});
    expect(css.status).toBe(200);
    expect(css.headers.get('content-type')).toContain('text/css');
    expect(await css.text()).toBe(KIT_CSS);
  });

  test('the CRM a computer builds uses the same tokens', () => {
    const html = indexHtml({ title: 'Sales', services: [{ name: 'contacts', does: 'people', fields: [{ key: 'name', label: 'Name' }] }] });
    expect(html).toContain('light-dark(#f1f1f1');
    expect(html).not.toContain('#faf9f6');
  });
});

describe('games and builds', () => {
  test('a game ask gets the game prompt; an app ask the app prompt', async () => {
    expect(GAME.test('@askflisk make me a snake game')).toBe(true);
    expect(GAME.test('build a todo app')).toBe(false);
    expect(BUILD.test('make me a kanban board app')).toBe(true);
    expect(BUILD_SYSTEM).toContain(KIT_MARK);
    expect(BUILD_SYSTEM).toContain('class="stat"');
    expect(GAME_SYSTEM).toContain('<canvas');
    expect(GAME_SYSTEM).toContain('requestAnimationFrame');
    const seen = [];
    const deps = { weather: async () => '', search: async () => null, ask: async () => { throw new Error('no'); }, over: async () => false, format: () => '', build: async (q, game) => (seen.push(game), { url: 'https://app.flisk.si/s/abc' }) };
    const req = (question) => new Request('https://x.test/api/answer', { method: 'POST', headers: { authorization: `Bearer ${'k'.repeat(30)}`, 'content-type': 'application/json' }, body: JSON.stringify({ question, asker: '7' }) });
    const g = await (await answer(req('make me a snake game'), { X_BOT_KEY: 'k'.repeat(30) }, deps)).json();
    const a = await (await answer(req('make me crm'), { X_BOT_KEY: 'k'.repeat(30) }, deps)).json();
    expect(seen).toEqual([true, false]);
    expect(g.text).toContain('Play it');
    expect(a.link).toBe('https://app.flisk.si/s/abc');
  });
});

describe('links on our own host', () => {
  test('a page link uses APP_ORIGIN when it is set', async () => {
    expect((await publishSite(env({ APP_ORIGIN: 'https://app.flisk.si/' }), 'o', '<html><body>x</body></html>', ORIGIN)).url).toMatch(/^https:\/\/app\.flisk\.si\/s\/[a-f0-9]{16}$/);
    expect((await publishSite(env(), 'o', '<html><body>x</body></html>', ORIGIN)).url).toMatch(/^https:\/\/chat\.test\/s\//);
  });

  test('friendlyUrl and previewHost map only sandbox previews, only with a host set', () => {
    expect(friendlyUrl('https://abc-def-3000.preview.box.upstash.com/x?y=1', 'app.flisk.si')).toBe('https://abc-def-3000.app.flisk.si/x?y=1');
    expect(friendlyUrl('https://abc-3000.preview.box.upstash.com', '')).toBe('https://abc-3000.preview.box.upstash.com');
    expect(friendlyUrl('https://evil.test/a-3000.preview.box.upstash.com', 'app.flisk.si')).toBe('https://evil.test/a-3000.preview.box.upstash.com');
    expect(previewHost('abc-def-3000.app.flisk.si', 'app.flisk.si')).toBe('abc-def-3000.preview.box.upstash.com');
    expect(previewHost('app.flisk.si', 'app.flisk.si')).toBe('');
    expect(previewHost('www.app.flisk.si', 'app.flisk.si')).toBe('');
    expect(previewHost('a-3000.app.flisk.si', '')).toBe('');
  });

  test('a fleet share link is rewritten with APP_HOST, and left alone without it', async () => {
    const f = async () => new Response(JSON.stringify({ url: 'https://q-9-3000.preview.box.upstash.com' }), { status: 200 });
    expect((await fleetClient({ APP_HOST: 'app.flisk.si', FLEET_SERVICE_SECRET: 'x' }, 'o', f).share('p', 3000, 's')).data.url).toBe('https://q-9-3000.app.flisk.si');
    expect((await fleetClient({ FLEET_SERVICE_SECRET: 'x' }, 'o', f).share('p', 3000, 's')).data.url).toBe('https://q-9-3000.preview.box.upstash.com');
  });

  test('the Worker passes name-port.APP_HOST through to the sandbox preview', async () => {
    const seen = [];
    const f = async (r) => (seen.push(r.url), new Response('app', { status: 200 }));
    const res = await handle(new Request('https://q-9-3000.app.flisk.si/a?b=1'), env({ APP_HOST: 'app.flisk.si' }), { fetchImpl: f });
    expect(await res.text()).toBe('app');
    expect(seen).toEqual(['https://q-9-3000.preview.box.upstash.com/a?b=1']);
    expect(res.headers.get('x-robots-tag')).toBe('noindex');
  });
});

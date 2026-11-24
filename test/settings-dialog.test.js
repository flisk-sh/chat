import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { handle } from '../src/index.js';
import { saveSettings } from '../src/keys.js';
import { makeSession } from '../src/session.js';
import { appPage, settingsPanelHtml } from '../src/page.js';
import { nextPage } from '../src/next-page.js';
import { SETTINGS_CSS, SETTINGS_JS, SETTINGS_SECTIONS } from '../src/settings-dialog.js';
import { UK } from '../src/i18n.js';
import { fakeD1 } from './d1.js';

// The browser script is checked in its source: a bundler rewrites quotes and operators in the text of the function.
const SRC = readFileSync(new URL('../src/settings-dialog.js', import.meta.url), 'utf8');
const SCHEMA = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const ORIGIN = 'https://chat.test';
const env = () => ({ DB: fakeD1(SCHEMA), PUBLIC_ORIGIN: ORIGIN, SESSION_SECRET: 's', KEY_SECRET: 'k'.repeat(32) });
const net = async () => Response.json({});
const get = (e, path, cookie = '') => handle(new Request(ORIGIN + path, { headers: { cookie } }), e, { fetchImpl: net });
const post = (e, path, f, cookie, extra = {}) => handle(new Request(ORIGIN + path, { method: 'POST', body: f, headers: { cookie, origin: ORIGIN, accept: 'application/json', ...extra } }), e, { fetchImpl: net });
const form = (o) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const signedIn = async (e, login = 'odykyi') => (await makeSession(e, login)).split(';')[0];
const panel = (over = {}) => settingsPanelHtml({ login: 'ann', saved: null, stored: true, limit: 5, ...over });

describe('the panel', () => {
  test('four sections, each a tab with its own panel, and only the account one open at first', () => {
    const h = panel();
    expect(SETTINGS_SECTIONS).toEqual(['account', 'ai', 'github', 'computers']);
    for (const id of SETTINGS_SECTIONS) {
      expect(h).toContain(`role="tab" class="sd-tab" id="sd-t-${id}" aria-controls="sd-p-${id}"`);
      expect(h).toContain(`id="sd-p-${id}" aria-labelledby="sd-t-${id}"`);
    }
    expect(h).toContain('id="sd-t-account" aria-controls="sd-p-account" aria-selected="true" tabindex="0"');
    expect(h.match(/role="tabpanel"[^>]*hidden/g)).toHaveLength(3);
    expect(h).toContain('role="tablist" aria-orientation="vertical"');
    expect(h).toContain('type="search" class="sd-q" placeholder="Search settings"');
  });
  test('search words reach every section, so "key" finds the AI and "pull request" finds GitHub', () => {
    const kw = (id) => new RegExp(`data-sec="${id}" data-kw="([^"]*)"`).exec(panel())[1];
    expect(kw('ai')).toContain('api key');
    expect(kw('github')).toContain('pull request');
    expect(kw('computers')).toContain('fleet');
    expect(kw('account')).toContain('sign out');
  });
  test('account: a signed-in visitor sees their login and Sign out, a guest sees Sign in', () => {
    expect(panel()).toContain('<b>@ann</b>');
    expect(panel()).toContain('href="/auth/signout"');
    const guest = panel({ login: 'anon-0123456789abcdef', anon: true });
    expect(guest).toContain('href="/auth/start"');
    expect(guest).not.toContain('/auth/signout');
    expect(guest).not.toContain('anon-0123456789abcdef');
  });
  test('AI for reviews: the free model line, the saved one, the form and the provider key links', () => {
    expect(panel()).toContain('free Flisk Wolf model: 5 a day');
    const saved = panel({ saved: { ai: 'openai', model: 'gpt-x' } });
    expect(saved).toContain('<b>gpt-x</b>');
    expect(saved).toContain('<option value="openai" selected>');
    expect(saved).toContain('action="/reviews/delete"');
    for (const u of ['https://openrouter.ai/keys', 'https://console.anthropic.com/settings/keys', 'https://platform.openai.com/api-keys']) expect(saved).toContain(u);
    expect(saved).toContain('type="password"');
    expect(saved).toContain('action="/reviews/save"');
    expect(panel()).not.toContain('action="/reviews/delete"');
    expect(panel({ stored: false })).toContain('Saving a key is not switched on yet.');
    expect(panel({ stored: false })).not.toContain('action="/reviews/save"');
  });
  test('GitHub reviews: install link, the three commands each with a Copy button, and the links to GitHub', () => {
    const h = panel();
    expect(h).toContain('https://github.com/apps/flisk-chat/installations/new');
    for (const c of ['@flisk-chat review', '@flisk-chat review run', '@flisk-chat auto on']) expect(h).toContain(`data-sd-copy="${c}"`);
    expect(h).toContain('https://github.com/settings/installations');
  });
  test('Computers links to the Fleet console in a new tab', () => {
    expect(panel()).toContain('href="https://fleet.flisk.si/console?section=providers" target="_blank" rel="noopener"');
  });
  test('the section and the flash are chosen from a short list; anything else is ignored', () => {
    expect(panel({ section: 'github' })).toContain('id="sd-t-github" aria-controls="sd-p-github" aria-selected="true"');
    expect(panel({ section: '"><x' })).toContain('id="sd-t-account" aria-controls="sd-p-account" aria-selected="true"');
    expect(panel({ section: 'ai', flash: 'saved' })).toContain('Saved. Your next review uses this AI.');
    expect(panel({ section: 'ai', flash: '<b>x</b>' })).not.toContain('<b>x</b>');
  });
  test('a hostile login is escaped', () => {
    expect(panel({ login: '"><script>x</script>' })).not.toContain('<script>x</script>');
  });
  test('Ukrainian: every string in the dialog has a form, and ?lang=uk renders it', () => {
    const en = panel({ saved: { ai: 'openai', model: 'm' }, section: 'ai', flash: 'deleted' });
    const uk = panel({ saved: { ai: 'openai', model: 'm' }, section: 'ai', flash: 'deleted', lang: 'uk' });
    expect(uk).toContain('Рев’ю на GitHub');
    expect(uk).toContain('Шукати в налаштуваннях');
    expect(uk).toContain('Видалити мій ключ');
    // The English text nodes left untranslated in the Ukrainian render: only code, names and the model are allowed.
    const text = (h) => [...h.replace(/<[^>]*>/g, '\n').split('\n')].map((s) => s.trim()).filter(Boolean);
    const left = text(uk).filter((s) => text(en).includes(s) && /[A-Za-z]{4,}/.test(s) && !/^(@|OpenRouter|Claude|OpenAI|GitHub|GitHub App|Fleet)/.test(s) && !/^[a-z0-9/.@ -]+$/.test(s));
    expect(left).toEqual([]);
    expect(UK['Computers']).toBeTruthy();
  });
});

describe('the routes', () => {
  test('/settings/panel: a signed-in visitor gets their AI (never the key); a guest gets the sign-in prompt', async () => {
    const e = env();
    await saveSettings(e, 'odykyi', { ai: 'openai', model: 'gpt-x', key: 'sk-plain-secret-9' });
    const res = await get(e, '/settings/panel?section=ai', await signedIn(e));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const t = await res.text();
    expect(t).toContain('gpt-x');
    expect(t).not.toContain('sk-plain-secret-9');
    const guest = await (await get(e, '/settings/panel')).text();
    expect(guest).toContain('Sign in with GitHub');
    expect(guest).not.toContain('action="/reviews/save"');
  });
  test('/settings/panel is for the chat itself, not another site', async () => {
    const e = env();
    const res = await handle(new Request(ORIGIN + '/settings/panel', { headers: { 'sec-fetch-site': 'cross-site' } }), e, { fetchImpl: net });
    expect(res.status).toBe(403);
  });
  test('saving and deleting from the dialog answer JSON, keep the key out of it, and still refuse other sites and guests', async () => {
    const e = env();
    const cookie = await signedIn(e);
    const ok = await post(e, '/reviews/save', form({ ai: 'openai', model: 'gpt-x', key: 'sk-12345678' }), cookie);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, flash: 'saved' });
    expect((await (await get(e, '/settings/panel?section=ai', cookie)).text())).toContain('gpt-x');
    const bad = await post(e, '/reviews/save', form({ ai: 'openai', model: 'bad model!', key: 'sk-12345678' }), cookie);
    expect(bad.status).toBe(400);
    expect(JSON.stringify(await bad.json())).not.toContain('sk-12345678');
    expect((await post(e, '/reviews/save', form({ ai: 'openai', model: 'gpt-x', key: 'sk-12345678' }), cookie, { origin: 'https://evil.test' })).status).toBe(403);
    expect((await post(e, '/reviews/save', form({ ai: 'openai', model: 'gpt-x', key: 'sk-12345678' }), '')).status).toBe(403);
    const del = await post(e, '/reviews/delete', undefined, cookie);
    expect(await del.json()).toEqual({ ok: true, flash: 'deleted' });
    expect((await (await get(e, '/settings/panel?section=ai', cookie)).text())).toContain('free Flisk Wolf model');
  });
  test('/settings and /reviews are the chat with the dialog script in it, so both direct links and the old one work', async () => {
    const e = env();
    const cookie = await signedIn(e);
    for (const path of ['/settings', '/reviews', '/settings?ok=saved']) {
      const res = await get(e, path, cookie);
      expect(res.status).toBe(200);
      const t = await res.text();
      expect(t).toContain('<div id="root">');
      expect(t).toContain('settings/panel');
      expect(t).toContain('.sd-box');
    }
  });
});

describe('the pages', () => {
  test('both pages carry the dialog styles and script; the embedded chat does not', () => {
    for (const h of [appPage({ login: 'ann', connected: [] }), nextPage({ login: 'ann' })]) {
      expect(h).toContain('.sd-box{');
      expect(h).toContain('/settings/panel?lang=');
    }
    expect(nextPage({ login: 'ann', embed: true })).not.toContain('/settings/panel');
  });
  test('the phone sheet has a row that opens the dialog', () => {
    expect(appPage({ login: 'ann', connected: [] })).toContain('data-open-settings>Account, reviews, computers');
  });
});

describe('the browser script', () => {
  test('it is valid JavaScript and the styles close their braces', () => {
    expect(() => new Function(SETTINGS_JS)).not.toThrow();
    expect(SETTINGS_CSS.split('{').length).toBe(SETTINGS_CSS.split('}').length);
  });
  test('it is a modal dialog: role, aria-modal, labelled, Esc closes, Tab stays inside, the page behind is inert, focus comes back', () => {
    for (const s of ['role="dialog" aria-modal="true" aria-labelledby="sd-title"', "e.key === 'Escape'", "e.key === 'Tab'", 'n.inert = true', 'n.inert = false', 'o.focus()', 'aria-busy']) expect(SRC).toContain(s);
  });
  test('it opens from the old settings links, keeps new-tab clicks alone, and reads the deep links', () => {
    expect(SRC).toContain('a[href="/reviews"],a[href="/settings"]');
    expect(SRC).toContain('[data-open-settings]');
    expect(SRC).toContain('e.metaKey || e.ctrlKey');
    expect(SRC).toContain('(github|ai|account|computers)');
  });
  test('it posts with fetch, same origin, asking for JSON, and never keeps the key', () => {
    expect(SRC).toContain("credentials: 'same-origin'");
    expect(SRC).toContain("accept: 'application/json'");
    expect(SRC).not.toMatch(/localStorage\.setItem\([^)]*key/i);
    expect(SRC).not.toContain('console.');
  });
  test('on phones the dialog fills the screen', () => {
    expect(SETTINGS_CSS).toMatch(/@media \(max-width:760px\)\{[\s\S]*\.sd-box\{width:100%;height:100%/);
  });
});

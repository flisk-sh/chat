import { expect, test } from 'bun:test';
import { JA, JA_PATTERNS, jaScript } from '../src/i18n-ja.js';
import { chatPage } from '../src/app-page.js';
import { SEO_HEAD, seoHead } from '../src/page.js';
import worker from '../src/index.js';

const hreflangs = (html) => [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => `${m[1]} ${m[2]}`);
const SET = ['en https://chat.flisk.si/', 'ja https://chat.flisk.si/ja/', 'x-default https://chat.flisk.si/'];

test('English stays the default: / is lang en, canonical to /, with no Japanese script', () => {
  const html = chatPage({ login: 'ada' });
  expect(html).toContain('<html lang="en">');
  expect(html).toContain('<link rel="canonical" href="https://chat.flisk.si/">');
  expect(html).not.toContain("window.__LANG='ja'");
  expect(hreflangs(html)).toEqual(SET);
  expect(SEO_HEAD).toBe(seoHead('en'));
});

test('/ja/ is lang ja, canonical to itself, and lists the same hreflang set', () => {
  const html = chatPage({ login: 'ada', lang: 'ja' });
  expect(html).toContain('<html lang="ja">');
  expect(html).toContain('<link rel="canonical" href="https://chat.flisk.si/ja/">');
  expect(html).toContain('<meta property="og:locale" content="ja_JP">');
  expect(html).toMatch(/<title>[^<]*一言で/);
  expect(html).toContain("window.__LANG='ja'");
  expect(hreflangs(html)).toEqual(SET);
});

test('the Japanese script is valid JavaScript and ships no raw </script>', () => {
  expect(() => new Function(jaScript())).not.toThrow();
  expect(jaScript()).not.toContain('</script');
});

function loadT() {
  const win = {};
  const doc = { readyState: 'complete', documentElement: {}, body: { appendChild() {} }, createElement: () => ({ style: {} }), createTreeWalker: () => ({ currentNode: null, nextNode: () => null }), addEventListener() {} };
  new Function('window', 'document', 'localStorage', 'MutationObserver', jaScript())(win, doc, { setItem() {} }, class { observe() {} });
  return win.__t;
}

test('the home screen, the composer and the errors come out in Japanese', () => {
  const t = loadT();
  expect(t('What shall we make today?')).toBe('今日は何を作りますか？');
  expect(t('Ask or build…')).toBe('質問する、または作る…');
  expect(t('Start free with GitHub')).toBe('GitHub で無料で始める');
  expect(t('Good evening, ann')).toBe('こんばんは、annさん');
  expect(t('Could not reach Chat. Check your connection and try again.')).toContain('接続できません');
  expect(t('Try again: fetch failed')).toBe('もう一度試す: fetch failed');
  expect(t('A string nobody translated')).toBe('A string nobody translated');
});

test('no Japanese entry is empty and every pattern rebuilds a string', () => {
  for (const [k, v] of Object.entries(JA)) expect(v.trim().length, k).toBeGreaterThan(0);
  expect(JA_PATTERNS.length).toBeGreaterThan(5);
});

test('the Worker serves /ja and /ja/ in Japanese and / in English, lists both in the sitemap', async () => {
  const env = {};
  const get = (p) => worker.fetch(new Request(`https://chat.flisk.si${p}`), env, { waitUntil() {} });
  const [en, ja, ja2, map, robots] = await Promise.all([get('/'), get('/ja'), get('/ja/'), get('/sitemap.xml'), get('/robots.txt')]);
  expect(await en.text()).toContain('<html lang="en">');
  for (const r of [ja, ja2]) { expect(r.status).toBe(200); expect(await r.text()).toContain('<html lang="ja">'); }
  const xml = await map.text();
  expect(xml).toContain('<loc>https://chat.flisk.si/ja/</loc>');
  expect(xml).toContain('hreflang="ja" href="https://chat.flisk.si/ja/"');
  expect(await robots.text()).toContain('Allow: /ja/$');
});

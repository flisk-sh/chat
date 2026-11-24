import { test, expect } from 'bun:test';
import { gzipSync } from 'node:zlib';
import { appAsset, chatPage, appCsp } from '../src/app-page.js';
import { APP_JS, APP_CSS, APP_JS_PATH, APP_CSS_PATH, APP_FONTS } from '../src/app.generated.js';

test('the Astryx page links the app files and hands it the visitor facts', () => {
  const html = chatPage({ login: 'ada', connected: ['upstash'], models: [{ id: 'm' }], theme: 'earth' });
  expect(html).toContain('<div id="root">');
  expect(html).toContain('window.__BOOT__=');
  const boot = JSON.parse(/window\.__BOOT__=(.*?)<\/script>/s.exec(html)[1]);
  expect(boot.login).toBe('ada');
  expect(boot.connected).toEqual(['upstash']);
  // The analytics, the shared Flisk bar and the app itself, from this origin at its hashed name (#351).
  expect(html.match(/<script[^>]+src="[^"]+"/g)).toEqual([expect.stringContaining('https://flisk.sh/a.js'), expect.stringContaining('https://flisk.si/assets/bar.js'), `<script type="module" src="${APP_JS_PATH}"`]);
  expect(html).toContain(`<link rel="stylesheet" href="${APP_CSS_PATH}">`);
  expect(html).not.toContain(APP_JS.slice(0, 200));
  expect(html).not.toContain(APP_CSS.slice(0, 200));
  expect(html).toContain('--fbar'); // the app sits below the bar
  expect(APP_JS.length).toBeGreaterThan(1000);
  expect(APP_CSS.length).toBeGreaterThan(1000);
});

test('a hostile value cannot close the boot script', () => {
  const html = chatPage({ login: '</script><script>alert(1)</script>' });
  expect(html.match(/<\/script>/g).length).toBe(6); // analytics + bar + boot + app + Earth + bar offset, nothing more
});

test('the page policy allows the app files from this origin and no data: fonts (#351)', () => {
  const csp = appCsp("default-src 'none'; style-src 'unsafe-inline'; font-src https://fonts.gstatic.com; script-src 'unsafe-inline'");
  expect(csp).toContain("script-src 'self' 'unsafe-inline'");
  expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  expect(csp).toContain("font-src 'self' https://fonts.gstatic.com");
  expect(csp).not.toContain('data:');
  expect(csp).toContain("default-src 'none'");
});

test('the app files are served at hashed names, kept for a year (#351)', async () => {
  const { default: worker } = await import('../src/index.js');
  const env = { SESSION_SECRET: 'x'.repeat(32) };
  const get = (p, method = 'GET') => worker.fetch(new Request('https://chat.test' + p, { method }), env);
  expect(Object.keys(APP_FONTS).length).toBeGreaterThan(0);
  for (const [p, type, body] of [[APP_JS_PATH, 'text/javascript', APP_JS], [APP_CSS_PATH, 'text/css', APP_CSS]]) {
    expect(p).toMatch(/^\/_app\/app\.[0-9a-f]{12}\.(js|css)$/);
    const r = await get(p);
    expect({ p, status: r.status, type: r.headers.get('content-type'), cache: r.headers.get('cache-control'), nosniff: r.headers.get('x-content-type-options') })
      .toEqual({ p, status: 200, type: expect.stringContaining(type), cache: 'public, max-age=31536000, immutable', nosniff: 'nosniff' });
    expect(await r.text()).toBe(body);
  }
  for (const p of Object.keys(APP_FONTS)) {
    const r = await get(p);
    expect({ p, status: r.status, type: r.headers.get('content-type'), cache: r.headers.get('cache-control') }).toEqual({ p, status: 200, type: 'font/woff2', cache: 'public, max-age=31536000, immutable' });
    expect(new TextDecoder().decode((await r.arrayBuffer()).slice(0, 4))).toBe('wOF2');
  }
  expect((await get(APP_JS_PATH, 'HEAD')).status).toBe(200);
  // A page from before a deploy may ask for the previous name: it gets today's file, not kept.
  const old = await get('/_app/app.000000000000.js');
  expect({ status: old.status, cache: old.headers.get('cache-control') }).toEqual({ status: 200, cache: 'no-store' });
  for (const p of ['/_app/font.000000000000.woff2', '/_app/app.js', '/_app/../index.js', '/_app/x.123456789abc.js', '/_app/app.123456789abc.html']) expect({ p, status: (await get(p)).status }).toEqual({ p, status: 404 });
  expect(appAsset('/favicon.ico')).toBe(null);
});

test('the CSS points at the font files, not data: URLs (#351)', () => {
  expect(APP_CSS).not.toContain('data:font');
  const used = [...new Set([...APP_CSS.matchAll(/url\((\/_app\/font\.[0-9a-f]{12}\.woff2)\)/g)].map((m) => m[1]))];
  expect(used.sort()).toEqual(Object.keys(APP_FONTS).sort());
});

test('size budget: the page, the app and its fonts stay small (#351)', () => {
  // Measured 2026-11-22: HTML 14.5 KB, JS 511 KB gzip (Astryx core is most of it, already imported per component),
  // CSS 54 KB gzip, fonts 70 KB. A dependency bump that grows these past the budget fails here.
  // HTML limit 32 -> 34 KB on 2026-11-24: every page carries the settings dialog's CSS and script inline (33.1 KB now).
  const gz = (s) => gzipSync(s).length;
  const fonts = Object.values(APP_FONTS).reduce((n, b) => n + Math.floor((b.length * 3) / 4), 0);
  const html = chatPage({ login: 'ada', models: [{ id: 'm' }] });
  expect({ html: html.length < 34 * 1024, js: gz(APP_JS) < 540 * 1024, css: gz(APP_CSS) < 70 * 1024, fonts: fonts < 100 * 1024 })
    .toEqual({ html: true, js: true, css: true, fonts: true });
});

test('Earth dims behind the text and sinks once a chat starts', async () => {
  const css = await Bun.file(new URL('../web/src/app.css', import.meta.url)).text();
  expect(css).toContain('html[data-scheme=earth].chatting');
  expect(css).toContain('text-shadow');
});

test('the home page is the new design, and the previous one stays at /classic', async () => {
  const { default: worker } = await import('../src/index.js');
  const env = { SESSION_SECRET: 'x'.repeat(32) };
  const get = async (p) => (await worker.fetch(new Request('https://chat.test' + p), env)).text();
  for (const p of ['/', '/next']) expect(await get(p)).toContain('<div id="root">');
  expect(await get('/classic')).not.toContain('<div id="root">');
});

test('phones: the starter chips and the + menu stay readable over the Earth', async () => {
  const css = await Bun.file(new URL('../web/src/app.css', import.meta.url)).text();
  expect(css).toContain('.chips button');
  expect(css).toContain('[role=menu]');
});

test('voice talk is wired: the screen listens through /api/talk and speaks through /voice', async () => {
  const src = await Bun.file(new URL('../web/src/Oracle.jsx', import.meta.url)).text();
  expect(src).toContain("'/api/talk'");
  expect(src).toContain("'/voice?l='");
  expect(src).toContain('getUserMedia');
});

test('voice typing sends the recording to /api/transcribe', async () => {
  const src = await Bun.file(new URL('../web/src/App.jsx', import.meta.url)).text();
  expect(src).toContain("'/api/transcribe'");
  expect(src).not.toContain('Voice typing arrives');
});

test('touch screens get 44px tap targets', async () => {
  const css = await Bun.file(new URL('../web/src/app.css', import.meta.url)).text();
  expect(css).toContain('pointer:coarse');
  expect(css).toContain('min-height:44px');
});

test('the computers dialog uses a short key placeholder that fits', async () => {
  const src = await Bun.file(new URL('../web/src/Pickers.jsx', import.meta.url)).text();
  expect(src).toContain('placeholder="Paste key"');
});

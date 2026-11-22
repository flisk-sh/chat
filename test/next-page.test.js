import { test, expect } from 'bun:test';
import { nextPage, nextCsp } from '../src/next-page.js';
import { NEXT_JS, NEXT_CSS } from '../src/next-app.generated.js';

test('the Astryx page carries the app inline and hands it the visitor facts', () => {
  const html = nextPage({ login: 'ada', connected: ['upstash'], models: [{ id: 'm' }], theme: 'earth' });
  expect(html).toContain('<div id="root">');
  expect(html).toContain('window.__BOOT__=');
  const boot = JSON.parse(/window\.__BOOT__=(.*?)<\/script>/s.exec(html)[1]);
  expect(boot.login).toBe('ada');
  expect(boot.connected).toEqual(['upstash']);
  expect(html.match(/<script[^>]+src="[^"]+"/g)).toEqual([expect.stringContaining('https://flisk.sh/a.js'), expect.stringContaining('https://flisk.si/assets/bar.js')]); // only the analytics and the shared Flisk bar; the app is inline
  expect(html).toContain('--fbar'); // the app sits below the bar
  expect(NEXT_JS.length).toBeGreaterThan(1000);
  expect(NEXT_CSS.length).toBeGreaterThan(1000);
});

test('a hostile value cannot close the boot script', () => {
  const html = nextPage({ login: '</script><script>alert(1)</script>' });
  expect(html.match(/<\/script>/g).length).toBe(6); // analytics + bar + boot + app + Earth + bar offset, nothing more
});

test('the page policy allows inlined fonts and nothing else new', () => {
  const csp = nextCsp("default-src 'none'; font-src https://fonts.gstatic.com; script-src 'unsafe-inline'");
  expect(csp).toContain('font-src data: https://fonts.gstatic.com');
  expect(csp).toContain("default-src 'none'");
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

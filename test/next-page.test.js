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
  expect(html).not.toMatch(/<script[^>]+src=/); // the policy allows inline scripts only
  expect(NEXT_JS.length).toBeGreaterThan(1000);
  expect(NEXT_CSS.length).toBeGreaterThan(1000);
});

test('a hostile value cannot close the boot script', () => {
  const html = nextPage({ login: '</script><script>alert(1)</script>' });
  expect(html.match(/<\/script>/g).length).toBe(3); // boot + app + Earth, nothing more
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

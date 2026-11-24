import { expect, test } from 'bun:test';
import { handle } from '../src/index.js';
import { nextPage } from '../src/next-page.js';
import { appPage } from '../src/page.js';
import { makeSession, newAnonLogin } from '../src/session.js';

const ORIGIN = 'https://chat.test';
const HOOK = /<span data-flisk-login hidden>([^<]*)<\/span>/;
const memCache = () => { const m = new Map(); return { match: async (k) => m.get(String(k.url || k))?.clone(), put: async (k, r) => { m.set(String(k.url || k), r); } }; };
const env = () => ({ PUBLIC_ORIGIN: ORIGIN, SESSION_SECRET: 's', FLEET_URL: 'https://fleet.test', FLEET_SERVICE_SECRET: 'x'.repeat(40), LIMIT_CACHE: memCache() });
const net = async (u) => (String(u).includes('/v1/connections') ? Response.json({ connections: {} }) : Response.json({}));
const get = (path, cookie = '') => handle(new Request(`${ORIGIN}${path}`, { headers: { cookie } }), env(), { fetchImpl: net });

test('signed-in pages carry the login in a hidden hook', () => {
  expect(nextPage({ login: 'octocat' }).match(HOOK)[1]).toBe('octocat');
  expect(appPage({ login: 'octocat', connected: [] }).match(HOOK)[1]).toBe('octocat');
});

test('the hook is absent for signed-out and anonymous renders', () => {
  expect(nextPage({ login: null })).not.toContain('data-flisk-login');
  expect(appPage({ login: null, connected: [] })).not.toContain('data-flisk-login');
  expect(nextPage({ login: 'anon-0123456789abcdef', anon: true })).not.toContain('data-flisk-login');
  expect(appPage({ login: 'anon-0123456789abcdef', anon: true, connected: [] })).not.toContain('data-flisk-login');
  // Even if the anon flag were lost, an anon-<hex> login must never reach the hook.
  expect(nextPage({ login: 'anon-0123456789abcdef' })).not.toContain('data-flisk-login');
});

test('the login is HTML-escaped', () => {
  const html = nextPage({ login: '"><script>x</script>' });
  expect(html).not.toContain('<script>x</script>');
  expect(html).toContain('<span data-flisk-login hidden>&quot;&gt;&lt;script&gt;x&lt;/script&gt;</span>');
});

test('through the worker: an anonymous session gets an empty hook, a signed-in one gets the login', async () => {
  const anon = (await makeSession(env(), newAnonLogin())).split(';')[0];
  for (const path of ['/', '/classic']) {
    const res = await get(path, anon);
    expect(await res.text()).not.toContain('data-flisk-login');
    // A first visit with no cookie mints an anon session and must not show a hook either.
    expect(await (await get(path)).text()).not.toContain('data-flisk-login');
  }
  const ann = (await makeSession(env(), 'ann')).split(';')[0];
  for (const path of ['/', '/classic', '/settings']) {
    expect((await (await get(path, ann)).text()).match(HOOK)?.[1]).toBe('ann');
  }
});

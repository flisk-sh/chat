import { expect, test } from 'bun:test';
import { ANON_TALK_PER_DAY, ANON_TASKS_PER_DAY, handle } from '../src/index.js';
import { isAnon, makeSession, newAnonLogin, readSession } from '../src/session.js';

const ORIGIN = 'https://chat.test';
const memCache = () => { const m = new Map(); return { match: async (k) => m.get(String(k.url || k))?.clone(), put: async (k, r) => { m.set(String(k.url || k), r); } }; };
const INFERENCE = { fetch: async () => Response.json({ choices: [{ message: { content: 'Hello.' } }] }) };
const env = () => ({ PUBLIC_ORIGIN: ORIGIN, SESSION_SECRET: 's', FLEET_URL: 'https://fleet.test', FLEET_SERVICE_SECRET: 'x'.repeat(40), LIMIT_CACHE: memCache(), INFERENCE, INFERENCE_KEY: 'ik', INFERENCE_URL: 'https://inf.test/v1/chat/completions' });
const net = async (u, init) => (String(u).includes('/v1/connections') ? Response.json({ connections: { e2b: true } }) : Response.json({}));
const home = (e, cookie = '') => handle(new Request(`${ORIGIN}/`, { headers: { cookie } }), e, { fetchImpl: net });
const anonCookie = async (e) => (await makeSession(e, newAnonLogin())).split(';')[0];
const post = (e, path, body, cookie, ip = '1.1.1.1') => handle(new Request(`${ORIGIN}${path}`, { method: 'POST', headers: { cookie, origin: ORIGIN, 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify(body) }), e, { fetchImpl: net });

test('anonymous ids look like GitHub names to fleet and are recognised', () => {
  const id = newAnonLogin();
  expect(id).toMatch(/^anon-[a-f0-9]{16}$/);
  expect(/^[A-Za-z0-9-]{1,39}$/.test(id)).toBe(true); // what fleet accepts
  expect(isAnon(id)).toBe(true);
  expect(isAnon('octocat')).toBe(false);
  expect(isAnon('anon-notahexid')).toBe(false);
});

test('the home page gives a visitor a private session that lasts, and says GitHub is optional', async () => {
  const e = env();
  const res = await home(e);
  const cookie = res.headers.get('set-cookie');
  expect(cookie).toMatch(/chat_sess=anon-[a-f0-9]{16}\./);
  expect(cookie).toMatch(/HttpOnly/);
  expect(Number(/Max-Age=(\d+)/.exec(cookie)[1])).toBeGreaterThan(30 * 86400);
  const page = await res.text();
  expect(page).toContain('window.__ANON__=true');
  expect(page).toMatch(/Optional\./);
  // The same cookie again: no new id, and fleet's connections are read for that anonymous id.
  const again = await home(e, cookie.split(';')[0]);
  // No new session (the look cookie may still be set, since this request does not send one back).
  expect(again.headers.get('set-cookie') || '').not.toContain('chat_sess');
  expect(await again.text()).toContain('window.__ANON__=true');
});

test('GitHub sign-in is still offered with an anonymous cookie, and refuses names that start with anon-', async () => {
  const e = { ...env(), GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'sec' };
  const cookie = await anonCookie(e);
  const res = await handle(new Request(`${ORIGIN}/auth/start`, { headers: { cookie } }), e, { fetchImpl: net });
  expect(res.status).toBe(302);
  expect(res.headers.get('location')).toContain('github.com/login/oauth/authorize');
  const state = 'abc';
  const gh = async (u) => (String(u).includes('access_token') ? Response.json({ access_token: 't' }) : Response.json({ login: 'anon-0123456789abcdef' }));
  const cb = await handle(new Request(`${ORIGIN}/auth/callback?code=c&state=${state}`, { headers: { cookie: `chat_state=${state}` } }), e, { fetchImpl: gh });
  expect(cb.status).toBe(400);
  expect(cb.headers.get('set-cookie') || '').not.toContain('chat_sess');
});

test('anonymous visitors can talk, but PR review settings need GitHub', async () => {
  const e = env();
  const cookie = await anonCookie(e);
  const talk = await post(e, '/api/talk', { history: [{ role: 'user', content: 'hi' }], ai: { ai: 'wolf' } }, cookie);
  expect(talk.status).toBe(200);
  expect((await handle(new Request(`${ORIGIN}/reviews`, { headers: { cookie } }), e, { fetchImpl: net })).headers.get('location')).toBe('/auth/start');
  expect((await post(e, '/api/review-ai', { ai: 'openai', key: 'sk-1234567890', model: 'gpt' }, cookie)).status).toBe(403);
});

test('anonymous limits count the network address, so a fresh cookie does not reset them', async () => {
  const e = env();
  for (let i = 0; i < ANON_TALK_PER_DAY; i++) expect((await post(e, '/api/talk', { history: [{ role: 'user', content: 'hi' }], ai: { ai: 'wolf' } }, await anonCookie(e), '9.9.9.9')).status).toBe(200);
  const over = await post(e, '/api/talk', { history: [{ role: 'user', content: 'hi' }], ai: { ai: 'wolf' } }, await anonCookie(e), '9.9.9.9');
  expect(over.status).toBe(429);
  expect((await over.json()).error).toMatch(/Sign in with GitHub/);
  // Another address is not affected, and a signed-in person is counted by login.
  expect((await post(e, '/api/talk', { history: [{ role: 'user', content: 'hi' }], ai: { ai: 'wolf' } }, await anonCookie(e), '8.8.8.8')).status).toBe(200);
  const ann = (await makeSession(e, 'ann')).split(';')[0];
  expect((await post(e, '/api/talk', { history: [{ role: 'user', content: 'hi' }], ai: { ai: 'wolf' } }, ann, '9.9.9.9')).status).toBe(200);
});

test('anonymous free tasks have their own, smaller daily limit', async () => {
  expect(ANON_TASKS_PER_DAY).toBeLessThan(20);
  const e = env();
  let last;
  for (let i = 0; i <= ANON_TASKS_PER_DAY; i++) last = await post(e, '/api/run', { task: 'say hi', ai: { ai: 'wolf' } }, await anonCookie(e), '7.7.7.7');
  expect(last.status).toBe(429);
  const body = await last.json();
  expect(body.limit).toBe(ANON_TASKS_PER_DAY);
  expect(body.anon).toBe(true);
});

test('a session cookie for an anonymous id reads back as that id', async () => {
  const e = env();
  const id = newAnonLogin();
  const cookie = (await makeSession(e, id)).split(';')[0];
  expect((await readSession(e, new Request(ORIGIN, { headers: { cookie } }))).login).toBe(id);
});

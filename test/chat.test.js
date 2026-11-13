import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { handle, overDailyLimit, publishSite, MAX_SITE_BYTES } from '../src/index.js';
import { parseAction, resolveModel, runTask } from '../src/loop.js';
import { makeSession } from '../src/session.js';
import { fakeD1 } from './d1.js';

const SCHEMA = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const ORIGIN = 'https://chat.test';
const env = (extra = {}) => ({ DB: fakeD1(SCHEMA), PUBLIC_ORIGIN: ORIGIN, SESSION_SECRET: 's', FLEET_URL: 'https://fleet.test', FLEET_SERVICE_SECRET: 'x'.repeat(40), INFERENCE_KEY: 'ik', INFERENCE_URL: 'https://inf.test/v1/chat/completions', ...extra });

// A fake fleet and a scripted model behind one fetch.
function world({ connected = true, replies = [] } = {}) {
  const log = [];
  const state = { connected, stopped: [], connectBody: null, onBehalf: new Set() };
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const body = init.body ? JSON.parse(init.body) : undefined;
    if (u.host !== 'fleet.test') {
      log.push({ modelCall: { host: u.host, auth: init.headers.authorization, model: body.model, max: body.max_tokens } });
    }
    if (u.host === 'inf.test' || u.host === 'api.anthropic.com' || u.host === 'openrouter.ai') {
      log.push({ model: body.messages });
      return Response.json({ choices: [{ message: { content: replies.shift() ?? '{"say":"out of script"}' } }] });
    }
    state.onBehalf.add(init.headers['x-on-behalf-of']);
    log.push({ fleet: `${init.method} ${u.pathname}` });
    if (u.pathname === '/v1/connections' && init.method === 'GET') return Response.json({ connections: state.connected ? { daytona: { hint: 'abcd' } } : {} });
    if (u.pathname.startsWith('/v1/connections/') && init.method === 'PUT') {
      state.connectBody = body;
      state.connected = true;
      return Response.json({ ok: true });
    }
    if (u.pathname === '/v1/pods' && init.method === 'POST') state.podBody = body;
    if (u.pathname === '/v1/pods' && init.method === 'POST') return Response.json({ id: 'pod_x', provider: 'daytona' }, { status: 201 });
    if (u.pathname.endsWith('/run')) return Response.json({ stdout: `ran:${body.command}\n`, stderr: '', exitCode: 0 });
    if (u.pathname.endsWith('/files') && init.method === 'PUT') return Response.json({ path: body.path, bytes: body.content.length });
    if (u.pathname.endsWith('/files') && init.method === 'GET') return Response.json({ path: u.searchParams.get('path'), encoding: 'utf8', content: '<!doctype html><html><body><h1>Moon Roast</h1></body></html>' });
    if (init.method === 'DELETE') {
      state.stopped.push(u.pathname);
      return Response.json({ ok: true });
    }
    return Response.json({ error: 'no route' }, { status: 404 });
  };
  return { fetchImpl, log, state };
}

const authed = async (e, login = 'octo') => (await makeSession(e, login)).split(';')[0];
const post = (e, w, path, body, cookie, headers = {}) =>
  handle(new Request(`${ORIGIN}${path}`, { method: 'POST', headers: { cookie, origin: ORIGIN, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }), e, { fetchImpl: w.fetchImpl });
const events = async (res) => (await res.text()).trim().split('\n').map((l) => JSON.parse(l));

describe('parseAction', () => {
  test('knows publish, and broken action JSON is "bad" not an answer', () => {
    expect(parseAction('{"publish":"/tmp/site/index.html"}')).toEqual({ type: 'publish', path: '/tmp/site/index.html' });
    expect(parseAction(`{"run": "echo "hi""}`).type).toBe('bad');
    expect(parseAction('The answer is 42.')).toEqual({ type: 'say', text: 'The answer is 42.' });
  });

  test('DSML / tool-call style output is bad so the loop retries', () => {
    const dsml = `<｜ DSML ｜ invoke name="write">
<｜ DSML ｜ parameter name="path" string="true">/tmp/index.html</｜ DSML ｜ parameter>
<｜ DSML ｜ parameter name="content" string="true"><html>hi</html></｜ DSML ｜ parameter>
</｜ DSML ｜ invoke>`;
    expect(parseAction(dsml).type).toBe('bad');
    expect(parseAction('<invoke name="write"><parameter name="path">x</parameter></invoke>').type).toBe('bad');
  });
});

describe('website task end to end', () => {
  test('write, publish, say the link; the computer is stopped; the link serves sandboxed with a bar', async () => {
    const e = env();
    const w = world({ replies: ['{"write":{"path":"/tmp/site/index.html","content":"<html>x</html>"}}', '{"publish":"/tmp/site/index.html"}', '{"say":"Done"}'] });
    const cookie = await authed(e);
    const res = await post(e, w, '/api/run', { task: 'make a site' }, cookie);
    expect(res.status).toBe(200);
    const evs = await events(res);
    const pub = evs.find((x) => x.published);
    expect(pub.published).toMatch(/^https:\/\/chat\.test\/s\/[a-f0-9]{16}$/);
    expect(evs.at(-2).type).toBe('pod_stopped');
    expect(w.state.stopped).toEqual(['/v1/pods/pod_x']);
    expect(w.state.onBehalf).toEqual(new Set(['octo']));
    // The model was told the link, so it can say it.
    expect(JSON.stringify(w.log.filter((l) => l.model).at(-1).model)).toContain(pub.published);
    const page = await handle(new Request(pub.published), e, {});
    const text = await page.text();
    expect(text).toContain('Moon Roast');
    expect(text).toContain('Made with Flisk Chat by @octo');
    expect(page.headers.get('content-security-policy')).toStartWith('sandbox allow-scripts');
    expect(page.headers.get('x-robots-tag')).toContain('noindex');
  });

  test('a site expires after 7 days and unknown ids are 404', async () => {
    const e = env();
    const made = await publishSite(e, 'octo', '<html><body>hi</body></html>', ORIGIN);
    const id = made.url.split('/').pop();
    expect((await handle(new Request(made.url), e, {})).status).toBe(200);
    e.DB.raw.query('UPDATE sites SET created = ? WHERE id = ?').run(new Date(Date.now() - 8 * 86400_000).toISOString(), id);
    expect((await handle(new Request(made.url), e, {})).status).toBe(404);
    expect((await handle(new Request(`${ORIGIN}/s/${'0'.repeat(16)}`), e, {})).status).toBe(404);
  });

  test('refuses a file that is not HTML or is too big, and keeps only 5 sites per person', async () => {
    const e = env();
    expect((await publishSite(e, 'octo', 'just text', ORIGIN)).error).toContain('not an HTML');
    expect((await publishSite(e, 'octo', '<html>' + 'x'.repeat(MAX_SITE_BYTES), ORIGIN)).error).toContain('limit');
    for (let i = 0; i < 7; i++) await publishSite(e, 'octo', `<html><body>${i}</body></html>`, ORIGIN);
    expect(e.DB.raw.query('SELECT count(*) AS n FROM sites WHERE login = ?').get('octo').n).toBe(5);
  });
});

describe('first-time flow', () => {
  test('no computer connected: a task gets 409 needProvider and uses no model call', async () => {
    const e = env();
    const w = world({ connected: false });
    const res = await post(e, w, '/api/run', { task: 'hi' }, await authed(e));
    expect(res.status).toBe(409);
    expect((await res.json()).needProvider).toBe(true);
    expect(w.log.some((l) => l.model)).toBe(false);
  });

  test('pasting a key sends it to fleet once for that login, only for known providers', async () => {
    const e = env();
    const w = world({ connected: false });
    const cookie = await authed(e);
    expect((await post(e, w, '/api/connect', { provider: 'evil', key: 'k' }, cookie)).status).toBe(400);
    expect((await post(e, w, '/api/connect', { provider: 'daytona', key: 'my-daytona-key-1' }, cookie)).status).toBe(200);
    expect(w.state.connectBody).toEqual({ key: 'my-daytona-key-1' });
  });
});

describe('safety', () => {
  test('API needs sign-in, same origin and POST', async () => {
    const e = env();
    const w = world();
    expect((await post(e, w, '/api/run', { task: 'x' }, '')).status).toBe(401);
    const cookie = await authed(e);
    expect((await post(e, w, '/api/run', { task: 'x' }, cookie, { origin: 'https://evil.test' })).status).toBe(403);
    expect((await handle(new Request(`${ORIGIN}/api/run`, { headers: { cookie } }), e, { fetchImpl: w.fetchImpl })).status).toBe(403);
  });

  test('a forged session cookie is not a session', async () => {
    const e = env();
    const res = await post(e, world(), '/api/run', { task: 'x' }, 'chat_sess=mallory.9999999999999.bogus');
    expect(res.status).toBe(401);
  });

  test('at most 20 tasks a day each, counted per login', async () => {
    const store = new Map();
    const cache = { match: async (u) => (store.has(u) ? new Response(store.get(u)) : undefined), put: async (u, r) => void store.set(u, await r.text()) };
    for (let i = 0; i < 20; i++) expect(await overDailyLimit('octo', { cache })).toBe(false);
    expect(await overDailyLimit('octo', { cache })).toBe(true);
    expect(await overDailyLimit('other', { cache })).toBe(false);
  });

  test('the home page and the app page escape the login and their scripts parse', async () => {
    const e = env();
    const w = world();
    const home = await (await handle(new Request(`${ORIGIN}/`), e, { fetchImpl: w.fetchImpl })).text();
    expect(home).toContain('Sign in with GitHub');
    expect(home).toContain('id="ask"');
    expect(home).toContain('window.__SIGNED__=false');
    for (const m of home.matchAll(/<script>([\s\S]*?)<\/script>/g)) expect(() => new Function(m[1])).not.toThrow();
    const app = await (await handle(new Request(`${ORIGIN}/`, { headers: { cookie: await authed(e, 'a-b') } }), e, { fetchImpl: w.fetchImpl })).text();
    expect(app).toContain('@a-b');
    for (const m of app.matchAll(/<script>([\s\S]*?)<\/script>/g)) expect(() => new Function(m[1])).not.toThrow();
  });
});

describe('runTask', () => {
  test('a task that needs no computer starts none', async () => {
    const calls = [];
    const computer = new Proxy({}, { get: (_, k) => async () => void calls.push(k) });
    const r = await runTask({ task: 'hi', model: async () => ({ text: '{"say":"Hello"}' }), computer, publish: async () => ({}) });
    expect(r.answer).toBe('Hello');
    expect(calls).toEqual([]);
  });
  test('a model error stops a started computer', async () => {
    const w = world();
    let n = 0;
    const model = async () => (n++ ? { error: 'daily limit used up' } : { text: '{"run":"true"}' });
    const { fleetClient } = await import('../src/fleet.js');
    const r = await runTask({ task: 't', model, computer: fleetClient(env(), 'octo', w.fetchImpl), publish: async () => ({}) });
    expect(r.error).toBe('daily limit used up');
    expect(w.state.stopped).toEqual(['/v1/pods/pod_x']);
  });
});

describe('the two pickers', () => {
  const body = (extra) => ({ task: 'make a site', ...extra });
  const script = ['{"run":"true"}', '{"say":"ok"}'];

  test('default: free Wolf, and fleet picks (no order sent)', async () => {
    const e = env();
    const w = world({ replies: [...script] });
    await (await post(e, w, '/api/run', body({}), await authed(e))).text();
    expect(w.state.podBody.order).toBeUndefined();
    expect(w.log.find((l) => l.modelCall).modelCall).toMatchObject({ host: 'inf.test', auth: 'Bearer ik', model: 'flisk-wolf-chat', max: 1024 });
  });

  test('ticked computers become the order fleet may use', async () => {
    const e = env();
    const w = world({ replies: [...script] });
    await (await post(e, w, '/api/run', body({ providers: ['daytona'] }), await authed(e))).text();
    expect(w.state.podBody.order).toEqual(['daytona']);
  });

  test('a computer that is not connected is refused before any model call', async () => {
    const e = env();
    const w = world();
    const res = await post(e, w, '/api/run', body({ providers: ['e2b'] }), await authed(e));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('e2b is not connected');
    expect(w.log.some((l) => l.modelCall)).toBe(false);
  });

  test("the visitor's own Claude key goes only to Anthropic, with a bigger answer limit, and is never echoed", async () => {
    const e = env();
    const w = world({ replies: [...script] });
    const res = await post(e, w, '/api/run', body({ ai: { ai: 'anthropic', key: 'sk-ant-secret-key-1' } }), await authed(e));
    const text = await res.text();
    expect(text).not.toContain('sk-ant-secret');
    expect(w.log.find((l) => l.modelCall).modelCall).toMatchObject({ host: 'api.anthropic.com', auth: 'Bearer sk-ant-secret-key-1', model: 'claude-sonnet-5-5', max: 4096 });
    expect(JSON.stringify(e.DB.raw.query('SELECT * FROM sites').all())).not.toContain('sk-ant');
  });

  test('bad choices are refused: unknown AI, missing key, odd model name', () => {
    expect(resolveModel({ ai: 'evil' }).error).toContain('listed');
    expect(resolveModel({ ai: 'anthropic', key: '' }).error).toContain('API key');
    expect(resolveModel({ ai: 'openai', key: 'sk-long-enough-key' }).error).toContain('model name');
    expect(resolveModel({ ai: 'openai', key: 'sk-long-enough-key', model: 'a b;rm' }).error).toContain('model name');
    expect(resolveModel({ ai: 'openrouter', key: 'sk-long-enough-key', model: 'anthropic/claude-sonnet-5-5' })).toMatchObject({ free: false, url: 'https://openrouter.ai/api/v1/chat/completions' });
    expect(resolveModel(undefined)).toEqual({ ai: 'wolf', free: true });
  });

  test('the 20-a-day cap counts only the free model', async () => {
    const e = env();
    const store = new Map();
    e.LIMIT_CACHE = { match: async (u) => (store.has(u) ? new Response(store.get(u)) : undefined), put: async (u, r) => void store.set(u, await r.text()) };
    const cookie = await authed(e);
    for (let i = 0; i < 20; i++) await (await post(e, world({ replies: [...script] }), '/api/run', body({}), cookie)).text();
    expect((await post(e, world({ replies: [...script] }), '/api/run', body({}), cookie)).status).toBe(429);
    const own = await post(e, world({ replies: [...script] }), '/api/run', body({ ai: { ai: 'anthropic', key: 'sk-ant-secret-key-1' } }), cookie);
    expect(own.status).toBe(200);
    await own.text();
  });

  test('the page offers both pickers, lists connected computers as tickable and the rest as connect links', async () => {
    const e = env();
    const w = world();
    const app = await (await handle(new Request(`${ORIGIN}/`, { headers: { cookie: await authed(e) } }), e, { fetchImpl: w.fetchImpl })).text();
    expect(app).toContain('id="ai"');
    expect(app).toContain('Fleet</b> (auto');
    expect(app).toContain('name="sb" value="daytona"');
    expect(app).not.toContain('name="sb" value="e2b"');
    expect(app).toContain('E2B · <a href="#setup">connect</a>');
    expect(app).toContain('Blaxel · <a href="https://fleet.flisk.si/console?section=providers"');
    for (const m of app.matchAll(/<script>([\s\S]*?)<\/script>/g)) expect(() => new Function(m[1])).not.toThrow();
  });
});

describe('service binding to inference', () => {
  test('the free model is called through env.INFERENCE, not the public address', async () => {
    const seen = [];
    const e = env({ INFERENCE: { fetch: async (u, init) => (seen.push(u), Response.json({ choices: [{ message: { content: '{"say":"via binding"}' } }] })) } });
    const w = world();
    const res = await post(e, w, '/api/run', { task: 'hi' }, await authed(e));
    expect((await res.text())).toContain('via binding');
    expect(seen).toEqual(['https://inf.test/v1/chat/completions']);
    expect(w.log.some((l) => l.modelCall)).toBe(false);
  });
  test('/health reports fleet and inference without sign-in', async () => {
    const e = env({ INFERENCE: { fetch: async () => new Response('{}', { status: 401 }) } });
    const w = world();
    const r = await (await handle(new Request(`${ORIGIN}/health`), e, { fetchImpl: async () => new Response('{}', { status: 200 }) })).json();
    expect(r).toEqual({ fleet: { status: 200 }, inference: { status: 401 } });
  });
});

import { appPage as appPageUi } from '../src/page.js';
test('app page shows history, key management and coming-soon voice and video', () => {
  const page = appPageUi({ login: 'ann', connected: ['upstash'] });
  expect(page).toContain('id="hist"');
  expect(page).toContain('fleet.flisk.si/console?section=providers');
  expect(page).toContain('Voice talk');
  expect(page).toContain('Video generation');
  expect(page).toContain('Upstash Box');
});

test('app page asks the six Zachman questions as squares before the first task', () => {
  const page = appPageUi({ login: 'ann', connected: [] });
  for (const q of ['What is it?', 'Who is it for?', 'Why do you need it?', 'Where should it live?', 'When do you need it?', 'How should it feel?']) expect(page).toContain(q);
  expect(page).toContain('Skip, just run it');
});

test('signed-out visitors are sent to sign-in from the computers menu', () => {
  expect(appPageUi({ login: null, connected: [] })).toContain('href="/auth/start">sign in to connect</a>');
  expect(appPageUi({ login: 'ann', connected: [] })).toContain('href="#setup">connect</a>');
});

import { cleanModels, DEFAULT_MODELS } from '../src/page.js';
import { loadCatalog } from '../src/index.js';

test('model picker keeps only catalogue entries chat can call, and falls back without a free model', () => {
  const got = cleanModels([
    { id: 'flisk-wolf-chat', name: 'Flisk Wolf', provider: 'flisk', providerName: 'Flisk', key: '', model: 'flisk-wolf-chat' },
    { id: 'x', name: 'Evil', key: 'evilcorp', model: 'x' },
    { id: 'c', name: 'Claude', key: 'anthropic', model: 'a b;rm' },
  ]);
  expect(got.map((m) => m.id)).toEqual(['flisk-wolf-chat', 'c']);
  expect(got[1].model).toBe('');
  expect(cleanModels([{ id: 'c', name: 'C', key: 'anthropic' }])).toBe(DEFAULT_MODELS);
  expect(cleanModels('nope')).toBe(DEFAULT_MODELS);
});

test('the page reads its models from inference /v1/catalog through the binding', async () => {
  const calls = [];
  const env = { INFERENCE_URL: 'https://inf.test/v1/chat/completions', INFERENCE: { fetch: async (u) => { calls.push(u); return Response.json({ data: [{ id: 'flisk-wolf-chat', name: 'Flisk Wolf', provider: 'flisk', providerName: 'Flisk', key: '', model: 'flisk-wolf-chat' }, { id: 'new-one', name: 'New One', provider: 'openrouter', providerName: 'OpenRouter', key: 'openrouter', model: 'some/model' }] }); } } };
  const models = await loadCatalog(env, 1e13);
  expect(calls).toEqual(['https://inf.test/v1/catalog']);
  expect(models.map((m) => m.id)).toEqual(['flisk-wolf-chat', 'new-one']);
  const page = appPageUi({ login: 'ann', connected: [], models });
  expect(page).toContain('"id":"new-one"');
  expect(page.split('</script>').length).toBe(2);
  expect(await loadCatalog({}, 2e13)).toBe(DEFAULT_MODELS);
});

test('the page uses the Flisk icons and shows the four kinds of task', () => {
  const page = appPageUi({ login: 'ann', connected: [] });
  for (const k of ['data-cat="website"', 'data-cat="app"', 'data-cat="answer"', 'data-cat="check"', 'id="mppop"', 'id="newchat"']) expect(page).toContain(k);
  expect(page).toContain('aria-label="Run"');
});

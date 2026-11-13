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
    // Dogfood fixes: the model picker must survive its list re-rendering, the limit card button must not close it,
    // and a task that already says what it is must not be asked "What is it?".
    expect(home).toContain('e.target.isConnected');
    expect(home).toContain('k.onclick=(e)=>{e.stopPropagation()');
    expect(home).toContain('grid-template-rows:minmax(0,1fr)');
    expect(home).toContain("pick=[kind]");
    expect(home).toContain("pop.addEventListener('keydown'");
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
    const over = await post(e, world({ replies: [...script] }), '/api/run', body({}), cookie);
    expect(over.status).toBe(429);
    const why = await over.json();
    expect(why).toMatchObject({ limit: 20 });
    expect(why.resetsIn).toBeGreaterThan(0);
    expect(why.resetsIn).toBeLessThanOrEqual(86400_000);
    const own = await post(e, world({ replies: [...script] }), '/api/run', body({ ai: { ai: 'anthropic', key: 'sk-ant-secret-key-1' } }), cookie);
    expect(own.status).toBe(200);
    await own.text();
  });

  test('the page offers both pickers, lists connected computers as tickable and the rest as connect links', async () => {
    const e = env();
    const w = world();
    const app = await (await handle(new Request(`${ORIGIN}/`, { headers: { cookie: await authed(e) } }), e, { fetchImpl: w.fetchImpl })).text();
    expect(app).toContain('id="ai"');
    expect(app).toContain('Fleet, automatic');
    expect(app).toContain('name="sb" value="daytona"');
    expect(app).not.toContain('name="sb" value="e2b"');
    expect(app).toMatch(/E2B<\/span><a class="cbtn" href="#setup">Connect<\/a>/);
    expect(app).toMatch(/Blaxel<\/span><a class="cbtn" href="https:\/\/fleet\.flisk\.si\/console\?section=providers"/);
    expect(app).toContain('<img src="data:image/svg+xml;base64,');
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
test('app page shows history, key management, coming-soon voice and the video category', () => {
  const page = appPageUi({ login: 'ann', connected: ['upstash'] });
  expect(page).toContain('id="hist"');
  expect(page).toContain('fleet.flisk.si/console?section=providers');
  expect(page).toContain('Voice talk');
  expect(page).not.toContain('Video generation');
  expect(page).toContain('data-cat="video"');
  expect(page).toContain('Upstash Box');
});

test('app page asks the six Zachman questions as squares before the first task', () => {
  const page = appPageUi({ login: 'ann', connected: [] });
  for (const q of ['What is it?', 'Who is it for?', 'Why do you need it?', 'Where should it live?', 'When do you need it?', 'How should it feel?']) expect(page).toContain(q);
  expect(page).toContain('Skip, just build it');
  // Every answer has its own smaller squares, and the video row is there.
  expect(page).toContain('["A video","video",["Promo","Explainer","Social short"]]');
  expect(page).toContain('Other…');
});

test('signed-out visitors are sent to sign-in from the computers menu', () => {
  expect(appPageUi({ login: null, connected: [] })).toContain('<a class="cbtn" href="/auth/start">Sign in</a>');
  expect(appPageUi({ login: 'ann', connected: [] })).toContain('<a class="cbtn" href="#setup">Connect</a>');
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

import { cleanVideo, makeVideo, VIDEO_PY } from '../src/video.js';
import { parseAction as parseVideoAction } from '../src/loop.js';
import { saveVideo, handle as handleVideo } from '../src/index.js';

describe('video', () => {
  test('a video action is parsed and cleaned', () => {
    const a = parseVideoAction('{"video": {"title": "Moon Roast", "scenes": [{"text": "Fresh beans", "say": "We roast every morning."}, {"text": ""}]}}');
    expect(a).toEqual({ type: 'video', spec: { title: 'Moon Roast', scenes: [{ text: 'Fresh beans', say: 'We roast every morning.' }] } });
    expect(cleanVideo({ scenes: [] })).toBeNull();
    expect(cleanVideo({ scenes: Array.from({ length: 20 }, () => ({ text: 'x'.repeat(500) })) }).scenes).toHaveLength(8);
  });

  test('makeVideo writes the script, waits for it, reads the mp4 back in parts and saves it', async () => {
    const calls = [];
    let polls = 0;
    const computer = {
      write: async (id, path, content) => (calls.push(['write', path, content.length]), { data: {} }),
      run: async (id, cmd) => {
        calls.push(['run', cmd.slice(0, 30)]);
        if (cmd.includes('nohup')) return { data: { exitCode: 0, stdout: 'started' } };
        if (cmd.includes('while [ ! -f done ]')) return { data: { exitCode: 0, stdout: ++polls < 2 ? 'running\nscene 1 of 2 done' : 'exit 0\nout.mp4 1000 bytes' } };
        if (cmd.includes('split')) return { data: { exitCode: 0, stdout: 'part_aa\npart_ab\n' } };
        return { data: { exitCode: 1 } };
      },
      read: async (id, path) => ({ data: { encoding: 'base64', content: btoa(path.slice(-2)) } }),
    };
    const notes = [];
    let saved;
    const r = await makeVideo({ computer, podId: 'p', spec: { title: 'T', scenes: [{ text: 'a', say: 'b' }] }, save: async (parts, title) => ((saved = { parts, title }), { url: 'https://chat.flisk.si/v/x.mp4' }), emit: (e) => notes.push(e.text) });
    expect(r).toEqual({ url: 'https://chat.flisk.si/v/x.mp4' });
    expect(saved).toEqual({ parts: [btoa('aa'), btoa('ab')], title: 'T' });
    expect(calls[0]).toEqual(['write', '/tmp/flisk-video/make.py', VIDEO_PY.length]);
    expect(notes).toContain('scene 1 of 2 done');
  });

  test('a render that fails comes back as an error the model can read', async () => {
    const computer = { write: async () => ({ data: {} }), run: async (id, cmd) => ({ data: { exitCode: 0, stdout: cmd.includes('nohup') ? 'started' : 'exit 1\nNo module named PIL' } }), read: async () => ({}) };
    const r = await makeVideo({ computer, podId: 'p', spec: { title: 'T', scenes: [{ text: 'a', say: '' }] }, save: async () => ({ url: 'x' }) });
    expect(r.error).toContain('No module named PIL');
  });

  test('a saved video is served as mp4, with byte ranges for Safari', async () => {
    const e = env();
    const bytes = new Uint8Array(300).map((_, i) => i % 256);
    const b64 = (u) => btoa(String.fromCharCode(...u));
    const { url } = await saveVideo(e, 'ann', [b64(bytes.slice(0, 200)), b64(bytes.slice(200))], 'Moon', ORIGIN);
    expect(url).toMatch(/\/v\/[a-f0-9]{16}\.mp4$/);
    const path = new URL(url).pathname;
    const full = await handleVideo(new Request(`${ORIGIN}${path}`), e);
    expect(full.headers.get('content-type')).toBe('video/mp4');
    expect(new Uint8Array(await full.arrayBuffer())).toEqual(bytes);
    const part = await handleVideo(new Request(`${ORIGIN}${path}`, { headers: { range: 'bytes=190-209' } }), e);
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 190-209/300');
    expect(new Uint8Array(await part.arrayBuffer())).toEqual(bytes.slice(190, 210));
    expect((await handleVideo(new Request(`${ORIGIN}/v/0000000000000000.mp4`), e)).status).toBe(404);
  });
});

test('each kind of step gets its own icon, like tool calls in T3 Code', () => {
  const page = appPageUi({ login: 'ann', connected: [] });
  const js = page.slice(page.lastIndexOf('<script>') + 8, page.lastIndexOf('</script>'));
  const line = js.split('\n').find((l) => l.startsWith('const cmdIcon'));
  const cmdIcon = new Function(`${line};return cmdIcon`)();
  expect(['curl -s https://x', 'pip install -q requests', 'python3 app.py', 'ls -la', 'flisk up', 'echo hi'].map(cmdIcon)).toEqual(['globe', 'download', 'code', 'folder', 'layers', 'terminal']);
  for (const name of ['server', 'pen', 'upload', 'film', 'mic', 'power', 'alert']) expect(js).toContain(`${name}:'<`);
});

test('a square is chosen by a real mouse move, never by a row that appears under a still pointer or by a tap', () => {
  const page = appPageUi({ login: 'ann', connected: [] });
  expect(page).toContain("el.onpointermove=(e)=>{if(e.pointerType!=='mouse'||tm)return;");
  expect(page).not.toContain('el.onmouseenter=');
  // Answered rows fold to a thin line; the folded card keeps only answered chips.
  expect(page).toContain("(i<pick.length-1?' done':'')");
  expect(page).toContain(".zchip:not(.ok)");
});

import { cleanFiles, explainModelError, modelFrom as modelFrom2, runTask as runTask2 } from '../src/loop.js';

describe('model errors a person can act on', () => {
  test('OpenRouter "Provider returned error" shows the real reason and a kind', () => {
    const r = explainModelError({ error: { message: 'Provider returned error', code: 404, metadata: { raw: 'No endpoints found for particle-1:free', provider_name: 'Particle' } } }, 200, { ai: 'openrouter', model: 'particle-1:free' });
    expect(r.kind).toBe('model');
    expect(r.error).toContain('No endpoints found');
    expect(r.error).not.toBe('Provider returned error');
  });
  test('401 is a key problem, 402 a credit problem, 502 a provider problem', () => {
    expect(explainModelError({ error: { message: 'No auth credentials found' } }, 401, { ai: 'openrouter' }).kind).toBe('key');
    expect(explainModelError({ error: { message: 'Insufficient credits' } }, 402, {}).kind).toBe('limit');
    expect(explainModelError({ error: { message: 'Provider returned error', code: 502, metadata: { provider_name: 'Chutes' } } }, 200, {}).error).toContain('Chutes');
  });
  test('an error body sent with HTTP 200 is still an error', async () => {
    const f = async () => new Response(JSON.stringify({ error: { message: 'Provider returned error', code: 429, metadata: { raw: 'rate limited upstream' } } }), { status: 200 });
    const r = await modelFrom2({}, f, { ai: 'openrouter', free: false, url: 'https://x.test', key: 'k'.repeat(10), model: 'a/b' })([{ role: 'user', content: 'hi' }]);
    expect(r.kind).toBe('limit');
    expect(r.error).toContain('rate limited upstream');
  });
  test('the task stream carries the kind so the page can offer next steps', async () => {
    const events = [];
    const r = await runTask2({ task: 'x', model: async () => ({ error: 'bad key', kind: 'key' }), computer: {}, emit: (e) => events.push(e) });
    expect(r.error).toBe('bad key');
    expect(events.find((e) => e.type === 'error').kind).toBe('key');
  });
});

describe('attached files', () => {
  test('cleanFiles flattens names, drops junk and caps the count', () => {
    const f = cleanFiles([{ name: '../../etc/passwd', content: 'x' }, { name: 'a b.csv', content: '1,2' }, { name: 'bad.bin', content: '***', b64: true }, { name: '', content: 'y' }, { name: 'c', content: 'c' }, { name: 'd', content: 'd' }]);
    expect(f.map((x) => x.path)).toEqual(['passwd', 'a_b.csv']);
  });
  test('files are written to the computer before the first step and the model is told', async () => {
    const writes = [];
    const computer = { start: async () => ({ data: { id: 'p', provider: 'daytona' } }), write: async (id, path, content) => (writes.push([path, content]), { status: 200, data: {} }), run: async () => ({ data: { exitCode: 0, stdout: '', stderr: '' } }), stop: async () => ({ status: 200 }) };
    const seen = [];
    let n = 0;
    const model = async (m) => (seen.push(m), n++ ? { text: '{"say":"done"}' } : { text: '{"run":"ls"}' });
    await runTask2({ task: 'sum it', model, computer, files: [{ path: 'data.csv', content: '1,2', b64: false }] });
    expect(writes).toEqual([['data.csv', '1,2']]);
    expect(seen[0].find((m) => m.role === 'user').content).toContain('data.csv');
  });
test('the model button names the chosen model even after a logo replaces the icon', () => {
  const page = appPageUi({ login: 'ann', connected: [] });
  expect(page).toContain('<span class="mpname">Flisk Wolf</span>');
  expect(page).toContain("mpBtn.querySelector('.mpname').textContent=m.name");
});

test('signed out, every computer asks to sign in first; on a phone a backdrop closes the menu', () => {
  const out = appPageUi({ login: null, connected: [] });
  expect(out).not.toContain('>Connect</a>');
  expect(out.match(/href="\/auth\/start">Sign in<\/a>/g).length).toBeGreaterThan(10);
  expect(appPageUi({ login: 'ann', connected: [] })).toContain('>Connect</a>');
  expect(out).toContain('<div id="scrim" class="scrim" aria-hidden="true"></div>');
  expect(out).toContain("$('scrim').onclick=closeSide");
});

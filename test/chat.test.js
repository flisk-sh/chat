import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { handle, overDailyLimit, publishSite, MAX_SITE_BYTES, withStorageShim } from '../src/index.js';
import { modelLabel, parseAction, resolveModel, runTask, SYSTEM } from '../src/loop.js';
import { EARTH_JS, shortCount, THREE_SRC, USERS, USERS_DATE } from '../src/earth.js';
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
    // Signing in is optional: a visitor gets a private anonymous session, so the page is usable.
    expect(home).toContain('window.__SIGNED__=true');
    expect(home).toContain('window.__ANON__=true');
    // The composer's button row must keep every control inside it: balanced divs between <div class="bar"> and </form>.
    const bar = home.slice(home.indexOf('<div class="bar">'), home.indexOf('</form>'));
    expect((bar.match(/<div\b/g) || []).length).toBe((bar.match(/<\/div>/g) || []).length);
    // Dogfood fixes: video keeps its box so the page can scroll to it, a closed drawer is not focusable, dated history, dark theme.
    expect(home).toContain("addEventListener('loadedmetadata',down)");
    expect(home).toContain('.side{visibility:hidden;');
    expect(home).toContain('@media (hover:none){#hist li .x{opacity:1}}');
    expect(home).toContain('@media (prefers-color-scheme:dark){');
    expect(home).toContain('details.pick .menu::after');
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

describe('logos', () => {
  test('no logo changes colour with the browser theme, the page is always light', async () => {
    const { LOGOS } = await import('../src/logos.js');
    for (const [name, uri] of Object.entries(LOGOS)) {
      if (!uri.includes('svg+xml')) continue;
      expect([name, atob(uri.split(',')[1]).includes('prefers-color-scheme')]).toEqual([name, false]);
    }
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
    expect(w.log.find((l) => l.modelCall).modelCall).toMatchObject({ host: 'api.anthropic.com', auth: 'Bearer sk-ant-secret-key-1', model: 'claude-sonnet-5-5', max: 16000 });
    expect(JSON.stringify(e.DB.raw.query('SELECT * FROM sites').all())).not.toContain('sk-ant');
  });

  test('bad choices are refused: unknown AI, missing key, odd model name', () => {
    expect(resolveModel({ ai: 'evil' }).error).toContain('listed');
    expect(resolveModel({ ai: 'anthropic', key: '' }).error).toContain('API key');
    expect(resolveModel({ ai: 'openai', key: 'sk-long-enough-key' }).error).toContain('model name');
    expect(resolveModel({ ai: 'openai', key: 'sk-long-enough-key', model: 'a b;rm' }).error).toContain('model name');
    expect(resolveModel({ ai: 'openrouter', key: 'sk-long-enough-key', model: 'anthropic/claude-sonnet-5-5' })).toMatchObject({ free: false, url: 'https://openrouter.ai/api/v1/chat/completions' });
    expect(resolveModel(undefined)).toEqual({ ai: 'wolf', free: true });
    // The page picks its buttons from the kind, so a missing key or model name must say which it is.
    expect(resolveModel({ ai: 'anthropic', key: '' }).kind).toBe('key');
    expect(resolveModel({ ai: 'openrouter', key: 'sk-long-enough-key' }).kind).toBe('model');
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
test('app page shows history, key management, voice and the video category', () => {
  const page = appPageUi({ login: 'ann', connected: ['upstash'] });
  expect(page).toContain('id="hist"');
  expect(page).toContain('fleet.flisk.si/console?section=providers');
  expect(page).toContain('Voice talk');
  expect(page).toContain('id="voice"');
  expect(page).toContain('id="mic"');
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
  expect(page.replace('<script src="https://flisk.si/assets/bar.js" defer></script>', '').replace('<script defer data-domain="chat.flisk.si" src="https://flisk.sh/a.js"></script>', '').split('</script>').length).toBe(2);
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

test('OpenRouter models are real rows in the model list: name, id, price, free badge; the id field never covers the key', () => {
  const page = appPageUi({ login: 'ann', connected: [] });
  const js = page.slice(page.lastIndexOf('<script>') + 8, page.lastIndexOf('</script>'));
  const line = js.split('\n').find((l) => l.startsWith('const orModel'));
  const orModel = new Function(`${line};return orModel`)();
  expect(orModel('particle-ai/particle-1:free', 'Particle AI: Particle-1 (free)', 0, 32768)).toMatchObject({ id: 'or:particle-ai/particle-1:free', name: 'Particle-1 (free)', model: 'particle-ai/particle-1:free', key: 'openrouter', price: 'free', orFree: true, description: 'particle-ai/particle-1:free · 33K context' });
  expect(orModel('google/gemini-2.5-pro', 'Google: Gemini 2.5 Pro', 1.25, 0).price).toBe('$$');
  expect(page).not.toContain('e.g. particle');
  expect(page).toContain('.bysug{list-style:none;margin:2px 0 0;padding:0;position:static');
});

test('a free-model error never prints an empty model name', () => {
  expect(explainModelError({ error: { code: 404, message: 'x' } }, 200, { free: true, model: '' }).error).toContain('Flisk Wolf');
});

test('API keys are encrypted in the browser, never kept as plain text in localStorage', () => {
  const page = appPageUi({ login: 'ann', connected: [] });
  expect(page).toContain("AES-GCM");
  expect(page).toContain("generateKey({name:'AES-GCM',length:256},false");
  expect(page).toContain("const isSecret=(k)=>k.indexOf('chat_key_')===0");
  expect(page).toContain('Encrypted and saved in this browser only');
  expect(page).not.toContain("localStorage.setItem('chat_key");
});

test('the model box keeps the full OpenRouter list, never sends an empty model, and file notes stay out of the chat', async () => {
  const { appPage } = await import('../src/page.js');
  const page = appPage({ login: 'ann', connected: [], models: [] });
  expect(page).toContain("m.key==='openrouter'&&orIds.length?orIds:");
  expect(page).toContain('fixModel(byoModel.value.trim()).model||byoModel.value.trim()');
  expect(page).not.toContain("Did you mean: '+f.near.join(', ')+'?';byWarn");
  expect(page).not.toContain("errMsg(f.name+' is over 150 KB.')");
});

test('a reopened chat rebuilds the website and video cards from the links in its answer', async () => {
  const { appPage } = await import('../src/page.js');
  const page = appPage({ login: 'ann', connected: [], models: [] });
  expect(page).toContain('function siteCard(link)');
  expect(page).toContain('function videoCard(video)');
  expect(page).toContain('const rl=resultLinks(m.content);if(rl.site)add(siteCard(rl.site));if(rl.video)add(videoCard(rl.video));');
});

test('a task is saved when it is sent, a reopened unfinished chat offers Run it again, and leaving mid-task asks first', async () => {
  const { appPage } = await import('../src/page.js');
  const page = appPage({ login: 'ann', connected: [], models: [] });
  expect(page).toContain("history.push({role:'user',content:task});saveChat();run(task);");
  expect(page).toContain("history.push({role:'user',content:full});saveChat();run(full);");
  expect(page).toContain('Run it again');
  expect(page).toContain("addEventListener('beforeunload'");
});

test('the Fleet menu and the voice buttons sit inside the composer toolbar row (balanced divs)', async () => {
  const { appPage } = await import('../src/page.js');
  const html = appPage({ login: 'ann', connected: [], models: [] });
  const from = html.indexOf('<div class="bar">');
  expect(from).toBeGreaterThan(0);
  const depthAt = (marker) => {
    const end = html.indexOf(marker, from);
    expect(end).toBeGreaterThan(from);
    let depth = 0;
    for (const m of html.slice(from, end).matchAll(/<div\b|<\/div>/g)) depth += m[0] === '</div>' ? -1 : 1;
    return depth;
  };
  // Depth 2 = inside the + menu, which sits in .bar. A stray </div> in the model popover would drop these out of the row.
  expect(depthAt('<details class="pick"')).toBe(2);
  expect(depthAt('id="mic"')).toBe(1);
  expect(depthAt('id="orbbtn"')).toBe(2);
});

describe('attached pictures', () => {
  const computer = { start: async () => ({ data: { id: 'p', provider: 'x' } }), write: async () => ({ status: 200, data: {} }), run: async () => ({ data: { exitCode: 0, stdout: '', stderr: '' } }), stop: async () => ({ status: 200 }) };
  const pic = cleanFiles([{ name: 'demo.jpg', type: 'image/jpeg', b64: true, content: 'AAAA' }]);
  test('cleanFiles keeps the picture type only for real image types', () => {
    expect(pic[0].image).toBe('image/jpeg');
    expect(cleanFiles([{ name: 'x.svg', type: 'image/svg+xml', b64: true, content: 'AAAA' }])[0].image).toBeUndefined();
  });
  test('a model that sees images gets the picture itself', async () => {
    let first;
    await runTask2({ task: 'what tool is this?', model: async (m) => ((first ??= m.find((x) => x.role === 'user').content), { text: '{"say":"a hammer"}' }), computer, files: pic, vision: true });
    expect(Array.isArray(first)).toBe(true);
    expect(first[1]).toEqual({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } });
  });
  test('a model that cannot see gets text only', async () => {
    let first;
    await runTask2({ task: 'what tool is this?', model: async (m) => ((first ??= m.find((x) => x.role === 'user').content), { text: '{"say":"?"}' }), computer, files: pic, vision: false });
    expect(typeof first).toBe('string');
    expect(first).toContain('demo.jpg');
  });
});

test('a first message with a file attached runs at once instead of asking the build questions', () => {
  const page = appPageUi({ login: 'ann', connected: [] });
  expect(page).toContain('if(!byVoice&&!attached.length&&!history.length&&BUILD.test(task)');
});

test('history remembers an earlier attachment so the model asks for it again', () => {
  const { cleanHistory } = require('../src/loop.js');
  const h = cleanHistory([{ role: 'user', content: 'what word?', files: ['word.jpg'] }, { role: 'assistant', content: 'HAMMER' }]);
  expect(h[0].content).toContain('Attached then: word.jpg');
  expect(h[1].content).toBe('HAMMER');
});

test('chat search looks inside messages and file names, and reopened chats show their files', () => {
  const page = appPageUi({ login: 'ann', connected: [] });
  expect(page).toContain("(c.msgs||[]).some(m=>String(m.content||'').toLowerCase().includes(q)");
  expect(page).toContain("lu.files=sendFiles.map(f=>f.name)");
});

test('the new task is sent to the model once, not again from history', async () => {
  let seen;
  await runTask2({ task: 'hi', history: [{ role: 'user', content: 'old' }, { role: 'assistant', content: 'ok' }, { role: 'user', content: 'hi', files: ['a.jpg'] }], model: async (m) => ((seen ??= m), { text: '{"say":"yo"}' }), computer: {} });
  expect(seen.filter((m) => m.role === 'user').map((m) => m.content)).toEqual(['old', 'hi']);
});

test('on phones the composer row fits: Fleet shows its icon only and keeps a name for screen readers', () => {
  const page = appPageUi({ login: 'ann', connected: [] });
  expect(page).toContain('@media (max-width:520px){.composer{padding:10px 8px 8px 10px}');
  expect(page).toContain('<summary class="chip" title="Computers" aria-label="Computers">');
});

test('files attached before sign-in are kept and sent with the task after it', () => {
  const page = appPageUi({ login: 'ann', connected: [] });
  expect(page).toContain("sessionStorage.setItem('chat_pending_files',JSON.stringify(sendFiles))");
  expect(page).toContain("attached=pf.slice(0,3)");
});

describe('empty model replies', () => {
  test('one empty reply is retried instead of ending the task', async () => {
    const replies = [{ error: 'the model sent an empty answer', kind: 'empty' }, { text: '{"say":"done"}' }];
    const events = [];
    const r = await runTask2({ task: 'x', model: async () => replies.shift(), computer: {}, emit: (e) => events.push(e) });
    expect(r.answer).toBe('done');
    expect(events.some((e) => e.type === 'retry')).toBe(true);
  });
  test('three empty replies in a row stop with the reason', async () => {
    const r = await runTask2({ task: 'x', model: async () => ({ error: 'the model sent an empty answer (it ran out of answer length while thinking)', kind: 'empty' }), computer: {} });
    expect(r.error).toContain('ran out of answer length');
  });
  test('modelFrom explains why the answer was empty', async () => {
    const f = async () => Response.json({ choices: [{ message: { content: '', reasoning: 'hmm' }, finish_reason: 'length' }] });
    const r = await modelFrom2({}, f, { ai: 'openrouter', free: false, url: 'https://x.test', key: 'k'.repeat(10), model: 'a/b' })([{ role: 'user', content: 'hi' }]);
    expect(r.kind).toBe('empty');
    expect(r.error).toContain('while thinking');
  });
});

describe('provider hiccups', () => {
  const computer = { start: async () => ({ data: { id: 'p', provider: 'upstash' } }), run: async () => ({ data: { exitCode: 0, stdout: 'ok', stderr: '' } }), stop: async () => ({ status: 200 }) };
  const down = { error: 'The model provider had a problem (HTTP 500): Internal server error', kind: 'provider' };
  test('an HTTP 500 halfway through a build is retried and the build goes on', async () => {
    const replies = [{ text: '{"run":"echo hi"}' }, down, { text: '{"say":"done"}' }];
    const waits = [];
    const r = await runTask2({ task: 'x', model: async () => replies.shift(), computer, wait: async (ms) => waits.push(ms) });
    expect(r.error).toBeNull();
    expect(r.answer).toBe('done');
    expect(waits).toEqual([3000]);
  });
  test('a provider that keeps failing stops after two retries with its reason', async () => {
    let calls = 0;
    const r = await runTask2({ task: 'x', model: async () => (calls++, down), computer, wait: async () => {} });
    expect(calls).toBe(3);
    expect(r.error).toContain('HTTP 500');
  });
  test('a refused key is not retried', async () => {
    let calls = 0;
    const r = await runTask2({ task: 'x', model: async () => (calls++, { error: 'Your anthropic API key was refused', kind: 'key' }), computer, wait: async () => {} });
    expect(calls).toBe(1);
    expect(r.error).toContain('refused');
  });
});

describe('step budget', () => {
  const computer = { start: async () => ({ data: { id: 'p', provider: 'x' } }), run: async () => ({ data: { exitCode: 0, stdout: 'ok', stderr: '' } }), stop: async () => ({ status: 200 }) };
  test('running out of steps never shows the raw action JSON as the answer', async () => {
    const r = await runTask2({ task: 'x', model: async () => ({ text: '{"run":"echo hi"}' }), computer, maxSteps: 3 });
    expect(r.answer).toContain('ran out of steps (3)');
    expect(r.answer).not.toContain('"run"');
  });
  test('the system prompt states the real step budget', async () => {
    let sys;
    await runTask2({ task: 'x', model: async (m) => ((sys ??= m[0].content), { text: '{"say":"ok"}' }), computer, maxSteps: 16 });
    expect(sys).toContain('After at most 15 actions');
  });
});

test('localhost links in an answer get a note that the computer has stopped', async () => {
  const { noteDeadLinks } = await import('../src/loop.js');
  expect(noteDeadLinks('Open http://localhost:4000', true)).toContain('has stopped now');
  expect(noteDeadLinks('Open http://localhost:4000', false)).toBe('Open http://localhost:4000');
  expect(noteDeadLinks('Your page: https://chat.flisk.si/s/abc', true)).toBe('Your page: https://chat.flisk.si/s/abc');
  const computer = { start: async () => ({ data: { id: 'p', provider: 'x' } }), run: async () => ({ data: { exitCode: 0, stdout: '', stderr: '' } }), stop: async () => ({ status: 200 }) };
  const replies = ['{"run":"echo"}', '{"say":"Storefront: http://localhost:5173"}'];
  const r = await runTask2({ task: 'x', model: async () => ({ text: replies.shift() }), computer });
  expect(r.answer).toContain('will not open for you');
});

describe('search visibility', () => {
  test('the home page can be indexed, published sites and the API cannot', async () => {
    const e = env();
    const home = await (await handle(new Request(`${ORIGIN}/`), e, {})).text();
    expect(home).toContain('content="index,follow"');
    expect(home).not.toContain('content="noindex"');
    const robots = await (await handle(new Request(`${ORIGIN}/robots.txt`), e, {})).text();
    expect(robots).toContain('Allow: /$');
    expect(robots).toContain('Disallow: /s/');
    expect(robots).toContain('Sitemap:');
    const map = await handle(new Request(`${ORIGIN}/sitemap.xml`), e, {});
    expect(map.status).toBe(200);
    expect(await map.text()).toContain('<loc>https://chat.flisk.si/</loc>');
  });
});

// Every Flisk site shows the shared Flisk bar at the top; the page loads it and the CSP lets its script and icons through.
test('pages load the shared Flisk bar and the CSP allows it', async () => {
  const res = await handle(new Request(`${ORIGIN}/`), env());
  const html = await res.text();
  expect(html).toContain('<script src="https://flisk.si/assets/bar.js" defer></script>');
  const csp = res.headers.get('content-security-policy');
  expect(csp).toMatch(/script-src [^;]*https:\/\/flisk\.si/);
  expect(csp).toMatch(/img-src [^;]*https:\/\/flisk\.si/);
});

// Flisk Analytics: the script sits in <head>, and the CSP lets it load and lets its beacon reach the analytics app.
test('pages load Flisk Analytics and the CSP allows its script and beacon', async () => {
  const res = await handle(new Request(`${ORIGIN}/`), env());
  const html = await res.text();
  const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
  expect(head).toContain('<script defer data-domain="chat.flisk.si" src="https://flisk.sh/a.js"></script>');
  const csp = res.headers.get('content-security-policy');
  expect(csp).toMatch(/script-src [^;]*https:\/\/flisk\.sh/);
  expect(csp).toMatch(/connect-src [^;]*https:\/\/analytics\.flisk\.si/);
});

describe('the bar on a published page', () => {
  test('leaves room under the page and reports to this repo', async () => {
    const e = env();
    for (const html of ['<html><body><footer>last line</footer></body></html>', '<html><footer>no body tag</footer></html>']) {
      const made = await publishSite(e, 'octo', html, ORIGIN);
      const text = await (await handle(new Request(made.url), e, {})).text();
      expect(text).toContain('body{padding-bottom:40px!important}');
      expect(text.indexOf('padding-bottom:40px')).toBeLessThan(text.indexOf('Made with Flisk Chat'));
      expect(text).toContain('https://github.com/flisk-sh/chat/issues/new');
      expect(text).not.toContain('flisk-sh/fleet');
      expect(text).toContain(html.includes('last') ? 'last line' : 'no body tag');
    }
  });
});

describe('a published page can save to localStorage inside the sandbox', () => {
  // The sandbox has no allow-same-origin, so the browser throws on localStorage; a throwing save killed every click handler.
  const run = (html, win) => {
    const shim = /<script>([\s\S]*?)<\/script>/.exec(withStorageShim(html))[1];
    new Function('window', shim)(win);
    return win;
  };
  const blocked = () => {
    const win = { name: '' };
    Object.defineProperty(win, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
    Object.defineProperty(win, 'sessionStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
    return win;
  };

  test('the shim comes before the page scripts and keeps the doctype first', () => {
    const out = withStorageShim('<!DOCTYPE html><html><head><title>x</title></head><body><header>h</header><script>var a=1</script></body></html>');
    expect(out.startsWith('<!DOCTYPE html><html><head><script>')).toBe(true);
    expect(out.indexOf('flisk-site-storage')).toBeLessThan(out.indexOf('var a=1'));
    expect(withStorageShim('<!doctype html><p>no head</p>')).toMatch(/^<!doctype html><script>/);
    expect(withStorageShim('<p>bare</p>')).toMatch(/^<script>.*<\/script><p>bare<\/p>$/s);
  });

  test('with blocked storage, set/get/remove/clear/key/length work and survive a reload through window.name', () => {
    const win = run('<html><head></head></html>', blocked());
    win.localStorage.setItem('crm', '{"a":1}');
    win.localStorage.setItem('n', 5);
    expect(win.localStorage.getItem('crm')).toBe('{"a":1}');
    expect(win.localStorage.getItem('n')).toBe('5');
    expect(win.localStorage.getItem('missing')).toBeNull();
    expect(win.localStorage.length).toBe(2);
    expect(win.localStorage.key(0)).toBe('crm');
    expect(win.localStorage.key(9)).toBeNull();
    win.sessionStorage.setItem('s', '1');
    expect(win.localStorage.getItem('s')).toBeNull();
    const reloaded = run('<html><head></head></html>', Object.assign(blocked(), { name: win.name }));
    expect(reloaded.localStorage.getItem('crm')).toBe('{"a":1}');
    expect(reloaded.sessionStorage.getItem('s')).toBe('1');
    reloaded.localStorage.removeItem('crm');
    expect(reloaded.localStorage.getItem('crm')).toBeNull();
    reloaded.localStorage.clear();
    expect(reloaded.localStorage.length).toBe(0);
  });

  test('another page in the same tab starts empty', () => {
    const a = run('<html></html>', Object.assign(blocked(), { location: { pathname: '/s/aaaa' } }));
    a.localStorage.setItem('pop-crm-v1', 'A');
    const b = run('<html></html>', Object.assign(blocked(), { name: a.name, location: { pathname: '/s/bbbb' } }));
    expect(b.localStorage.getItem('pop-crm-v1')).toBeNull();
    const again = run('<html></html>', Object.assign(blocked(), { name: a.name, location: { pathname: '/s/aaaa' } }));
    expect(again.localStorage.getItem('pop-crm-v1')).toBe('A');
  });

  test('where real storage works the shim leaves it alone', () => {
    const real = { getItem() {} };
    const win = { name: '', localStorage: real, sessionStorage: real };
    run('<html></html>', win);
    expect(win.localStorage).toBe(real);
    expect(win.name).toBe('');
  });

  test('the served page carries the shim and a one-line bar that lets taps through', async () => {
    const e = env();
    const made = await publishSite(e, 'octo', '<html><head></head><body><script>localStorage.setItem("k","v")</script></body></html>', ORIGIN);
    const text = await (await handle(new Request(made.url), e, {})).text();
    expect(text.indexOf('flisk-site-storage')).toBeLessThan(text.indexOf('localStorage.setItem("k"'));
    const bar = text.slice(text.indexOf('Made with Flisk Chat') - 400);
    expect(bar).toContain('pointer-events:none');
    expect(bar).toContain('white-space:nowrap');
    expect(bar).toMatch(/<a [^>]*pointer-events:auto[^>]*>report<\/a>/);
  });
});

describe('the model knows its own name', () => {
  const sysOf = async (modelName) => {
    let sys;
    await runTask({ task: 'which model are you', model: async (m) => ((sys = m[0].content), { text: '{"say":"x"}' }), computer: {}, modelName });
    return sys;
  };
  test('the prompt names the picked model, and says nothing when there is no name', async () => {
    expect(await sysOf(modelLabel(resolveModel({ ai: 'anthropic', key: 'sk-ant-12345678', model: 'claude-sonnet-5-5' })))).toContain('The AI model behind you is claude-sonnet-5-5');
    expect(await sysOf(modelLabel(resolveModel(undefined)))).toContain('Flisk Wolf');
    expect(await sysOf('')).not.toContain('The AI model behind you');
  });
});

describe('a build ends with a public link', () => {
  const fakeComputer = () => ({
    start: async () => ({ data: { id: 'p1', provider: 'upstash' } }),
    stop: async () => ({ status: 200 }),
    run: async () => ({ data: { exitCode: 0, stdout: 'ok', stderr: '' } }),
    write: async () => ({ data: {} }),
    read: async () => ({ data: { encoding: 'utf8', content: '<html>crm</html>' } }),
  });
  const script = (replies) => {
    const seen = [];
    return { seen, model: async (m) => (seen.push(m[m.length - 1].content), { text: replies.shift() }) };
  };

  test('the recipe shares the running app, and an app is never a published copy', () => {
    expect(SYSTEM).toContain('{"share": <the website\'s port from that log>}');
    expect(SYSTEM).toContain("fetch('/api/...')");
    expect(SYSTEM).toContain('do NOT make a copy of the app');
    expect(SYSTEM).toContain('is an app, never a published page');
    expect(SYSTEM).not.toMatch(/data kept in localStorage|one-file clickable copy|Only if share answers/);
    expect(SYSTEM).toContain('Each task starts on a fresh computer');
  });

  test('saying the app works without a link sends the model back to share, and a published copy is refused', async () => {
    const published = [];
    const { seen, model } = script(['{"run":"(nohup flisk up > /tmp/up.log 2>&1 &); sleep 5"}', '{"say":"It works on localhost:3000"}', '{"write":{"path":"/tmp/s/index.html","content":"<html></html>"}}', '{"publish":"/tmp/s/index.html"}', '{"say":"done"}']);
    const r = await runTask2({ task: 'build crm via flisk', model, computer: fakeComputer(), publish: async (h) => (published.push(h), { url: 'https://chat.flisk.si/s/abc' }), maxSteps: 8 });
    const nudge = seen.find((m) => m.startsWith('No public link yet'));
    expect(nudge).toContain('{"share": <the website port>}');
    expect(nudge).not.toMatch(/localStorage|publish/);
    expect(seen.some((m) => m.includes('do not publish a copy of it'))).toBe(true);
    expect(published).toEqual([]);
    expect(r.links).toEqual([]);
  });

  test('it asks only once, and never when a link is already published', async () => {
    const stubborn = script(['{"run":"nohup node s.js &"}', '{"say":"done"}', '{"say":"still done"}']);
    const a = await runTask2({ task: 'x', model: stubborn.model, computer: fakeComputer(), publish: async () => ({}), maxSteps: 8 });
    expect(a.answer).toContain('still done');
    expect(stubborn.seen.filter((m) => m.startsWith('No public link yet'))).toHaveLength(1);
    const ok = script(['{"run":"nohup node s.js &"}', '{"publish":"/tmp/s/index.html"}', '{"say":"https://chat.flisk.si/s/abc"}']);
    await runTask2({ task: 'x', model: ok.model, computer: fakeComputer(), publish: async () => ({ url: 'https://chat.flisk.si/s/abc' }), maxSteps: 8 });
    expect(ok.seen.some((m) => m.startsWith('No public link yet'))).toBe(false);
  });

  test('after a bigger app is built, a stub written over its page is refused so the live link is not blank', async () => {
    const writes = [];
    const computer = {
      ...fakeComputer(),
      write: async (_id, path, content) => (writes.push([path, content.length]), { data: {} }),
      run: async (_id, cmd) => ({
        data: {
          exitCode: 0,
          stdout: cmd.includes('ports api=') || cmd.includes('flisk create') ? 'ports api=4000 web=3000' : cmd.includes('healthy=') || cmd.includes('healthy') ? 'healthy=1/1 web=200' : 'contacts add=201 read=1 delete=200\nsummary=200',
          stderr: '',
        },
      }),
    };
    const sys = '{"system":{"title":"CRM","services":[{"name":"contacts"},{"name":"deals"},{"name":"tasks"}]}}';
    const { seen, model } = script([sys, '{"write":{"path":"~/app/web/index.html","content":"<html>...</html>"}}', '{"say":"done"}']);
    await runTask2({ task: 'build a bigger CRM', model, computer, publish: async () => ({}), maxSteps: 8 });
    expect(seen.some((m) => m.includes('would blank the website'))).toBe(true);
    // the only writes to the page are the generated one
    expect(writes.filter(([p, n]) => p === '~/app/web/index.html' && n < 1500)).toEqual([]);
  });

  test('a bigger app tells the model its first action is the system action; a calculator does not', async () => {
    const sysPrompts = [];
    const spy = async (m) => (sysPrompts.push(m[0].content), { text: '{"say":"ok"}' });
    await runTask2({ task: 'build a bigger CRM with flisk', model: spy, computer: fakeComputer(), publish: async () => ({}), maxSteps: 4 });
    await runTask2({ task: 'what is 2+2', model: spy, computer: fakeComputer(), publish: async () => ({}), maxSteps: 4 });
    expect(sysPrompts[0]).toContain('your FIRST action must be the "system" action');
    expect(sysPrompts[1]).not.toContain('your FIRST action must be the "system" action');
  });

  test('a task that never started a server is not asked for a link', async () => {
    const calc = script(['{"run":"echo 4"}', '{"say":"4"}']);
    const r = await runTask2({ task: '2+2', model: calc.model, computer: fakeComputer(), publish: async () => ({}), maxSteps: 8 });
    expect(r.answer).toBe('4');
    expect(calc.seen.some((m) => m.startsWith('No public link yet'))).toBe(false);
  });
});

// The composer shows only + and Send; the rest opens from +.
describe('composer plus', () => {
  test('a + button opens a small menu with the model, computers, voice, attach and the start chips', async () => {
    const html = await (await handle(new Request(`${ORIGIN}/`), env())).text();
    expect(html).toContain('id="plus"');
    expect(html).toContain('html:not(.plus) .plusmenu');
    expect(html).toContain('id="plusmenu"');
    expect(html).toContain("document.documentElement.classList.toggle('plus',on)");
  });
});

// A new visitor gets the Earth look, kept in a cookie; a saved look is kept; the switch lists all six.
describe('looks', () => {
  const look = (html) => /<html lang="en" data-theme="([a-z]+)"/.exec(html)?.[1];
  test('the look chosen on another Flisk site carries over: link parameter first, then the shared cookie, then a saved chat look', async () => {
    const get = async (url, cookie) => {
      const res = await handle(new Request(`${ORIGIN}${url}`, cookie ? { headers: { cookie } } : {}), env());
      return { look: look(await res.text()), set: res.headers.get('set-cookie') || '' };
    };
    expect((await get('/?flisk_theme=ivory')).look).toBe('ivory');
    expect((await get('/?flisk_theme=cool-glow')).look).toBe('glow');
    expect((await get('/?flisk_theme=graphite')).look).toBe('classic');
    expect((await get('/?flisk_theme=paper-tool')).look).toBe('focus');
    expect((await get('/?flisk_theme=ivory', 'chat_theme=glow')).look).toBe('ivory');
    const shared = await get('/', 'flisk_theme=graphite');
    expect(shared.look).toBe('classic');
    expect(shared.set).toContain('chat_theme=classic');
    expect((await get('/', 'chat_theme=focus; flisk_theme=graphite')).look).toBe('focus');
    expect((await get('/?flisk_theme=%3Cscript%3E')).set).toContain('chat_theme=');
  });
  test('each new look also styles the chat screen: your messages, answers and steps', async () => {
    const html = await (await handle(new Request(`${ORIGIN}/`, { headers: { cookie: 'chat_theme=ivory' } }), env())).text();
    for (const t of ['ivory', 'glow', 'focus', 'voice']) {
      expect(html).toContain(`html[data-theme=${t}] .u{`);
      expect(html).toMatch(new RegExp(`html\\[data-theme=${t}\\] (#talk>\\.a|\\.a|\\.steps)`));
    }
    expect(html).toContain("html[data-theme=voice] .u::before{content:'You'");
  });
  test('a new visitor gets the Earth look and keeps it in a cookie', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await handle(new Request(`${ORIGIN}/`), env());
      const html = await res.text();
      expect(look(html)).toBe('earth');
      expect(html).toContain('<canvas id="earth" class="earthc" aria-hidden="true"></canvas>');
      expect(res.headers.get('set-cookie')).toContain('chat_theme=earth; Path=/; Max-Age=31536000');
    }
    expect(appPageUi({ theme: 'nope' })).toContain('data-theme="earth"');
  });
  test('a saved look is used and not set again', async () => {
    const res = await handle(new Request(`${ORIGIN}/`, { headers: { cookie: 'chat_theme=focus' } }), env());
    const html = await res.text();
    expect(look(html)).toBe('focus');
    expect(html).toContain('<html lang="en" data-theme="focus" class="nt">');
    expect(res.headers.get('set-cookie') || '').not.toContain('chat_theme');
    expect(html).toContain('<option value="focus" selected>Focus</option>');
    for (const label of ['Classic', 'Ivory', 'Soft glow', 'Focus', 'Voice first', 'Earth']) expect(html).toContain(`>${label}</option>`);
  });
  test('the classic look has no extra class, and an unknown look gets a new one', async () => {
    const classic = await (await handle(new Request(`${ORIGIN}/`, { headers: { cookie: 'chat_theme=classic' } }), env())).text();
    expect(classic).toContain('<html lang="en" data-theme="classic">');
    const res = await handle(new Request(`${ORIGIN}/`, { headers: { cookie: 'chat_theme=evil"x' } }), env());
    expect(res.headers.get('set-cookie')).toContain('chat_theme=earth;');
  });
  test('the Earth look draws the globe and the users list, and the CSP lets only three.js and its textures in', async () => {
    const res = await handle(new Request(`${ORIGIN}/`, { headers: { cookie: 'chat_theme=earth' } }), env());
    const html = await res.text();
    expect(html).toContain('<html lang="en" data-theme="earth" class="nt">');
    expect(res.headers.get('set-cookie') || '').not.toContain('chat_theme');
    expect(html).toContain('<canvas id="earth" class="earthc" aria-hidden="true"></canvas>');
    expect(html).toContain('Who uses Flisk Chat');
    expect(html).toContain(`analytics.flisk.si · ${USERS_DATE}`);
    expect(html).toContain('<li><span>United States</span>');
    expect(html).toContain('<span>32.5k</span>');
    expect(html).toContain('Used in 13 countries');
    // Little text up front: ideas, the users list and the fine print sit behind three buttons.
    for (const k of ['ideas', 'users', 'about']) expect(html).toContain(`data-ex="${k}" aria-expanded="false"`);
    expect(html).toContain('<div class="expanel exusers">');
    expect(html).toContain('html[data-theme=earth].home:not(.ex-ideas) #sugg');
    expect(html).toContain('html[data-theme=earth].home:not(.ex-about) .fine');
    expect(html).toContain('html[data-theme=earth]:not(.ex-users) .expanel{display:none}');
    expect(html).toContain(EARTH_JS.trim());
    expect(html).toContain('three.module.min.js');
    expect(html).toContain('family=Inter:wght@300');
    const csp = res.headers.get('content-security-policy');
    expect(csp).toMatch(/script-src [^;]*https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.181\.0\/build\/(;| )/);
    expect(csp).toMatch(/img-src [^;]*https:\/\/cdn\.jsdelivr\.net\/gh\/mrdoob\/three\.js@r181\/examples\/textures\/planets\//);
    expect(csp).toMatch(/img-src [^;]*https:\/\/unpkg\.com\/three-globe@2\.45\.6\/example\//);
    expect(csp).not.toMatch(/script-src [^;]*https:\/\/cdn\.jsdelivr\.net\/?( |;)/);
    expect(csp).not.toContain('unsafe-eval');
  });
  test('the globe script runs on its own: it has the user list and the three.js address built in', () => {
    expect(EARTH_JS).not.toContain('</script');
    const m = /\}\)\((\[\[.*?\]\]),"([^"]+)"/.exec(EARTH_JS);
    expect(JSON.parse(m[1])).toEqual(USERS);
    expect(m[2]).toBe(THREE_SRC);
    expect(() => new Function(EARTH_JS)).not.toThrow();
    // Wrangler bundles with keepNames, which writes __name(fn, "x") calls into earthClient's text.
    // The live page threw "__name is not defined" (Nov 14); the snippet must bring its own.
    const named = EARTH_JS.replace(/function earthClient\(([^)]*)\)\s*\{/, (s) => `${s}__name(function(){}, "x");`);
    expect(named).not.toBe(EARTH_JS);
    const added = [];
    const doc = { documentElement: { dataset: {}, classList: { contains: () => false } }, getElementById: () => null, addEventListener: (t) => added.push(t) };
    expect(() => new Function('document', named)(doc)).not.toThrow();
    expect(added).toContain('click');
    expect(shortCount(32540)).toBe('32.5k');
    expect(shortCount(5620)).toBe('5.62k');
    expect(shortCount(2080)).toBe('2.08k');
    expect(shortCount(1900)).toBe('1.9k');
    expect(shortCount(802)).toBe('802');
  });
  test('the users list is hidden in every other look', async () => {
    const html = await (await handle(new Request(`${ORIGIN}/`, { headers: { cookie: 'chat_theme=ivory' } }), env())).text();
    expect(html).toContain('.earthc{display:none}.ex{display:none}');
    expect(html).toContain('html[data-theme=earth] .welcome .ex{display:block');
  });
  test('every look keeps every feature on the page', async () => {
    const html = await (await handle(new Request(`${ORIGIN}/`, { headers: { cookie: 'chat_theme=voice' } }), env())).text();
    for (const id of ['newchat', 'q', 'hist', 'attach', 'mpbtn', 'mic', 'voice', 'orbbtn', 'go', 'vorb', 'slot', 'look']) expect(html).toContain(`id="${id}"`);
    expect(html).toContain('Try saying');
    expect(html).toContain('data-act="voice"');
  });
});

test('the composer has a Chat / Build / Create switch next to the model picker, outside the + menu', async () => {
  const { appPage } = await import('../src/page.js');
  const h = appPage ? String(appPage({})) : '';
  expect(h).toContain('class="modes"');
  for (const m of ['chat', 'build', 'create']) expect(h).toContain('data-mode="' + m + '"');
  expect(h.indexOf('class="modes"')).toBeGreaterThan(h.indexOf('id="plusmenu"') + h.slice(h.indexOf('id="plusmenu"')).indexOf('</div>'));
  expect(h).toContain("setMode(m0)");
});

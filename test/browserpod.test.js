// A task on the computer in the visitor's own browser: chat thinks, the page (here a stand-in) answers the computer calls.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { cspWithPod, handle, podBase } from '../src/index.js';
import { BROWSER_NOTE, browserComputer, runOverSocket } from '../src/browserpod.js';
import { appPage } from '../src/page.js';
import { makeSession } from '../src/session.js';
import { fakeD1 } from './d1.js';

const SCHEMA = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const ORIGIN = 'https://chat.test';
const env = (extra = {}) => ({ DB: fakeD1(SCHEMA), PUBLIC_ORIGIN: ORIGIN, SESSION_SECRET: 's', FLEET_URL: 'https://fleet.test', FLEET_SERVICE_SECRET: 'x'.repeat(40), INFERENCE_KEY: 'ik', INFERENCE_URL: 'https://inf.test/v1/chat/completions', ...extra });
const tick = () => new Promise((r) => setTimeout(r, 0));

// The Worker's end of the socket. page(event, socket) plays the browser tab: it sees what chat sends.
function fakeSocket(page = () => {}) {
  const on = { message: [], close: [], error: [] };
  const s = {
    sent: [],
    closed: false,
    addEventListener: (name, fn) => on[name].push(fn),
    send(text) {
      if (s.closed) throw new Error('closed');
      const e = JSON.parse(text);
      s.sent.push(e);
      setTimeout(() => page(e, s), 0);
    },
    close() {
      s.closed = true;
    },
    say: (msg) => on.message.forEach((fn) => fn({ data: JSON.stringify(msg) })),
    drop: () => on.close.forEach((fn) => fn({})),
  };
  return s;
}
// A tab with a tiny file store instead of a Linux.
function tab() {
  const files = {};
  const calls = [];
  const page = (e, s) => {
    if (e.type !== 'pod_call') return;
    calls.push(e.op);
    const data = e.op === 'start' ? { id: 'browser', provider: 'your browser' } : e.op === 'run' ? { stdout: `ran:${e.command}\n`, stderr: '', exitCode: 0 } : e.op === 'write' ? ((files[e.path] = e.content), {}) : e.op === 'read' ? (e.path in files ? { content: files[e.path], encoding: 'utf8' } : null) : {};
    s.say(data ? { type: 'pod_reply', id: e.id, data } : { type: 'pod_reply', id: e.id, error: 'no such file' });
  };
  return { page, files, calls };
}
const scripted = (replies) => async () => ({ text: replies.shift() ?? '{"say":"out of script"}' });

describe('browser computer', () => {
  test('each call goes to the page and its answer comes back in the fleet shape', async () => {
    const sent = [];
    const pod = browserComputer((e) => sent.push(e));
    const started = pod.computer.start();
    const ran = pod.computer.run('browser', 'ls');
    expect(sent).toEqual([{ type: 'pod_call', id: 1, op: 'start' }, { type: 'pod_call', id: 2, op: 'run', command: 'ls' }]);
    pod.reply({ id: 2, data: { stdout: 'a\n', stderr: '', exitCode: 0 } });
    pod.reply({ id: 1, data: { id: 'browser', provider: 'your browser' } });
    pod.reply({ id: 1, data: { id: 'twice' } });
    expect(await started).toEqual({ status: 200, data: { id: 'browser', provider: 'your browser' }, error: null });
    expect((await ran).data.stdout).toBe('a\n');
  });

  test('an error from the page, no answer in time, and a closed tab are errors, never a hang', async () => {
    const pod = browserComputer(() => {}, { wait: () => Promise.resolve() });
    expect((await pod.computer.read('browser', 'x')).error).toMatch(/did not answer in time/);
    const slow = browserComputer(() => {}, { wait: () => new Promise(() => {}) });
    const read = slow.computer.read('browser', 'nope');
    slow.reply({ id: 1, error: 'no such file: nope' });
    expect(await read).toEqual({ status: 500, data: {}, error: 'no such file: nope' });
    const open = slow.computer.run('browser', 'sleep 9');
    slow.close();
    expect((await open).error).toBe('the browser tab closed');
    expect((await slow.computer.run('browser', 'ls')).status).toBe(410);
  });

  test('a public link for a port is refused in plain words', async () => {
    const r = await browserComputer(() => {}).computer.share('browser', 3000);
    expect(r.status).toBe(400);
    expect(r.error).toContain('Connect a cloud computer');
  });
});

describe('a task over the socket', () => {
  test('"make a coffee website": written in the tab, published by chat, answered, computer stopped', async () => {
    const t = tab();
    const s = fakeSocket(t.page);
    const published = [];
    const seen = [];
    const model = scripted(['{"write":{"path":"site/index.html","content":"<h1>Moon Roast</h1>"}}', '{"publish":"site/index.html"}', '{"say":"Your coffee site is live."}']);
    const gate = async () => ({ model: (m) => (seen.push(m), model()), maxSteps: 8, modelName: 'Flisk Wolf', vision: false });
    const job = runOverSocket(s, { gate, origin: ORIGIN, publish: async (html) => (published.push(html), { url: `${ORIGIN}/s/abc` }) });
    s.say({ type: 'task', task: 'make website coffee', history: [], files: [] });
    await job;
    expect(t.calls).toEqual(['start', 'write', 'read', 'stop']);
    expect(t.files['site/index.html']).toBe('<h1>Moon Roast</h1>');
    expect(published).toEqual(['<h1>Moon Roast</h1>']);
    const types = s.sent.map((e) => e.type);
    expect(types).toContain('pod_started');
    expect(s.sent.find((e) => e.type === 'pod_started').provider).toBe('your browser');
    expect(s.sent.find((e) => e.type === 'output' && e.published).published).toBe(`${ORIGIN}/s/abc`);
    expect(s.sent.find((e) => e.type === 'answer').text).toBe('Your coffee site is live.');
    expect(types[types.length - 1]).toBe('done');
    expect(s.closed).toBe(true);
    // The model is told what this computer cannot do.
    expect(seen[0][0].content).toContain(BROWSER_NOTE.trim());
    expect(BROWSER_NOTE).toMatch(/NO internet/);
  });

  test('settle runs once after the task, and not for a refused one', async () => {
    const t = tab();
    const s = fakeSocket(t.page);
    let settled = 0;
    const gate = async () => ({ model: async () => ({ error: 'The free AI is busy right now.', kind: 'busy' }), settle: async () => settled++, maxSteps: 8 });
    const job = runOverSocket(s, { gate, origin: ORIGIN, publish: async () => ({ error: 'no' }) });
    s.say({ type: 'task', task: 'make website coffee', history: [], files: [] });
    await job;
    expect(settled).toBe(1);
    const r = fakeSocket(tab().page);
    let refusedSettle = 0;
    const refused = runOverSocket(r, { gate: async () => ({ refuse: { status: 429, error: 'x' }, settle: async () => refusedSettle++ }), origin: ORIGIN });
    r.say({ type: 'task', task: 'x' });
    await refused;
    expect(refusedSettle).toBe(0);
  });

  test('a refused task says why and runs nothing', async () => {
    for (const [first, refuse, want] of [
      [{ type: 'task', task: '  ' }, null, { status: 400, error: 'type a task' }],
      [{ type: 'task', task: 'x' }, { status: 429, error: 'limit', limit: 10, resetsIn: 5, anon: true }, { status: 429, limit: 10, anon: true }],
    ]) {
      const s = fakeSocket();
      let gated = 0;
      const job = runOverSocket(s, { gate: async () => (gated++, { refuse }), origin: ORIGIN, run: () => { throw new Error('must not run'); } });
      s.say(first);
      await job;
      expect(s.sent).toHaveLength(1);
      expect(s.sent[0]).toMatchObject({ type: 'refused', ...want });
      expect(gated).toBe(refuse ? 1 : 0);
      expect(s.closed).toBe(true);
    }
  });

  test('a tab that closes mid-task stops the task: no more model calls, no hang', async () => {
    let asked = 0;
    const s = fakeSocket((e, sock) => e.type === 'pod_call' && e.op === 'start' && sock.drop());
    const gate = async () => ({ model: async () => (asked++, { text: '{"run":"ls"}' }), maxSteps: 8 });
    const job = runOverSocket(s, { gate, origin: ORIGIN, publish: async () => ({ error: 'no' }) });
    s.say({ type: 'task', task: 'list files' });
    s.say({ type: 'task', task: 'a second task on the same socket is ignored' });
    await job;
    expect(asked).toBe(1);
    expect(s.sent.filter((e) => e.type === 'pod_call').map((e) => e.op)).toEqual(['start']);
  });

  test('garbage on the socket is ignored', async () => {
    const s = fakeSocket();
    const job = runOverSocket(s, { gate: async () => ({ refuse: { status: 400, error: 'x' } }), origin: ORIGIN });
    s.say('not an object');
    s.say({ type: 'pod_reply', id: 99, data: {} });
    await tick();
    expect(s.sent).toEqual([]);
    s.drop();
    await job;
  });
});

describe('GET /api/run as a WebSocket', () => {
  const upgrade = (e, headers, opts = {}) => handle(new Request(`${ORIGIN}/api/run`, { headers: { upgrade: 'websocket', ...headers } }), e, opts);
  const cookieFor = async (e, login = 'octo') => (await makeSession(e, login)).split(';')[0];

  test('needs a session, chat\'s own origin, and the browser computer turned on', async () => {
    const e = env();
    const cookie = await cookieFor(e);
    expect((await upgrade(e, { origin: ORIGIN })).status).toBe(401);
    expect((await upgrade(e, { cookie, origin: 'https://evil.test' })).status).toBe(403);
    expect((await upgrade(e, { cookie })).status).toBe(403);
    expect((await upgrade(env({ BROWSER_POD_URL: '' }), { cookie, origin: ORIGIN })).status).toBe(404);
  });

  test('a signed-in visitor with no cloud computer gets a site made in their tab, with no call to fleet', async () => {
    const e = env();
    const t = tab();
    const s = fakeSocket(t.page);
    const hosts = [];
    const replies = ['{"write":{"path":"index.html","content":"<!doctype html><html><body><h1>Moon Roast</h1></body></html>"}}', '{"publish":"index.html"}', '{"say":"Done."}'];
    const fetchImpl = async (url, init = {}) => {
      hosts.push(new URL(url).host);
      return Response.json({ choices: [{ message: { content: replies.shift() ?? '{"say":"out of script"}' } }] });
    };
    let job;
    const res = await upgrade(e, { cookie: await cookieFor(e), origin: ORIGIN }, { fetchImpl, socketPair: () => [null, s], waitUntil: (p) => (job = p) });
    expect(res.status).toBe(200);
    s.say({ type: 'task', task: 'make website coffee', history: [], files: [], ai: {} });
    await job;
    expect(hosts.every((h) => h === 'inf.test')).toBe(true);
    const link = s.sent.find((x) => x.type === 'output' && x.published)?.published;
    expect(link).toStartWith(`${ORIGIN}/`);
    expect(s.sent.at(-1)).toMatchObject({ type: 'done', error: null });
    // The published page is really there.
    const site = await handle(new Request(link), e, { fetchImpl });
    expect(await site.text()).toContain('Moon Roast');
  });
});

describe('the page', () => {
  test('knows where the browser computer is, and the CSP lets exactly that folder and WebAssembly in', async () => {
    expect(podBase(env())).toBe('https://fleet.test/browserpod/');
    expect(podBase(env({ BROWSER_POD_URL: 'https://x.test/pod' }))).toBe('https://x.test/pod/');
    expect(podBase(env({ BROWSER_POD_URL: '' }))).toBe('');
    const e = env();
    const res = await handle(new Request(`${ORIGIN}/`), e);
    const csp = res.headers.get('content-security-policy');
    expect(csp).toMatch(/script-src [^;]*'wasm-unsafe-eval' https:\/\/fleet\.test\/browserpod\/( |;)/);
    expect(csp).toMatch(/connect-src 'self' wss:\/\/chat\.test https:\/\/fleet\.test\/browserpod\/ /);
    expect(csp).toEndWith('; worker-src blob:');
    expect(csp).not.toContain("'unsafe-eval'");
    expect(await res.text()).toContain('window.__POD__="https://fleet.test/browserpod/";');
    const off = await handle(new Request(`${ORIGIN}/`), env({ BROWSER_POD_URL: '' }));
    expect(off.headers.get('content-security-policy')).toBe(cspWithPod('', ORIGIN));
    expect(off.headers.get('content-security-policy')).not.toContain('wasm');
    expect(await off.text()).toContain('window.__POD__="";');
  });

  test('with no cloud computer the task runs in the tab; the connect wall stays as the fallback', () => {
    const page = appPage({ login: 'ann', connected: [], pod: 'https://fleet.test/browserpod/' });
    expect(page).toContain("await getPod().then(()=>true,()=>false))){const r=await runInBrowser(payload,onEv,ac.signal);");
    expect(page).toContain("import(window.__POD__+'pod.js')");
    expect(page).toContain('I need a computer for that. Connect one of your sandbox accounts below, once.');
    // The inline script still parses.
    const js = page.match(/<script>([\s\S]*?)<\/script>/g).map((x) => x.slice(8, -9));
    for (const code of js) expect(() => new Function(`return async()=>{${code}\n}`)).not.toThrow();
  });
});

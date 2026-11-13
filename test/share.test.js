import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { cleanPods, podTracker } from '../src/index.js';
import { parseAction, runTask } from '../src/loop.js';
import { cleanShare, KEPT_PER_LOGIN, openViteCommand, shareApp, startupCommand } from '../src/share.js';
import { fakeD1 } from './d1.js';

const SCHEMA = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const URL1 = 'https://box_1-3000.preview.box.upstash.com';
const noWait = async () => {};

// A computer whose website answers, and a fleet that can (or cannot) give it a public URL.
function computer({ port = 'port=200', share = { status: 200, data: { url: URL1 } } } = {}) {
  const calls = [];
  return {
    calls,
    start: async () => (calls.push(['start']), { status: 201, data: { id: 'pod_upstash_box_1', provider: 'upstash' } }),
    run: async (id, cmd) => (calls.push(['run', cmd]), { status: 200, data: { exitCode: 0, stdout: cmd.includes('vite.config') ? port : 'ok', stderr: '' } }),
    write: async () => ({ status: 200, data: {} }),
    read: async () => ({ status: 200, data: { encoding: 'utf8', content: '<html>x</html>' } }),
    share: async (id, p, startup) => (calls.push(['share', id, p, startup]), { ...share, error: share.status >= 400 ? share.error || 'no' : null }),
    stop: async (id) => (calls.push(['stop', id]), { status: 200, data: {} }),
  };
}
const site = (status = 200, body = '<!doctype html><title>CRM</title>') => async () => new Response(body, { status });

describe('share: the model asks for a live link to the running app', () => {
  test('a port, or a port and a folder under home; anything else is not a share', () => {
    expect(cleanShare(3000)).toEqual({ port: 3000, dir: '~/app' });
    expect(cleanShare('5173')).toEqual({ port: 5173, dir: '~/app' });
    expect(cleanShare({ port: 3000, dir: '~/crm' })).toEqual({ port: 3000, dir: '~/crm' });
    expect(cleanShare({ port: 3000, dir: '/etc; rm -rf /' })).toEqual({ port: 3000, dir: '~/app' });
    expect(cleanShare({ port: 3000, dir: '~/a"b' })).toEqual({ port: 3000, dir: '~/app' });
    for (const bad of [0, 70000, 'x', null, { dir: '~/app' }, 3000.5]) expect(cleanShare(bad)).toBeNull();
    expect(parseAction('{"share": 3000}')).toEqual({ type: 'share', spec: { port: 3000, dir: '~/app' } });
  });

  test('the computer opens Vite to the public host and restarts the app with flisk up when it wakes', () => {
    expect(openViteCommand('~/app', 3000)).toContain(`sed -i "s/host: 'localhost'/host: true, allowedHosts: true/"`);
    expect(openViteCommand('~/app', 3000)).toContain('http://127.0.0.1:3000/');
    expect(startupCommand('~/app')).toBe('export PATH=$HOME/.local/bin:$PATH; cd "$HOME/app" && (nohup flisk up > /tmp/up.log 2>&1 &)');
  });

  test('a working share answers the public URL after opening it', async () => {
    const c = computer();
    const seen = [];
    const r = await shareApp({ computer: c, podId: 'p', spec: { port: 3000, dir: '~/app' }, fetchImpl: async (u) => (seen.push(String(u)), site()()), wait: noWait });
    expect(r).toEqual({ url: URL1 });
    expect(c.calls.find((x) => x[0] === 'share')).toEqual(['share', 'p', 3000, startupCommand('~/app')]);
    expect(seen).toEqual([URL1]);
  });

  test('errors the model can act on: no folder, nothing on the port, a provider without public URLs, Vite refusing the host', async () => {
    const spec = { port: 3000, dir: '~/app' };
    const noDir = computer();
    noDir.run = async () => ({ status: 200, data: { exitCode: 3, stdout: '' } });
    expect((await shareApp({ computer: noDir, podId: 'p', spec, fetchImpl: site(), wait: noWait })).error).toContain('no folder ~/app');
    expect((await shareApp({ computer: computer({ port: 'port=000\nerror' }), podId: 'p', spec, fetchImpl: site(), wait: noWait })).error).toContain('nothing answers on port 3000');
    const e2b = await shareApp({ computer: computer({ share: { status: 501, error: 'e2b cannot give a pod a public URL through fleet yet' } }), podId: 'p', spec, fetchImpl: site(), wait: noWait });
    expect(e2b.error).toContain('one-file copy');
    const blocked = await shareApp({ computer: computer(), podId: 'p', spec, fetchImpl: site(403, 'Blocked request. This host ("x") is not allowed.'), wait: noWait });
    expect(blocked.error).toContain('does not open the app');
  });
});

describe('a task that shares its app keeps the computer', () => {
  const script = (replies, seen = []) => async (m) => (seen.push(m[m.length - 1].content), { text: replies.shift() });

  test('share, then say: the link is live, the computer is kept and written down, never stopped', async () => {
    const c = computer();
    const events = [];
    const track = { started: [], kept: [], stopped: [] };
    const r = await runTask({
      task: 'build crm via flisk',
      model: script(['{"run":"(nohup flisk up > /tmp/up.log 2>&1 &); sleep 20"}', '{"share": 3000}', `{"say":"Live: ${URL1}"}`]),
      computer: c,
      fetchImpl: site(),
      publish: async () => ({ error: 'not used' }),
      emit: (e) => events.push(e),
      track: { started: (id) => track.started.push(id), kept: (id, url) => track.kept.push([id, url]), stopped: (id) => track.stopped.push(id) },
    });
    expect(r.links).toEqual([URL1]);
    expect(c.calls.some((x) => x[0] === 'stop')).toBe(false);
    expect(events.find((e) => e.type === 'pod_kept')).toMatchObject({ url: URL1, days: 7 });
    expect(events.some((e) => e.type === 'pod_stopped')).toBe(false);
    expect(events.find((e) => e.type === 'output' && e.live)).toBeTruthy();
    expect(track).toEqual({ started: ['pod_upstash_box_1'], kept: [['pod_upstash_box_1', URL1]], stopped: [] });
  });

  test('the model is told the shared link, so it says it instead of making a copy', async () => {
    const seen = [];
    await runTask({ task: 'build crm via flisk', model: script(['{"run":"(nohup flisk up > /tmp/up.log 2>&1 &)"}', '{"share": 3000}', '{"say":"ok"}'], seen), computer: computer(), fetchImpl: site(), publish: async () => ({}), emit: () => {} });
    expect(seen.at(-1)).toStartWith(`Shared. The running app's public link is ${URL1}.`);
    expect(seen.at(-1)).not.toContain('undefined');
  });

  test('a task that does not share stops the computer and crosses it off', async () => {
    const c = computer();
    const stopped = [];
    await runTask({ task: 'x', model: script(['{"run":"ls"}', '{"say":"done"}']), computer: c, publish: async () => ({}), emit: () => {}, track: { stopped: (id) => stopped.push(id) } });
    expect(c.calls.at(-1)).toEqual(['stop', 'pod_upstash_box_1']);
    expect(stopped).toEqual(['pod_upstash_box_1']);
  });
});

describe('kept computers are deleted on time', () => {
  const fleetStub = () => {
    const stopped = [];
    return { stopped, stop: async (id) => (stopped.push(id), { status: 200 }) };
  };

  test(`a login keeps at most ${KEPT_PER_LOGIN} shared apps: the oldest computer is deleted`, async () => {
    const env = { DB: fakeD1(SCHEMA) };
    const fleet = fleetStub();
    const t = podTracker(env, 'octo', fleet);
    for (let i = 1; i <= KEPT_PER_LOGIN + 1; i++) {
      await t.started(`pod_${i}`);
      env.DB.raw.query('UPDATE pods SET created = ? WHERE id = ?').run(new Date(Date.now() - (10 - i) * 60_000).toISOString(), `pod_${i}`);
      await t.kept(`pod_${i}`, `https://u${i}`);
    }
    expect(fleet.stopped).toEqual(['pod_1']);
    expect(env.DB.raw.query('SELECT id FROM pods ORDER BY id').all().map((r) => r.id)).toEqual(['pod_2', 'pod_3', 'pod_4']);
    await t.stopped('pod_4');
    expect(env.DB.raw.query('SELECT COUNT(*) AS n FROM pods').get().n).toBe(2);
  });

  test('the hourly clean deletes computers past their time, on behalf of their owner, and keeps the rest', async () => {
    const env = { DB: fakeD1(SCHEMA), FLEET_URL: 'https://fleet.test', FLEET_SERVICE_SECRET: 's' };
    const t = podTracker(env, 'octo', fleetStub());
    await t.started('pod_old');
    await t.started('pod_new');
    env.DB.raw.query('UPDATE pods SET until = ? WHERE id = ?').run(new Date(Date.now() - 60_000).toISOString(), 'pod_old');
    const calls = [];
    const fetchImpl = async (url, init) => (calls.push([init.method, new URL(url).pathname, init.headers['x-on-behalf-of']]), Response.json({ stopped: true }));
    expect(await cleanPods(env, fetchImpl)).toEqual({ due: 1, stopped: 1 });
    expect(calls).toEqual([['DELETE', '/v1/pods/pod_old', 'octo']]);
    expect(env.DB.raw.query('SELECT id FROM pods').all().map((r) => r.id)).toEqual(['pod_new']);
  });

  test('a computer fleet could not delete stays on the list for the next hour', async () => {
    const env = { DB: fakeD1(SCHEMA), FLEET_URL: 'https://fleet.test', FLEET_SERVICE_SECRET: 's' };
    await podTracker(env, 'octo', fleetStub()).started('pod_x');
    env.DB.raw.query('UPDATE pods SET until = ?').run(new Date(Date.now() - 60_000).toISOString());
    expect(await cleanPods(env, async () => Response.json({ error: 'upstash: down' }, { status: 502 }))).toEqual({ due: 1, stopped: 0 });
    expect(env.DB.raw.query('SELECT COUNT(*) AS n FROM pods').get().n).toBe(1);
  });
});

test('the result card says a shared app is the real app and a /s/ page is the one-file copy', async () => {
  const { appPage } = await import('../src/page.js');
  const page = appPage({ login: 'x' });
  expect(page).toContain('Your app is live: the real website and API');
  expect(page).toContain('Your page is live (one-file copy)');
});

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { alertRun, handle, recordRun, runProblem } from '../src/index.js';
import { runTask } from '../src/loop.js';
import { fakeD1 } from './d1.js';

const SCHEMA = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const scripted = (...texts) => { let i = 0; return async () => ({ text: texts[Math.min(i++, texts.length - 1)] }); };
const pod = { start: async () => ({ status: 201, data: { id: 'p1', provider: 'upstash' } }), stop: async () => ({ status: 200, data: {} }), run: async () => ({ status: 200, data: { exitCode: 1, stdout: '', stderr: 'boom' } }) };

describe('build analytics', () => {
  test('a finished task is counted: bad JSON, errors, first action, a bigger app that skipped "system"', async () => {
    const r = await runTask({ task: 'build me a CRM', model: scripted('{"run": "ls", oops}', '{"run":"ls"}', '{"say":"done"}'), computer: pod });
    expect(r.stats).toMatchObject({ big: true, bad: 1, errors: 1, system: false, shared: false, firstAction: 'run' });
    const DB = fakeD1(SCHEMA);
    await recordRun({ DB }, { task: 'build me a CRM', ai: 'Flisk Wolf', free: true, anon: false, result: r });
    const row = DB.raw.query('SELECT * FROM task_runs').get();
    expect(row).toMatchObject({ who: 'user', big: 1, system: 0, bad_json: 1, errors: 1, steps: 1, first_action: 'run', answer: 'done' });
  });

  test('the admin summary needs the key and never shows a login', async () => {
    const DB = fakeD1(SCHEMA);
    await recordRun({ DB }, { task: 't', ai: 'a', free: true, anon: true, result: { steps: [], links: [], ms: 5, stats: {} } });
    const env = { DB, ADMIN_KEY: 'k' };
    expect((await handle(new Request('https://chat.flisk.si/api/admin/runs'), env)).status).toBe(404);
    const ok = await handle(new Request('https://chat.flisk.si/api/admin/runs', { headers: { authorization: 'Bearer k' } }), env);
    const body = await ok.json();
    expect(ok.status).toBe(200);
    expect(body.totals.tasks).toBe(1);
    expect(body.recent[0].who).toBe('anon');
  });

  test('a failed or weak task goes to the Discord webhook, a good one does not', async () => {
    const sent = [];
    const f = async (url, init) => (sent.push(JSON.parse(init.body)), new Response(null, { status: 204 }));
    const env = { DISCORD_ERRORS_WEBHOOK: 'https://discord.com/api/webhooks/1/x' };
    const base = { steps: [{}], links: [], ms: 4000 };
    expect(runProblem({ ...base, stats: { big: true, system: true, shared: true } })).toBeNull();
    await alertRun(env, { task: 'build me a CRM', ai: 'Wolf', anon: true, result: { ...base, stats: { big: true, system: true, shared: true } } }, f);
    expect(sent.length).toBe(0);
    await alertRun(env, { task: 'build me a CRM', ai: 'Wolf', anon: true, result: { ...base, stats: { big: true, system: false } } }, f);
    await alertRun(env, { task: 'x', ai: 'Wolf', anon: false, result: { ...base, error: 'ran out of steps', stats: {} } }, f);
    expect(sent.length).toBe(2);
    expect(sent[0].content).toContain('did not use the system builder');
    expect(sent[0].allowed_mentions).toEqual({ parse: [] });
    await alertRun({}, { task: 'x', ai: 'a', anon: false, result: { ...base, error: 'e', stats: {} } }, f);
    expect(sent.length).toBe(2);
  });
});

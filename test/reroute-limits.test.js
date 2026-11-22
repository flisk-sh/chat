import { afterAll, beforeEach, expect, test } from 'bun:test';
import { runTask } from '../src/loop.js';
import { modelFrom, resetFallbacks, SUBREQUESTS_USED, wolfRestUntil } from '../src/model.js';

// What traces.flisk.si showed on 2026-11-21: Wolf's daily budget ran out at 21:38 UTC, chat asked it again every 10 minutes
// until midnight, every step showed "resting" and "Wolf is busy" again, and a run that ran out of Cloudflare's 50 calls ended
// on "the free AI is busy".
const WOLF = 'https://inf.test/v1/chat/completions';
const msgs = [{ role: 'user', content: 'hi' }];
const ok = (t) => Response.json({ choices: [{ message: { content: t } }] });
const budgetOut = () => Response.json({ error: { message: "the free beta's shared daily model budget is used up; it resets at 00:00 UTC", code: 429 } }, { status: 429 });
const limited = () => Response.json({ error: { message: 'rate limited', code: 429 } }, { status: 429 });
function world({ wolf = budgetOut, ai = 'workers answer', fetchErr = null } = {}) {
  const calls = [];
  const fetchImpl = async (u) => {
    u = String(u);
    calls.push(u);
    if (fetchErr) throw new Error(fetchErr);
    if (u === WOLF) return wolf();
    return new Response('?', { status: 404 });
  };
  return { calls, fetchImpl, env: { INFERENCE_KEY: 'ik', INFERENCE_URL: WOLF, NO_POLLINATIONS: '1', AI: { run: async () => ({ response: ai }) } } };
}
beforeEach(() => resetFallbacks());
afterAll(() => resetFallbacks());

test('a used-up daily budget rests Wolf until 00:00 UTC, a plain rate limit for 10 minutes', () => {
  const at = Date.UTC(2026, 10, 21, 21, 38);
  expect(wolfRestUntil("the free beta's shared daily model budget is used up; it resets at 00:00 UTC", at)).toBe(Date.UTC(2026, 10, 22));
  expect(wolfRestUntil('rate limited', at)).toBe(at + 10 * 60 * 1000);
});

test('after the daily budget is used up, Wolf is not asked again that evening', async () => {
  let t = Date.UTC(2026, 10, 21, 21, 38);
  const w = world();
  const m = modelFrom(w.env, w.fetchImpl, { ai: 'wolf', free: true }, { now: () => t });
  await m(msgs);
  expect(w.calls.filter((u) => u === WOLF)).toHaveLength(1);
  t += 60 * 60 * 1000; // an hour later: the old 10-minute rest asked Wolf again here
  await m(msgs);
  expect(w.calls.filter((u) => u === WOLF)).toHaveLength(1);
  t = Date.UTC(2026, 10, 22, 0, 1); // the budget is back
  w.env.INFERENCE_URL = WOLF;
  await m(msgs);
  expect(w.calls.filter((u) => u === WOLF)).toHaveLength(2);
});

test('a resting Wolf is told once as resting, never also as "busy"', async () => {
  const w = world({ wolf: limited });
  const m = modelFrom(w.env, w.fetchImpl, { ai: 'wolf', free: true });
  await m(msgs); // starts the rest
  const notes = [];
  const r = await m(msgs, { onReroute: (x) => notes.push(x) });
  expect(r.text).toBe('workers answer');
  expect(notes).toEqual(['Flisk Wolf is resting after a limit, using Mistral Small 3.1 on Cloudflare']);
});

test('out of subrequests: no more backups are tried and the reason is said, not "busy"', async () => {
  const w = world({ fetchErr: 'Too many subrequests by single Worker invocation.' });
  let aiRuns = 0;
  w.env.AI = { run: async () => { aiRuns++; return { response: 'x' }; } };
  const seen = [];
  const r = await modelFrom(w.env, w.fetchImpl, { ai: 'wolf', free: true }, { trace: (e) => seen.push(e) })(msgs);
  expect(r).toEqual({ error: SUBREQUESTS_USED, kind: 'subrequests' });
  expect(aiRuns).toBe(0);
  expect(w.calls).toHaveLength(1);
  expect(seen).toEqual([]); // a trace is one more subrequest, which would fail too
});

test('the same reroute row shows once per run, and running out of calls is not retried as busy', async () => {
  const events = [];
  const waits = [];
  let calls = 0;
  const model = async (_m, o) => {
    calls++;
    o.onReroute('Flisk Wolf is resting after a limit, using Mistral Small 3.1 on Cloudflare');
    if (calls < 3) return { text: '{"widget":{"kind":"web","url":"https://example.com/"}}' };
    return { error: SUBREQUESTS_USED, kind: 'subrequests' };
  };
  const r = await runTask({ task: 'chart it', model, computer: {}, fetchImpl: async () => new Response('<p>hi</p>'), emit: (e) => events.push(e), wait: async (ms) => { waits.push(ms); } });
  expect(r.error).toBe(SUBREQUESTS_USED);
  expect(waits).toEqual([]);
  expect(events.filter((e) => e.type === 'reroute').map((e) => e.text)).toEqual(['Flisk Wolf is resting after a limit, using Mistral Small 3.1 on Cloudflare']);
});

test('the web widget reads 6 pages at most per run, then the model is told to answer', async () => {
  const fetched = [];
  const fetchImpl = async (u) => { fetched.push(String(u)); return new Response('nope', { status: 404 }); };
  const seenAsks = [];
  let n = 0;
  const model = async (messages) => {
    seenAsks.push(messages.at(-1).content);
    n++;
    return { text: n < 9 ? `{"widget":{"kind":"web","url":"https://github.com/guess/repo${n}"}}` : '{"say":"I could not open those pages."}' };
  };
  const r = await runTask({ task: 'read the repo', model, computer: {}, fetchImpl, emit: () => {}, wait: async () => {}, maxSteps: 12 });
  expect(r.error ?? null).toBe(null);
  expect(fetched).toHaveLength(6);
  expect(seenAsks.some((x) => /6 pages read/.test(x))).toBe(true);
});

test('a web read that runs out of subrequests ends the run with the reason', async () => {
  const fetchImpl = async () => { throw new Error('Too many subrequests by single Worker invocation.'); };
  const events = [];
  const model = async () => ({ text: '{"widget":{"kind":"web","url":"https://example.com/"}}' });
  const r = await runTask({ task: 'read example.com', model, computer: {}, fetchImpl, emit: (e) => events.push(e), wait: async () => {} });
  expect(r.error).toBe(SUBREQUESTS_USED);
  expect(events.find((e) => e.type === 'error')).toMatchObject({ kind: 'subrequests' });
});

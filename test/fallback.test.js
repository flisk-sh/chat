import { beforeEach, expect, test } from 'bun:test';
import { FREE_BUSY, freeOpenRouterModels, modelFrom, OPENROUTER_URL, resetFallbacks, WORKERS_AI_FALLBACK } from '../src/loop.js';

const WOLF = 'https://inf.test/v1/chat/completions';
const msgs = [{ role: 'user', content: 'hi' }];
const budgetOut = () => Response.json({ error: { message: "the free beta's shared daily model budget is used up; it resets at 00:00 UTC", code: 429 } }, { status: 429 });
const answer = (t) => Response.json({ choices: [{ message: { content: t } }] });
const catalog = () => Response.json({ data: [{ id: 'google/gemma-4-31b-it:free', context_length: 262144 }, { id: 'nvidia/nemotron-3.5-lightning:free', context_length: 1000000 }, { id: 'paid/model', context_length: 100000 }] });

function world({ wolf = budgetOut, or = {}, ai = null } = {}) {
  const calls = [];
  const fetchImpl = async (u, init) => {
    u = String(u);
    if (u.endsWith('/api/v1/models')) return catalog();
    const body = init?.body ? JSON.parse(init.body) : {};
    calls.push({ url: u, model: body.model, auth: init?.headers?.authorization, referer: init?.headers?.['http-referer'] });
    if (u === WOLF) return wolf();
    if (u === OPENROUTER_URL) return (or[body.model] || (() => Response.json({ error: { message: 'rate limited', code: 429 } }, { status: 429 })))();
    return new Response('?', { status: 404 });
  };
  const aiCalls = [];
  const env = { INFERENCE_KEY: 'ik', INFERENCE_URL: WOLF, OPENROUTER_KEY: 'or-key', AI: ai === false ? undefined : { run: async (m, input) => { aiCalls.push(m); if (ai instanceof Error) throw ai; return { response: ai ?? 'from workers ai' }; } } };
  return { env, fetchImpl, calls, aiCalls };
}

beforeEach(() => resetFallbacks());

test('Wolf answers first when it can', async () => {
  const w = world({ wolf: () => answer('wolf here') });
  expect(await modelFrom(w.env, w.fetchImpl)(msgs)).toEqual({ text: 'wolf here', by: 'wolf' });
  expect(w.calls.map((c) => c.url)).toEqual([WOLF]);
});

test('Wolf out of budget: the first free OpenRouter model answers, with our key and referer, and no error is shown', async () => {
  const w = world({ or: { 'google/gemma-4-31b-it:free': () => answer('gemma here') } });
  const r = await modelFrom(w.env, w.fetchImpl)(msgs);
  expect(r).toEqual({ text: 'gemma here', by: 'google/gemma-4-31b-it:free' });
  const or = w.calls.find((c) => c.url === OPENROUTER_URL);
  expect(or.auth).toBe('Bearer or-key');
  expect(or.referer).toBe('https://chat.flisk.si');
});

test('a rate-limited OpenRouter model is skipped for the next free one', async () => {
  const w = world({ or: { 'nvidia/nemotron-3.5-lightning:free': () => answer('nemotron here') } });
  expect((await modelFrom(w.env, w.fetchImpl)(msgs)).by).toBe('nvidia/nemotron-3.5-lightning:free');
});

test('after a budget answer, Wolf is not asked again for a while', async () => {
  const w = world({ or: { 'google/gemma-4-31b-it:free': () => answer('ok') } });
  const ask = modelFrom(w.env, w.fetchImpl, undefined, { now: () => 1000 });
  await ask(msgs);
  await ask(msgs);
  expect(w.calls.filter((c) => c.url === WOLF).length).toBe(1);
});

test('no OpenRouter key and Wolf out: the Workers AI model answers', async () => {
  const w = world();
  delete w.env.OPENROUTER_KEY;
  expect(await modelFrom(w.env, w.fetchImpl)(msgs)).toEqual({ text: 'from workers ai', by: WORKERS_AI_FALLBACK });
  expect(w.aiCalls).toEqual([WORKERS_AI_FALLBACK]);
});

test('the Workers AI step keeps to its daily cap', async () => {
  const w = world();
  delete w.env.OPENROUTER_KEY;
  const r = await modelFrom(w.env, w.fetchImpl, undefined, { overLimit: async () => true })(msgs);
  expect(r).toEqual({ error: FREE_BUSY, kind: 'busy' });
  expect(w.aiCalls).toEqual([]);
});

test('everything down: one friendly line, never credit, budget or UTC', async () => {
  const w = world({ ai: new Error('neurons used up') });
  const logged = [];
  const r = await modelFrom(w.env, w.fetchImpl, undefined, { log: (t) => logged.push(t) })(msgs);
  expect(r).toEqual({ error: FREE_BUSY, kind: 'busy' });
  expect(r.error).not.toMatch(/credit|budget|UTC|rate/i);
  expect(logged[0].join(' ')).toContain('budget');
});

test('a chosen own key never falls back', async () => {
  const w = world();
  const r = await modelFrom(w.env, w.fetchImpl, { ai: 'openrouter', url: OPENROUTER_URL, model: 'x/y', key: 'mine' })(msgs);
  expect(r.kind).toBe('limit');
  expect(w.aiCalls).toEqual([]);
});

test('the OpenRouter list keeps only live free chat models, ours first', async () => {
  const ids = await freeOpenRouterModels(async () => catalog());
  expect(ids).toEqual(['google/gemma-4-31b-it:free', 'nvidia/nemotron-3.5-lightning:free']);
});

// "Log in with OpenRouter": the person's own key on a free model.
const own = (model = 'google/gemma-4-31b-it:free') => ({ ai: 'openrouter', free: false, url: OPENROUTER_URL, key: 'their-key', model });

test('own OpenRouter free model answers with the person\'s key, not ours', async () => {
  const w = world({ or: { 'google/gemma-4-31b-it:free': () => answer('mine') } });
  expect((await modelFrom(w.env, w.fetchImpl, own())(msgs)).text).toBe('mine');
  expect(w.calls.map((c) => c.auth)).toEqual(['Bearer their-key']);
});

test('own free model busy: another free model is tried with the same key', async () => {
  const w = world({ or: { 'nvidia/nemotron-3.5-lightning:free': () => answer('other') } });
  const r = await modelFrom(w.env, w.fetchImpl, own())(msgs);
  expect(r.by).toBe('nvidia/nemotron-3.5-lightning:free');
  expect(w.calls.every((c) => c.auth === 'Bearer their-key')).toBe(true);
});

test('own free allowance used up: stop at once, no more tries', async () => {
  const w = world({ or: { 'google/gemma-4-31b-it:free': () => Response.json({ error: { message: 'Rate limit exceeded: free-models-per-day', code: 429 } }, { status: 429 }) } });
  const r = await modelFrom(w.env, w.fetchImpl, own())(msgs);
  expect(r.kind).toBe('limit');
  expect(w.calls.length).toBe(1);
});

test('a paid own model never falls back', async () => {
  const w = world();
  const r = await modelFrom(w.env, w.fetchImpl, own('paid/model'))(msgs);
  expect(r.error).toBeTruthy();
  expect(w.calls.length).toBe(1);
});

test('the busy message offers the free OpenRouter way, never budget words', () => {
  expect(FREE_BUSY).toMatch(/OpenRouter/);
  expect(FREE_BUSY).not.toMatch(/credit|budget|UTC|rate/i);
});

test('each person gets only a share of the Workers AI fallback', async () => {
  const { freeModelOpts, WORKERS_AI_PER_PERSON } = await import('../src/index.js');
  const store = new Map();
  const cache = { match: async (u) => (store.has(u) ? new Response(store.get(u)) : undefined), put: async (u, r) => { store.set(u, await r.text()); } };
  const a = freeModelOpts({ LIMIT_CACHE: cache }, 'alice');
  for (let i = 0; i < WORKERS_AI_PER_PERSON; i++) expect(await a.overLimit()).toBe(false);
  expect(await a.overLimit()).toBe(true);
  expect(await freeModelOpts({ LIMIT_CACHE: cache }, 'bob').overLimit()).toBe(false);
});

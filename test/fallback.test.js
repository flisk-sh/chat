import { afterAll, beforeEach, expect, test } from 'bun:test';
import { FREE_BUSY, freeOpenRouterModels, modelFrom, OPENROUTER_URL, POLLINATIONS_TEXT_URL, modelShown, resetFallbacks, WORKERS_AI_FALLBACK } from '../src/model.js';

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
// Wolf's rest is module state: leave it clear for the test files that run after this one.
afterAll(() => resetFallbacks());

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
  expect(ids).toEqual(['nvidia/nemotron-3.5-lightning:free', 'google/gemma-4-31b-it:free']);
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

// Claude 5 refuses `temperature` ("`temperature` is deprecated for this model").
const claude = { ai: 'anthropic', free: false, url: 'https://api.anthropic.com/v1/chat/completions', key: 'sk-ant-test-key', model: 'claude-sonnet-5-5' };
const bodyOf = (init) => JSON.parse(init.body);

test('a Claude key is called without temperature', async () => {
  const sent = [];
  const fetchImpl = async (u, init) => { sent.push(bodyOf(init)); return answer('hi'); };
  const r = await modelFrom({}, fetchImpl, claude)(msgs);
  expect(r.text).toBe('hi');
  expect(sent.length).toBe(1);
  expect('temperature' in sent[0]).toBe(false);
});

test('a refusal that names temperature is retried once without it', async () => {
  const sent = [];
  const fetchImpl = async (u, init) => {
    const b = bodyOf(init); sent.push(b);
    return 'temperature' in b
      ? Response.json({ error: { message: '`temperature` is deprecated for this model.' } }, { status: 400 })
      : answer('ok');
  };
  const r = await modelFrom({}, fetchImpl, { ...claude, ai: 'openrouter', model: 'x/new' })(msgs);
  expect(r.text).toBe('ok');
  expect(sent.map((b) => 'temperature' in b)).toEqual([true, false]);
});

test('a Claude key gets room for thinking plus the answer, and sends max_tokens', async () => {
  let sent;
  await modelFrom({}, async (u, init) => { sent = bodyOf(init); return answer('hi'); }, claude)(msgs);
  expect(sent.max_tokens).toBe(16000);
  expect(sent.model).toBe('claude-sonnet-5-5');
});

test('an OpenAI key is called with max_completion_tokens and no temperature', async () => {
  let sent;
  await modelFrom({}, async (u, init) => { sent = bodyOf(init); return answer('hi'); }, { ...claude, ai: 'openai', model: 'gpt-x' })(msgs);
  expect('max_tokens' in sent).toBe(false);
  expect(sent.max_completion_tokens).toBe(4096);
  expect('temperature' in sent).toBe(false);
});

test('a provider that wants max_completion_tokens is retried once with it', async () => {
  const sent = [];
  const fetchImpl = async (u, init) => {
    const b = bodyOf(init); sent.push(b);
    return 'max_tokens' in b
      ? Response.json({ error: { message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead." } }, { status: 400 })
      : answer('ok');
  };
  const r = await modelFrom({}, fetchImpl, { ...claude, ai: 'openrouter', model: 'x/new' })(msgs);
  expect(r.text).toBe('ok');
  expect(sent.length).toBe(2);
});

test('a refused setting is not reported as "model not available"', async () => {
  const fetchImpl = async () => Response.json({ error: { message: '`temperature` is deprecated for this model.' } }, { status: 400 });
  const r = await modelFrom({}, fetchImpl, { ...claude, ai: 'openrouter', model: 'x/new' })(msgs);
  expect(r.kind).toBe('setting');
  expect(r.error).not.toMatch(/is not available/);
});

test('Workers AI answering in the newer OpenAI-style shape (choices) is read, not taken as an empty answer', async () => {
  const w = world();
  delete w.env.OPENROUTER_KEY;
  w.env.AI = { run: async () => ({ object: 'chat.completion', model: '@cf/meta/llama-3.1-8b-fast-v2', choices: [{ index: 0, message: { role: 'assistant', content: 'from the new shape' } }] }) };
  expect(await modelFrom(w.env, w.fetchImpl)(msgs)).toEqual({ text: 'from the new shape', by: WORKERS_AI_FALLBACK });
});

test('the account out of neurons (Wolf and Workers AI both fail): Pollinations answers with no key', async () => {
  const w = world({ ai: new Error('4006: you have used up your daily free allocation of 10,000 neurons') });
  delete w.env.OPENROUTER_KEY;
  const base = w.fetchImpl;
  w.fetchImpl = async (u, init) => (String(u) === POLLINATIONS_TEXT_URL ? (w.calls.push({ url: String(u) }), answer('pollinations here')) : base(u, init));
  expect(await modelFrom(w.env, w.fetchImpl)(msgs)).toEqual({ text: 'pollinations here', by: 'pollinations' });
  expect(w.calls.map((c) => c.url)).toEqual([WOLF, POLLINATIONS_TEXT_URL]);
});

test('Pollinations can be switched off', async () => {
  const w = world({ ai: new Error('neurons used up') });
  w.env.NO_POLLINATIONS = '1';
  expect(await modelFrom(w.env, w.fetchImpl)(msgs)).toEqual({ error: FREE_BUSY, kind: 'busy' });
  expect(w.calls.some((c) => c.url === POLLINATIONS_TEXT_URL)).toBe(false);
});

test('a Pollinations call that hangs ends with the busy line instead of hanging the chat', async () => {
  const w = world({ ai: new Error('neurons used up') });
  delete w.env.OPENROUTER_KEY;
  const base = w.fetchImpl;
  let signal;
  w.fetchImpl = async (u, init) => (String(u) === POLLINATIONS_TEXT_URL ? ((signal = init.signal), new Promise((_, no) => init.signal.addEventListener('abort', () => no(init.signal.reason)))) : base(u, init));
  expect(await modelFrom(w.env, w.fetchImpl)(msgs)).toEqual({ error: FREE_BUSY, kind: 'busy' });
  expect(signal).toBeInstanceOf(AbortSignal);
}, 30_000);

test('an unreleased OpenAI model tries its likely names, then says it is not released', async () => {
  const { NAME_GUESSES } = await import('../src/model.js');
  const seen = [];
  const fetchImpl = async (_u, init) => { seen.push(JSON.parse(init.body).model); return Response.json({ error: { message: 'The model does not exist', code: 'model_not_found' } }, { status: 404 }); };
  const r = await modelFrom({}, fetchImpl, { ai: 'openai', free: false, url: 'https://api.openai.com/v1/chat/completions', key: 'sk-test-12345', model: 'gpt-6.2-astra' })([{ role: 'user', content: 'hi' }]);
  expect(seen).toEqual(NAME_GUESSES['gpt-6.2-astra']);
  expect(seen.length).toBeGreaterThanOrEqual(3);
  expect(r.kind).toBe('model');
  expect(r.error).toContain('not released yet');
});

test('the first guess that works answers', async () => {
  const fetchImpl = async (_u, init) => JSON.parse(init.body).model === 'gpt-6.2'
    ? Response.json({ choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }], usage: {} })
    : Response.json({ error: { message: 'The model does not exist' } }, { status: 404 });
  const r = await modelFrom({}, fetchImpl, { ai: 'openai', free: false, url: 'https://api.openai.com/v1/chat/completions', key: 'sk-test-12345', model: 'gpt-6.2-astra' })([{ role: 'user', content: 'hi' }]);
  expect(r.error).toBeUndefined();
});

test('an unreleased model sends a trace naming every name tried, and a reroute names the one that answered', async () => {
  const events = [];
  const gone = () => Response.json({ error: { message: 'The model does not exist' } }, { status: 404 });
  const chosen = { ai: 'openai', free: false, url: 'https://api.openai.com/v1/chat/completions', key: 'sk-test-12345', model: 'gpt-6.2-astra' };
  await modelFrom({}, async () => gone(), chosen, { trace: (e) => events.push(e) })([{ role: 'user', content: 'hi' }]);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ kind: 'error', expected: 'gpt-6.2-astra', actual: 'none' });
  expect(events[0].detail).toContain('gpt-6.2-astra-latest');
  expect(JSON.stringify(events)).not.toContain('sk-test');
  events.length = 0;
  const ok = async (_u, init) => JSON.parse(init.body).model === 'gpt-6.2' ? Response.json({ choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }], usage: {} }) : gone();
  await modelFrom({}, ok, chosen, { trace: (e) => events.push(e) })([{ role: 'user', content: 'hi' }]);
  expect(events).toEqual([expect.objectContaining({ kind: 'rerouted', expected: 'gpt-6.2-astra', actual: 'gpt-6.2' })]);
});

test('traces never carry a key, not even the masked one in a provider error', async () => {
  const { redactSecrets, sendTrace } = await import('../src/trace.js');
  expect(redactSecrets('Incorrect API key provided: key_gl8C********hRTv. You can find your API key at https://platform.openai.com/account/api-keys.')).not.toContain('gl8C');
  expect(redactSecrets('bad sk-proj-abcdefghij123456 here')).toBe('bad [key] here');
  expect(redactSecrets('wolf was resting after a limit')).toBe('wolf was resting after a limit');
  let body;
  await sendTrace({ TRACE_KEY: 't' }, { kind: 'error', why: 'refused sk-live-abcdef123456' }, async (_u, init) => { body = init.body; return new Response('ok'); });
  expect(body).not.toContain('abcdef123456');
});

test('an Astra call that OpenAI answers on the first name is traced as unexpected, with the name used', async () => {
  const events = [];
  const ok = async () => Response.json({ choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }], usage: {} });
  const chosen = { ai: 'openai', free: false, url: 'https://api.openai.com/v1/chat/completions', key: 'sk-test-12345', model: 'gpt-6.2-astra' };
  await modelFrom({}, ok, chosen, { trace: (e) => events.push(e) })([{ role: 'user', content: 'hi' }]);
  expect(events).toEqual([expect.objectContaining({ kind: 'unexpected', expected: 'gpt-6.2-astra', actual: 'gpt-6.2-astra' })]);
});

import { withFallbackRules, FALLBACK_RULES } from '../src/model.js';
test('the Workers AI fallback gets length and format rules in its system message', () => {
  const a = withFallbackRules([{ role: 'system', content: 'Be kind.' }, { role: 'user', content: 'hi' }]);
  expect(a[0].content).toBe(`Be kind.\n\n${FALLBACK_RULES}`);
  expect(a.length).toBe(2);
  const b = withFallbackRules([{ role: 'user', content: 'hi' }]);
  expect(b[0]).toEqual({ role: 'system', content: FALLBACK_RULES });
  expect(b[1].content).toBe('hi');
});

test('each switch to a backup is told to the page while it happens', async () => {
  const w = world({ or: { 'google/gemma-4-31b-it:free': () => answer('gemma here') } });
  const notes = [];
  const r = await modelFrom(w.env, w.fetchImpl)(msgs, { onReroute: (t) => notes.push(t) });
  expect(r.text).toBe('gemma here');
  expect(notes).toEqual(['Flisk Wolf is busy, switching to nemotron-3.5-lightning (OpenRouter, free)', 'nemotron-3.5-lightning (OpenRouter, free) is busy, switching to gemma-4-31b-it (OpenRouter, free)']);
  expect(modelShown(r.by)).toBe('gemma-4-31b-it (OpenRouter, free)');
});

test('Wolf answering says nothing about switching, and is not named', async () => {
  const w = world({ wolf: () => answer('wolf here') });
  const notes = [];
  const r = await modelFrom(w.env, w.fetchImpl)(msgs, { onReroute: (t) => notes.push(t) });
  expect(notes).toEqual([]);
  expect(modelShown(r.by)).toBe('');
  expect(modelShown(WORKERS_AI_FALLBACK)).toBe('Mistral Small 3.1 on Cloudflare');
});

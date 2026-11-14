import { expect, test } from 'bun:test';
import { handle } from '../src/index.js';
import { intentOf } from '../src/alexa.js';

const ORIGIN = 'https://chat.test';
const memCache = () => { const m = new Map(); return { match: async (k) => m.get(String(k.url || k))?.clone(), put: async (k, r) => { m.set(String(k.url || k), r); } }; };
const INFERENCE = { fetch: async () => Response.json({ choices: [{ message: { content: 'It is sunny & warm.' } }] }) };
const env = (more = {}) => ({ PUBLIC_ORIGIN: ORIGIN, SESSION_SECRET: 's', LIMIT_CACHE: memCache(), INFERENCE, INFERENCE_KEY: 'ik', INFERENCE_URL: 'https://inf.test/v1/chat/completions', ALEXA_KEY: 'k'.repeat(24), ALEXA_SKILL_ID: 'amzn1.ask.skill.test', ...more });
const req = (request, key = 'k'.repeat(24), at = new Date().toISOString()) => new Request(`${ORIGIN}/alexa?key=${key}`, { method: 'POST', body: JSON.stringify({ session: { application: { applicationId: 'amzn1.ask.skill.test' }, attributes: {} }, request: { timestamp: at, ...request } }) });
const ask = (query, e = env(), key, at) => handle(req({ type: 'IntentRequest', intent: { name: 'AskIntent', slots: { query: { value: query } } } }, key, at), e, { fetchImpl: async () => Response.json({}) });

test('opening the skill greets and keeps the session open', async () => {
  const res = await handle(req({ type: 'LaunchRequest' }), env(), { fetchImpl: async () => Response.json({}) });
  const j = await res.json();
  expect(j.response.shouldEndSession).toBe(false);
  expect(j.response.outputSpeech.ssml).toContain('Flisk Oracle');
});

test('a question is answered in SSML, escaped, and the turn is remembered', async () => {
  const j = await (await ask('what is the weather')).json();
  expect(j.response.outputSpeech.ssml).toBe('<speak>It is sunny &amp; warm.</speak>');
  expect(j.sessionAttributes.history.at(-1)).toEqual({ role: 'assistant', content: 'It is sunny & warm.' });
  expect(j.response.shouldEndSession).toBe(false);
});

test('stop ends the session', async () => {
  const j = await (await handle(req({ type: 'IntentRequest', intent: { name: 'AMAZON.StopIntent' } }), env(), { fetchImpl: async () => Response.json({}) })).json();
  expect(j.response.shouldEndSession).toBe(true);
});

test('wrong key, wrong skill, old request and missing setup are refused', async () => {
  expect((await ask('hi', env(), 'x'.repeat(24))).status).toBe(403);
  expect((await ask('hi', env({ ALEXA_SKILL_ID: 'amzn1.ask.skill.other' }))).status).toBe(403);
  expect((await ask('hi', env(), undefined, new Date(Date.now() - 10 * 60_000).toISOString())).status).toBe(400);
  expect((await ask('hi', env({ ALEXA_KEY: '' }))).status).toBe(503);
});

test('intentOf reads the slot and the stop/help intents', () => {
  expect(intentOf({ request: { type: 'IntentRequest', intent: { name: 'AskIntent', slots: { query: { value: ' hello ' } } } } })).toEqual({ kind: 'ask', query: 'hello' });
  expect(intentOf({ request: { type: 'IntentRequest', intent: { name: 'AMAZON.CancelIntent' } } }).kind).toBe('stop');
  expect(intentOf({ request: { type: 'IntentRequest', intent: { name: 'AMAZON.HelpIntent' } } }).kind).toBe('help');
  expect(intentOf({ request: { type: 'SessionEndedRequest' } }).kind).toBe('end');
});

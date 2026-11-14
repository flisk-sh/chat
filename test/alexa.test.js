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
  expect(j.response.outputSpeech.ssml).toMatch(/^<speak><audio src="https:\/\/chat\.test\/alexa\/voice\?t=[^"]+&amp;s=[0-9a-f]{32}">It is sunny &amp; warm\.<\/audio><\/speak>$/);
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

test('the answer is read by Ava through a signed mp3 URL, with Alexa speaking the text if the file fails', async () => {
  const mp3 = new Uint8Array(900).fill(1);
  const e = env({ SPEAK: async (text, lang) => { expect(text).toBe('It is sunny & warm.'); return new Response(mp3).body; } });
  const j = await (await ask('weather', e)).json();
  const src = j.response.outputSpeech.ssml.match(/src="([^"]+)"/)[1].replace(/&amp;/g, '&');
  const ok = await handle(new Request(src), e, { fetchImpl: async () => Response.json({}) });
  expect(ok.status).toBe(200);
  expect(ok.headers.get('content-type')).toBe('audio/mpeg');
  expect((await ok.arrayBuffer()).byteLength).toBe(900);
  // changed text, wrong signature, and no key are all refused
  expect((await handle(new Request(src.replace(/t=[^&]+/, 't=other')), e, { fetchImpl: async () => Response.json({}) })).status).toBe(403);
  expect((await handle(new Request(src), env({ SPEAK: e.SPEAK, ALEXA_KEY: '' }), { fetchImpl: async () => Response.json({}) })).status).toBe(403);
});

test('a voice that sends no audio gives 502, so Alexa falls back to its own voice', async () => {
  const e = env({ SPEAK: async () => new Response(new Uint8Array(10)).body });
  const j = await (await ask('weather', e)).json();
  const src = j.response.outputSpeech.ssml.match(/src="([^"]+)"/)[1].replace(/&amp;/g, '&');
  expect((await handle(new Request(src), e, { fetchImpl: async () => Response.json({}) })).status).toBe(502);
});

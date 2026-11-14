import { expect, test } from 'bun:test';
import { handle } from '../src/index.js';
import { intentOf } from '../src/alexa.js';

const ORIGIN = 'https://chat.test';
const memCache = () => { const m = new Map(); return { match: async (k) => m.get(String(k.url || k))?.clone(), put: async (k, r) => { m.set(String(k.url || k), r); } }; };
const INFERENCE = { fetch: async () => Response.json({ choices: [{ message: { content: 'It is sunny & warm.' } }] }) };
const env = (more = {}) => ({ PUBLIC_ORIGIN: ORIGIN, SESSION_SECRET: 's', LIMIT_CACHE: memCache(), VOICE_CACHE: memCache(), SPEAK: async () => new Response(new Uint8Array(900).fill(1)).body, INFERENCE, INFERENCE_KEY: 'ik', INFERENCE_URL: 'https://inf.test/v1/chat/completions', ALEXA_KEY: 'k'.repeat(24), ALEXA_AVA: '1', ALEXA_SKILL_ID: 'amzn1.ask.skill.test', ...more });
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

test('a voice that fails or sends no audio leaves the audio tag out, so Alexa reads the text and never meets a bad link', async () => {
  for (const SPEAK of [async () => new Response(new Uint8Array(10)).body, async () => { throw new Error('the voice service took too long'); }]) {
    const j = await (await ask('weather', env({ SPEAK }))).json();
    expect(j.response.outputSpeech.ssml).toBe('<speak>It is sunny &amp; warm.</speak>');
  }
  const src = (await (await ask('weather')).json()).response.outputSpeech.ssml.match(/src="([^"]+)"/)[1].replace(/&amp;/g, '&');
  // a link whose file was never made is a 502 (only reachable by a stale link)
  expect((await handle(new Request(src), env({ SPEAK: async () => new Response(new Uint8Array(10)).body }), { fetchImpl: async () => Response.json({}) })).status).toBe(502);
});

test('the file made while answering is what Alexa fetches next, with no second trip to the voice', async () => {
  let calls = 0;
  const e = env({ SPEAK: async () => { calls++; return new Response(new Uint8Array(900).fill(2)).body; } });
  const src = (await (await ask('weather', e)).json()).response.outputSpeech.ssml.match(/src="([^"]+)"/)[1].replace(/&amp;/g, '&');
  expect(calls).toBe(1);
  const ok = await handle(new Request(src), e, { fetchImpl: async () => Response.json({}) });
  expect(ok.status).toBe(200);
  expect((await ok.arrayBuffer()).byteLength).toBe(900);
  expect(calls).toBe(1);
});

test('Ava is off unless ALEXA_AVA=1, so the speaker keeps one voice', async () => {
  const j = await (await ask('weather', env({ ALEXA_AVA: '' }))).json();
  expect(j.response.outputSpeech.ssml).toBe('<speak>It is sunny &amp; warm.</speak>');
});

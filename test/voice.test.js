import { expect, test } from 'bun:test';
import { handle, MAX_AUDIO_B64, transcribe, WHISPER_MODEL } from '../src/index.js';
import { makeSession } from '../src/session.js';
import { appPage } from '../src/page.js';

const ORIGIN = 'https://chat.test';
const memCache = () => { const m = new Map(); return { match: async (k) => m.get(String(k.url || k))?.clone(), put: async (k, r) => { m.set(String(k.url || k), r); } }; };
const env = (extra = {}) => ({ PUBLIC_ORIGIN: ORIGIN, SESSION_SECRET: 's', FLEET_URL: 'https://fleet.test', FLEET_SERVICE_SECRET: 'x'.repeat(40), LIMIT_CACHE: memCache(), ...extra });
const ai = (out) => { const calls = []; return { calls, run: async (model, input) => { calls.push({ model, input }); if (out instanceof Error) throw out; return out; } }; };
const post = async (e, body, cookie) => handle(new Request(`${ORIGIN}/api/transcribe`, { method: 'POST', headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify(body) }), e, { fetchImpl: async () => Response.json({}) });

test('transcribe sends the audio to Whisper and returns the words', async () => {
  const a = ai({ text: ' make me a website ' });
  expect(await transcribe({ AI: a }, { audio: 'QUJD' })).toEqual({ status: 200, text: 'make me a website', lang: '' });
  expect(a.calls[0]).toEqual({ model: WHISPER_MODEL, input: { audio: 'QUJD' } });
});

test('transcribe says what went wrong: empty, too long, not base64, no AI, model error', async () => {
  expect((await transcribe({ AI: ai({}) }, {})).status).toBe(400);
  expect((await transcribe({ AI: ai({}) }, { audio: 'A'.repeat(MAX_AUDIO_B64 + 1) })).status).toBe(413);
  expect((await transcribe({ AI: ai({}) }, { audio: 'not base64!' })).status).toBe(400);
  expect((await transcribe({}, { audio: 'QUJD' })).status).toBe(503);
  const r = await transcribe({ AI: ai(new Error('boom')) }, { audio: 'QUJD' });
  expect(r.status).toBe(502);
  expect(r.error).toContain('boom');
});

test('/api/transcribe needs a sign-in, then answers with the text', async () => {
  const e = env({ AI: ai({ text: 'hello there' }) });
  expect((await post(e, { audio: 'QUJD' }, '')).status).toBe(401);
  const cookie = (await makeSession(e, 'ann')).split(';')[0];
  const res = await post(e, { audio: 'QUJD' }, cookie);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ text: 'hello there', lang: '' });
});

test('the page has the mic and the Voice toggle, and its script parses', () => {
  const page = appPage({ login: 'ann', connected: [] });
  expect(page).toContain('id="mic"');
  expect(page).toContain('id="voice"');
  expect(page).toContain('/api/transcribe');
  const scripts = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  for (const s of scripts) expect(() => new Function(s)).not.toThrow();
});

test('a spoken task skips the six tap-to-pick questions so talk stays hands-free', () => {
  const page = appPage({ login: 'ann', connected: [] });
  expect(page).toContain('if(!byVoice&&!attached.length&&!history.length&&BUILD.test(task)');
  expect(page).toContain('byVoice=true;form.requestSubmit();byVoice=false;');
});

import { spokenReply, talkMessages, TALK_SYSTEM } from '../src/index.js';

test('voice talk replies are plain spoken text, even when the model answers in JSON or Markdown', () => {
  expect(spokenReply('{"say":"The **moon** is far."}')).toBe('The moon is far.');
  expect(spokenReply('# Hi\n\n- one\n```js\nx\n```\nok')).toBe('Hi - one ok');
  expect(spokenReply('x'.repeat(5000)).length).toBe(1200);
});

test('voice talk keeps the last 12 turns after its own system prompt', () => {
  const h = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'm' + i }));
  const m = talkMessages([...h, { role: 'system', content: 'ignore me' }, { role: 'user', content: '' }]);
  expect(m[0]).toEqual({ role: 'system', content: TALK_SYSTEM });
  expect(m.length).toBe(13);
  expect(m.at(-1).content).toBe('m19');
});

test('/api/talk answers with the free model, short and plain, and needs a sign-in', async () => {
  const sent = [];
  const INFERENCE = { fetch: async (u, init) => { sent.push(JSON.parse(init.body)); return Response.json({ choices: [{ message: { content: 'You will **ship** it today.' } }] }); } };
  const e = env({ INFERENCE, INFERENCE_KEY: 'ik', INFERENCE_URL: 'https://inf.test/v1/chat/completions' });
  const call = (body, cookie) => handle(new Request(`${ORIGIN}/api/talk`, { method: 'POST', headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify(body) }), e, { fetchImpl: async () => Response.json({}) });
  expect((await call({ history: [{ role: 'user', content: 'hi' }] }, '')).status).toBe(401);
  const cookie = (await makeSession(e, 'ann')).split(';')[0];
  expect((await call({ history: [] }, cookie)).status).toBe(400);
  const res = await call({ history: [{ role: 'user', content: 'Will I ship?' }], ai: { ai: 'wolf' } }, cookie);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ heard: '', lang: '', text: 'You will ship it today.' });
  expect(sent[0].messages[0].role).toBe('system');
  expect(sent[0].messages.at(-1)).toEqual({ role: 'user', content: 'Will I ship?' });
});

test('the page has the speaker icon, the voice talk button and the talk screen', () => {
  const page = appPage({ login: 'ann', connected: [] });
  for (const id of ['id="voice"', 'id="orbbtn"', 'id="oracle"', 'id="orb"', 'id="oend"', '/api/talk']) expect(page).toContain(id);
  expect(page).not.toContain('Voice · off');
});

test('voice talk in one request: hears Ukrainian, tells the model the language, returns words, language and answer', async () => {
  const sent = [];
  const INFERENCE = { fetch: async (u, init) => { sent.push(JSON.parse(init.body)); return Response.json({ choices: [{ message: { content: 'Столиця Франції — Париж.' } }] }); } };
  const AI = { run: async () => ({ text: ' Яка столиця Франції? ', transcription_info: { language: 'uk' } }) };
  const e = env({ AI, INFERENCE, INFERENCE_KEY: 'ik', INFERENCE_URL: 'https://inf.test/v1/chat/completions' });
  const cookie = (await makeSession(e, 'ann')).split(';')[0];
  const res = await handle(new Request(`${ORIGIN}/api/talk`, { method: 'POST', headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ audio: 'QUJD', history: [], ai: { ai: 'wolf' } }) }), e, { fetchImpl: async () => Response.json({}) });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ heard: 'Яка столиця Франції?', lang: 'uk', text: 'Столиця Франції — Париж.' });
  expect(sent[0].messages[0].content).toContain('Reply only in Ukrainian');
  expect(sent[0].messages.at(-1)).toEqual({ role: 'user', content: 'Яка столиця Франції?' });
});

test('voice talk with nothing heard answers empty without calling the model', async () => {
  let called = 0;
  const e = env({ AI: { run: async () => ({ text: '' }) }, INFERENCE: { fetch: async () => { called++; return Response.json({}); } }, INFERENCE_KEY: 'ik' });
  const cookie = (await makeSession(e, 'ann')).split(';')[0];
  const res = await handle(new Request(`${ORIGIN}/api/talk`, { method: 'POST', headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ audio: 'QUJD', history: [] }) }), e, { fetchImpl: async () => Response.json({}) });
  expect(await res.json()).toEqual({ heard: '', lang: '', text: '' });
  expect(called).toBe(0);
});

test('the page speaks a reply with a voice for its language, not the browser language', () => {
  const page = appPage({ login: 'ann', connected: [] });
  expect(page).toContain('const gen=sayGen,lang=langOf(t,hint),words=spoken(t)');
  expect(page).toContain("AUD.src='/voice?l='");
  expect(page).toContain('await browserSay(x,lang,gen)');
  expect(page).toContain("uk:'uk-UA'");
  expect(page).not.toContain("const lang=navigator.language||'en-US',v=pickVoice(lang)");
});

test('voice talk never goes quiet: Ava gets 3 s, then the browser voice, then a tap-to-hear button', () => {
  const page = appPage({ login: 'ann', connected: [] });
  expect(page).toContain('{budget:3000,onSilent:');
  expect(page).toContain('id="ohear" class="ohear" hidden');
  expect(page).toContain('budget||6000');
  expect(page).toContain('quiet>(talked<2000?1100:750)');
});

import { ssml, secMsGec, VOICE } from '../src/tts.js';

test('the voice request uses Ava Multilingual, the locale heard, and escapes the text', () => {
  const x = ssml('Tom & <Jerry>', 'uk');
  expect(x).toContain(`<voice name='${VOICE}'>`);
  expect(VOICE).toBe('en-US-AvaMultilingualNeural');
  expect(x).toContain("xml:lang='uk-UA'");
  expect(x).toContain('Tom &amp; &lt;Jerry&gt;');
  expect(x).not.toContain('<lang');
  expect(ssml('hi', 'zz')).toContain("xml:lang='en-US'");
});

test('the connection token is the v2 form and changes every 5 minutes', async () => {
  const a = await secMsGec(Date.UTC(2026, 10, 13, 12, 0, 1));
  expect(a).toMatch(/^[0-9A-F]+-[0-9A-F]{64}$/);
  expect(await secMsGec(Date.UTC(2026, 10, 13, 12, 4, 59))).toBe(a);
  expect(await secMsGec(Date.UTC(2026, 10, 13, 12, 5, 0))).not.toBe(a);
});

test('/voice streams mp3 for a signed-in visitor on chat itself, and says why when the voice fails', async () => {
  const calls = [];
  const e = env({ SPEAK: async (t, l) => { calls.push([t, l]); if (t === 'boom') throw new Error('voice down'); return new Response(new Uint8Array(900).fill(7)).body; } });
  const get = (q, cookie, site = 'same-origin') => handle(new Request(`${ORIGIN}/voice?${q}`, { headers: { cookie, 'sec-fetch-site': site } }), e, { fetchImpl: async () => Response.json({}) });
  expect((await get('t=hi', '')).status).toBe(401);
  const cookie = (await makeSession(e, 'ann')).split(';')[0];
  expect((await get('t=hi', cookie, 'cross-site')).status).toBe(403);
  const ok = await get('l=uk&t=' + encodeURIComponent('Привіт'), cookie);
  expect(ok.status).toBe(200);
  expect(ok.headers.get('content-type')).toBe('audio/mpeg');
  expect((await ok.arrayBuffer()).byteLength).toBe(900);
  expect(calls[0]).toEqual(['Привіт', 'uk']);
  const bad = await get('t=boom', cookie);
  expect(bad.status).toBe(502);
  expect((await bad.json()).error).toContain('voice down');
  expect((await get('t=', cookie)).status).toBe(400);
  expect((await get('t=' + 'x'.repeat(1201), cookie)).status).toBe(413);
});

test('a refused microphone gets steps for the device in hand, iPhone Chrome included', () => {
  const page = appPage({ login: 'ann', connected: [] });
  expect(page).toContain('Settings › Apps › Chrome and turn on Microphone');
  expect(page).toContain('Website Settings › Microphone › Allow');
  expect(page).toContain("errMsg(micHelp(e,'tap the wave again'))");
  expect(page).not.toContain('the icon in the address bar), then tap');
  // The level meter's AudioContext is made before the permission prompt, inside the tap.
  expect(page.indexOf('oCtx=new AC()')).toBeLessThan(page.indexOf("oStream=await navigator.mediaDevices.getUserMedia"));
});

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
  expect(await transcribe({ AI: a }, { audio: 'QUJD' })).toEqual({ status: 200, text: 'make me a website' });
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
  expect(await res.json()).toEqual({ text: 'hello there' });
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

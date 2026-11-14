import { expect, test } from 'bun:test';
import { handle, MAX_AUDIO_B64, transcribe, VOICE_PARTS_PER_DAY, VOICE_PER_DAY, WHISPER_MODEL } from '../src/index.js';
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

test('spoken phrases (part: true) have their own daily allowance, apart from the 60 voice messages', async () => {
  const e = env({ AI: ai({ text: 'hi' }) });
  const cookie = (await makeSession(e, 'ann')).split(';')[0];
  for (let i = 0; i < VOICE_PER_DAY; i++) expect((await post(e, { audio: 'QUJD' }, cookie)).status).toBe(200);
  expect((await post(e, { audio: 'QUJD' }, cookie)).status).toBe(429);
  expect((await post(e, { audio: 'QUJD', part: true }, cookie)).status).toBe(200);
  expect(VOICE_PARTS_PER_DAY).toBeGreaterThan(VOICE_PER_DAY);
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

import { spokenReply, talkReply, talkMessages, TALK_SYSTEM } from '../src/index.js';

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

test('voice talk starts a build when asked, from the model JSON or from the words alone', async () => {
  expect(talkReply('{"say":"Building it now.","build":"A hackathon app with sign-up and voting"}')).toEqual({ text: 'Building it now.', build: 'A hackathon app with sign-up and voting' });
  expect(talkReply('```json\n{"say":"On it.","build":"a tip calculator"}\n```').build).toBe('a tip calculator');
  expect(talkReply('Sure, I would make that.', 'Build me an app, hackathon app via Flisk').build).toBe('Build me an app, hackathon app via Flisk');
  const hist = [{ role: 'user', content: 'make a website for my bakery' }, { role: 'assistant', content: 'Sounds good.' }, { role: 'user', content: 'Build it.' }];
  expect(talkReply('Okay.', 'Build it.', hist).build).toBe('make a website for my bakery');
  expect(talkReply('It is sunny.', 'what is the weather in London')).toEqual({ text: 'It is sunny.', build: '' });
  expect(talkReply('{"say":"I am building it now. Build a long app with many things.","build":"x"}').text).toBe('I am building it now.');
  expect(TALK_SYSTEM).toContain('"build"');
  const page = appPage({ login: 'ann', connected: [] });
  expect(page).toContain('const toBuild=String(b.build');
  expect(page).toContain('form.requestSubmit()');
});

import { ssml, secMsGec, speakStream, VOICE } from '../src/tts.js';

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
  const e = env({ SPEAK: async (t, l, o) => { calls.push([t, l]); if (t === 'boom') throw new Error('voice down'); o.info.tries = 2; return new Response(new Uint8Array(900).fill(7)).body; } });
  const get = (q, cookie, site = 'same-origin') => handle(new Request(`${ORIGIN}/voice?${q}`, { headers: { cookie, 'sec-fetch-site': site } }), e, { fetchImpl: async () => Response.json({}) });
  expect((await get('t=hi', '')).status).toBe(401);
  const cookie = (await makeSession(e, 'ann')).split(';')[0];
  expect((await get('t=hi', cookie, 'cross-site')).status).toBe(403);
  const ok = await get('l=uk&t=' + encodeURIComponent('Привіт'), cookie);
  expect(ok.status).toBe(200);
  expect(ok.headers.get('content-type')).toBe('audio/mpeg');
  expect(ok.headers.get('server-timing')).toMatch(/^voice;dur=\d+;desc="2 tries"$/);
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

test('the mic writes while you talk: it cuts at each pause and sends every phrase to Whisper as a part', () => {
  const page = appPage({ login: 'ann', connected: [] });
  expect(page).not.toContain('webkitSpeechRecognition');
  expect(page).toContain('if(cur.spoke&&(quiet>650||now-cur.t0>12000))cut(false);');
  expect(page).toContain('if(p.spoke&&blob.size>800)sends.push(sendPart(blob));');
  expect(page).toContain('type:blob.type,part:true})');
  const scripts = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  for (const js of scripts) expect(() => new Function(js)).not.toThrow();
});

// Drives the page's own hearOne with a fake microphone and clock: loud = talking, quiet = a pause.
function fakeHear() {
  const page = appPage({ login: 'ann', connected: [] });
  const code = page.slice(page.indexOf('const mix='), page.indexOf('// The moment a turn ends'));
  let now = 0, level = 0, tick = null;
  class Rec {
    constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm'; }
    start() { this.state = 'recording'; }
    requestData() { queueMicrotask(() => this.ondataavailable({ data: new Blob(['x'.repeat(10)]) })); }
    stop() { this.state = 'inactive'; queueMicrotask(() => { this.ondataavailable({ data: new Blob(['y']) }); this.onstop(); }); }
  }
  Rec.isTypeSupported = () => true;
  const ctx = { createAnalyser: () => ({ fftSize: 0, getFloatTimeDomainData: (b) => b.fill(level) }), createMediaStreamSource: () => ({ connect() {}, disconnect() {} }) };
  const D = { now: () => now };
  const hearOne = new Function('MediaRecorder', 'oStream', 'oCtx', 'orb', 'setInterval', 'clearInterval', 'Date', `let oRec,oStop,oSens=0;${code};return hearOne;`)(
    Rec, {}, ctx, { style: { setProperty() {} } }, (f) => { tick = f; return 1; }, () => {}, D);
  const run = async (lv, ms) => { level = lv; for (let t = 0; t < ms; t += 60) { now += 60; tick(); await Promise.resolve(); await Promise.resolve(); } };
  return { hearOne, run };
}

test('voice talk sends the words at the first short pause, drops that draft when you go on, and reuses it at the end', async () => {
  const { hearOne, run } = fakeHear();
  const sent = [];
  const send = (blob) => { const s = { blob, aborted: false, ctrl: { abort: () => { s.aborted = true; } }, p: Promise.resolve({ ok: true }) }; sent.push(s); return s; };
  const turn = hearOne(send);
  await run(0.5, 1200); // talking
  expect(sent.length).toBe(0);
  await run(0, 480); // a short pause: the draft goes up before the turn is over
  expect(sent.length).toBe(1);
  await run(0.5, 600); // talking again: that draft is dropped
  expect(sent[0].aborted).toBe(true);
  await run(0, 1200); // the pause becomes the end of the turn
  const got = await turn;
  expect(sent.length).toBe(2);
  expect(sent[1].aborted).toBe(false);
  expect(got.early).toBe(sent[1]);
  expect(got.blob.size).toBeGreaterThan(0);
});

test('voice talk answers the instant a turn ends: a preloaded "Mm-hm" in your language, a chime until it loads', () => {
  const page = appPage({ login: 'ann', connected: [] });
  expect(page).toContain("const acked=ack()");
  expect(page).toContain("ackLoad()");
  expect(page).toContain("uk:['Ага.'");
  expect(page).toContain('function chime()');
});

test('voice talk hears only the loudest, closest voice by default; the slider lets the room in', () => {
  const page = appPage({ login: 'ann', connected: [] });
  expect(page).toContain('id="osens" type="range" min="0" max="100" step="5" value="0"');
  const code = page.slice(page.indexOf('const mix='), page.indexOf('// Record one utterance'));
  const bar = (sens, floor, peak) => new Function('oSens', `${code};return voiceBar(${floor},${peak});`)(sens);
  // Someone talking across the room (0.02) does not count at 0, and does at 100.
  expect(0.02 > bar(0, 0.005, 0)).toBe(false);
  expect(0.02 > bar(100, 0.005, 0)).toBe(true);
  // A noisy room (hum 0.015) raises the bar; your own loud voice (peak 0.2) keeps a quieter one (0.06) out at 0.
  expect(bar(0, 0.015, 0)).toBeGreaterThan(0.045);
  expect(0.06 > bar(0, 0.005, 0.2)).toBe(false);
  expect(0.06 > bar(100, 0.005, 0.2)).toBe(true);
});

test('voice talk never takes back live weather, and the talk circle is an Earth that turns to where you are', () => {
  expect(TALK_SYSTEM).toMatch(/never take them back/);
  expect(TALK_SYSTEM).toMatch(/never say you cannot check the weather/);
  const page = appPage({ login: 'ann', connected: [], here: { lat: 51, lng: 0 } });
  expect(page).toContain('id="oearth"');
  expect(page).toContain('earth_day_4096.jpg');
  expect(page).toContain('{"lat":51,"lng":0}');
  expect(page).toContain("fetch('/api/talk/warm'");
});

// A stand-in for Microsoft's voice socket: 'audioAt' ms after the SSML it sends one audio frame and the turn end;
// null never answers, 'fail' closes at once with nothing.
function fakeVoice(plan) {
  const made = [];
  const open = async () => {
    const how = plan[made.length];
    const ls = {}, sock = { closed: false, sent: 0 };
    sock.addEventListener = (k, f) => { (ls[k] ||= []).push(f); };
    const fire = (k, e = {}) => (ls[k] || []).forEach((f) => f(e));
    sock.close = () => { if (!sock.closed) { sock.closed = true; fire('close'); } };
    sock.send = () => {
      if (++sock.sent < 2) return;
      if (how === 'fail') return setTimeout(() => sock.close(), 5);
      if (how == null) return;
      setTimeout(() => {
        if (sock.closed) return;
        const head = new TextEncoder().encode('Path:audio\r\n');
        const buf = new Uint8Array(2 + head.length + 3);
        new DataView(buf.buffer).setUint16(0, head.length);
        buf.set(head, 2); buf.set([made.indexOf(sock) + 1, 9, 9], 2 + head.length);
        fire('message', { data: buf.buffer });
        setTimeout(() => fire('message', { data: 'Path:turn.end' }), 5);
      }, how);
    };
    made.push(sock);
    return sock;
  };
  return { open, made };
}
const firstByte = async (stream) => new Uint8Array(await new Response(stream).arrayBuffer())[0];

test('voice: a fast first ask is streamed alone, with no second ask', async () => {
  const v = fakeVoice([10]); const info = {};
  expect(await firstByte(await speakStream('hi', '', { open: v.open, hedgeMs: 200, info }))).toBe(1);
  expect(v.made.length).toBe(1);
  expect(info.tries).toBe(1);
});

test('voice: when the first ask stalls, a second ask is made and the one that speaks first wins', async () => {
  const v = fakeVoice([null, 10]); const info = {};
  const t0 = Date.now();
  expect(await firstByte(await speakStream('hi', '', { open: v.open, hedgeMs: 50, firstMs: 2000, info }))).toBe(2);
  expect(Date.now() - t0).toBeLessThan(1000);
  expect(info.tries).toBe(2);
  expect(v.made[0].closed).toBe(true); // the stalled one is given up
});

test('voice: a first ask that fails is asked again at once, without waiting for the hedge', async () => {
  const v = fakeVoice(['fail', 10]);
  const t0 = Date.now();
  expect(await firstByte(await speakStream('hi', '', { open: v.open, hedgeMs: 5000, firstMs: 3000 }))).toBe(2);
  expect(Date.now() - t0).toBeLessThan(1000);
});

test('voice: both asks failing, or nothing at all in time, still rejects so the page can fall back', async () => {
  await expect(speakStream('hi', '', { open: fakeVoice(['fail', 'fail']).open, hedgeMs: 20 })).rejects.toThrow('sent no audio');
  const v = fakeVoice([null, null]);
  await expect(speakStream('hi', '', { open: v.open, hedgeMs: 20, firstMs: 100 })).rejects.toThrow('took too long');
  expect(v.made.every((s) => s.closed)).toBe(true);
  await expect(speakStream('  ', '', { open: v.open })).rejects.toThrow('nothing to say');
});

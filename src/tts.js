// The voice from github.com/flisk-sh/flisk-video-factory: Microsoft Edge's read-aloud service (what edge-tts uses), with
// the warm Ava Multilingual voice. It speaks every language, so one voice answers in Ukrainian, Spanish or English.
// The connection token comes from msedge-tts (MIT); the request is the same two messages edge-tts sends.
import { hashSecMsGecV2 } from 'msedge-tts/dist/SecMsGec.js';

export const VOICE = 'en-US-AvaMultilingualNeural';
// Languages where a native lady's voice sounds better than Ava's accent: Dutch gets Fenna (nl-NL), from the same service.
export const VOICES = { nl: 'nl-NL-FennaNeural' };
export const voiceFor = (lang = '') => VOICES[String(lang).slice(0, 2).toLowerCase()] || VOICE;
export const RATE = '-5%';
export const PITCH = '-4Hz';
export const MAX_SPEAK = 1200;
const TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const WSS = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
  Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
  Pragma: 'no-cache',
  'Cache-Control': 'no-cache',
};
// Whisper's two-letter code -> the locale the voice is told to speak.
export const LOCALES = { en: 'en-US', uk: 'uk-UA', ru: 'ru-RU', es: 'es-ES', de: 'de-DE', fr: 'fr-FR', it: 'it-IT', pt: 'pt-BR', pl: 'pl-PL', nl: 'nl-NL', tr: 'tr-TR', cs: 'cs-CZ', sk: 'sk-SK', ro: 'ro-RO', hu: 'hu-HU', sv: 'sv-SE', da: 'da-DK', no: 'nb-NO', fi: 'fi-FI', el: 'el-GR', bg: 'bg-BG', hr: 'hr-HR', he: 'he-IL', ar: 'ar-SA', fa: 'fa-IR', hi: 'hi-IN', ja: 'ja-JP', ko: 'ko-KR', zh: 'zh-CN', vi: 'vi-VN', th: 'th-TH', id: 'id-ID', ms: 'ms-MY', kk: 'kk-KZ', lt: 'lt-LT', lv: 'lv-LV', et: 'et-EE', sl: 'sl-SI', ka: 'ka-GE' };

export async function secMsGec(now = Date.now()) {
  const ticks = Math.floor(now / 1000) + 11644473600;
  return hashSecMsGecV2(`${(ticks - (ticks % 300)) * 10000000}${TOKEN}`);
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// The read-aloud service rejects <lang> ("SSML is invalid"); Ava Multilingual hears the language from the words,
// and xml:lang carries the locale Whisper heard.
export function ssml(text, lang = '') {
  const loc = LOCALES[String(lang).slice(0, 2).toLowerCase()] || 'en-US';
  const body = esc(String(text).slice(0, MAX_SPEAK));
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${loc}'><voice name='${voiceFor(lang)}'><prosody pitch='${PITCH}' rate='${RATE}' volume='+0%'>${body}</prosody></voice></speak>`;
}

const uuid = () => crypto.randomUUID().replace(/-/g, '');
const stamp = () => new Date().toUTCString().replace('GMT', 'GMT+0000 (Coordinated Universal Time)');

// A WebSocket with Edge's headers: Workers open it with fetch + Upgrade, Bun (tests, local runs) with its own WebSocket.
async function openSocket(url) {
  if (typeof WebSocketPair !== 'undefined') {
    const res = await fetch(url.replace('wss://', 'https://'), { headers: { ...HEADERS, Upgrade: 'websocket' } });
    if (!res.webSocket) throw new Error(`the voice service answered ${res.status}`);
    res.webSocket.accept();
    return res.webSocket;
  }
  const ws = new WebSocket(url, { headers: HEADERS });
  ws.binaryType = 'arraybuffer';
  await new Promise((ok, no) => {
    ws.addEventListener('open', ok, { once: true });
    ws.addEventListener('error', () => no(new Error('the voice service refused the connection')), { once: true });
  });
  return ws;
}

// One ask on its own connection: resolves with a stream of mp3 bytes on the first audio, sent on as Microsoft sends
// them (it sometimes paces audio at speaking speed, so waiting for the whole file would add seconds); rejects when the
// connection ends with no audio. close() gives it up, even while the connection is still opening.
// 'rec' gets ms from 't0' to the socket open (o), Microsoft's turn start (s) and the first audio (a).
function ask(words, lang, open, totalMs, rec = {}, t0 = Date.now()) {
  let ws = null, gone = false;
  const close = () => { gone = true; try { ws?.close(); } catch {} };
  const p = (async () => {
    const sock = await open(`${WSS}?TrustedClientToken=${TOKEN}&Sec-MS-GEC=${await secMsGec()}&Sec-MS-GEC-Version=2-143.0.3650.96&ConnectionId=${uuid()}`);
    ws = sock;
    rec.o = Date.now() - t0;
    if (gone) { try { sock.close(); } catch {} throw new Error('given up'); }
    const { readable, writable } = new TransformStream();
    const out = writable.getWriter();
    let chain = Promise.resolve(), started = false, finished = false;
    return await new Promise((resolve, reject) => {
      const total = setTimeout(() => end(), totalMs);
      const end = () => {
        if (finished) return;
        finished = true;
        clearTimeout(total); try { sock.close(); } catch {}
        // Frames still being read finish first; only then is it clear whether any audio came.
        chain.then(() => out.close()).catch(() => {}).then(() => { if (!started) reject(new Error('the voice service sent no audio')); });
      };
      sock.addEventListener('message', (e) => {
        if (typeof e.data === 'string') { if (rec.s == null && e.data.includes('Path:turn.start')) rec.s = Date.now() - t0; if (e.data.includes('Path:turn.end')) end(); return; }
        // Binary frame (a Blob in Workers, an ArrayBuffer in Bun): 2-byte header length, the header, then mp3 bytes.
        const got = typeof e.data?.arrayBuffer === 'function' ? e.data.arrayBuffer() : Promise.resolve(e.data instanceof ArrayBuffer ? e.data : e.data.buffer);
        chain = chain.then(async () => {
          const buf = await got;
          const headLen = new DataView(buf).getUint16(0);
          if (!new TextDecoder().decode(new Uint8Array(buf, 2, headLen)).includes('Path:audio')) return;
          const audio = new Uint8Array(buf, 2 + headLen);
          if (!audio.length) return;
          out.write(audio).catch(() => {}); // not awaited: the reader only starts once the stream is handed back
          if (!started) { started = true; rec.a = Date.now() - t0; resolve(readable); }
        });
      });
      sock.addEventListener('close', end);
      sock.addEventListener('error', end);
      sock.send(`X-Timestamp:${stamp()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`);
      sock.send(`X-RequestId:${uuid()}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${stamp()}Z\r\nPath:ssml\r\n\r\n${ssml(words, lang)}`);
    });
  })();
  p.catch(() => {});
  return { p, close };
}

// Text -> a stream of mp3 bytes. Resolves once the first audio arrives, so the caller can still fall back to another
// voice when nothing comes; rejects on any failure before that.
// Hedged: from Cloudflare, Microsoft now and then holds the first audio for 3-5 s or never sends it, for every request
// at once (2026-11-14: 50 of 50 asks in a slow spell, a second ask stalled as long as the first). So when no audio has
// come 'hedgeMs' after asking (at once when the first ask fails) it makes one more ask: 'backup' (another voice, an
// async function giving a stream) when there is one, else Microsoft again on a new connection. Whichever speaks first
// is streamed; the other is given up. 'info' gets how many asks it took (tries), which one spoke (won, from 1), each
// ask's timings (asks) and, when the backup spoke, its content type (type).
export async function speakStream(text, lang = '', { firstMs = 5500, totalMs = 60000, hedgeMs = 800, open = openSocket, backup = null, info = {} } = {}) {
  const words = String(text || '').trim();
  if (!words) throw new Error('nothing to say');
  const asks = [], t0 = Date.now();
  info.asks = [];
  return new Promise((resolve, reject) => {
    let done = false, failed = 0, last = null, hedge = 0;
    const finish = (err, stream, won) => {
      if (done) return;
      done = true;
      clearTimeout(first); clearTimeout(hedge);
      info.tries = asks.length;
      if (won) { info.won = asks.indexOf(won) + 1; if (won.type) info.type = won.type; }
      for (const a of asks) if (a !== won) a.close();
      if (err) reject(err); else resolve(stream);
    };
    const first = setTimeout(() => finish(new Error('the voice service took too long')), firstMs);
    const start = () => {
      const rec = { at: Date.now() - t0 };
      info.asks.push(rec);
      let a;
      if (asks.length && backup) {
        rec.kind = backup.kind || 'backup';
        a = { type: backup.type, close: () => {}, p: Promise.resolve().then(() => backup(words, lang)).then((st) => { rec.a = Date.now() - t0; return st; }) };
      } else a = ask(words, lang, open, totalMs, rec, t0);
      asks.push(a);
      a.p.then((stream) => finish(null, stream, a), (e) => {
        last = e; failed++; rec.x = 1;
        if (asks.length < 2 && hedgeMs) { clearTimeout(hedge); start(); } else if (failed === asks.length) finish(last);
      });
    };
    start();
    if (hedgeMs) hedge = setTimeout(() => { if (!done && asks.length < 2) start(); }, hedgeMs);
  });
}

// Text -> all the mp3 bytes at once (tests, and anything that needs the whole file).
export async function speak(text, lang = '', opts = {}) {
  const stream = await speakStream(text, lang, opts);
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  if (bytes.length < 500) throw new Error('the voice service sent no audio');
  return bytes;
}

export function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

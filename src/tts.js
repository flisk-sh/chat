// The voice from github.com/flisk-sh/flisk-video-factory: Microsoft Edge's read-aloud service (what edge-tts uses), with
// the warm Ava Multilingual voice. It speaks every language, so one voice answers in Ukrainian, Spanish or English.
// The connection token comes from msedge-tts (MIT); the request is the same two messages edge-tts sends.
import { hashSecMsGecV2 } from 'msedge-tts/dist/SecMsGec.js';

export const VOICE = 'en-US-AvaMultilingualNeural';
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
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${loc}'><voice name='${VOICE}'><prosody pitch='${PITCH}' rate='${RATE}' volume='+0%'>${body}</prosody></voice></speak>`;
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

// Text -> a stream of mp3 bytes, sent on as Microsoft sends them (it sometimes paces audio at speaking speed, so
// waiting for the whole file would add seconds). Resolves once the first audio arrives, so the caller can still fall
// back to another voice when nothing comes; rejects on any failure before that.
export async function speakStream(text, lang = '', { firstMs = 5500, totalMs = 60000, open = openSocket } = {}) {
  const words = String(text || '').trim();
  if (!words) throw new Error('nothing to say');
  const url = `${WSS}?TrustedClientToken=${TOKEN}&Sec-MS-GEC=${await secMsGec()}&Sec-MS-GEC-Version=2-143.0.3650.96&ConnectionId=${uuid()}`;
  const ws = await open(url);
  const { readable, writable } = new TransformStream();
  const out = writable.getWriter();
  let chain = Promise.resolve(), started = false, finished = false;
  const close = () => { try { ws.close(); } catch {} };
  return new Promise((resolve, reject) => {
    const first = setTimeout(() => { if (!started) { finished = true; close(); reject(new Error('the voice service took too long')); } }, firstMs);
    const total = setTimeout(() => end(), totalMs);
    const end = () => {
      if (finished) return;
      finished = true;
      clearTimeout(first); clearTimeout(total); close();
      // Frames still being read finish first; only then is it clear whether any audio came.
      chain.then(() => out.close()).catch(() => {}).then(() => { if (!started) reject(new Error('the voice service sent no audio')); });
    };
    ws.addEventListener('message', (e) => {
      if (typeof e.data === 'string') { if (e.data.includes('Path:turn.end')) end(); return; }
      // Binary frame (a Blob in Workers, an ArrayBuffer in Bun): 2-byte header length, the header, then mp3 bytes.
      const got = typeof e.data?.arrayBuffer === 'function' ? e.data.arrayBuffer() : Promise.resolve(e.data instanceof ArrayBuffer ? e.data : e.data.buffer);
      chain = chain.then(async () => {
        const buf = await got;
        const headLen = new DataView(buf).getUint16(0);
        if (!new TextDecoder().decode(new Uint8Array(buf, 2, headLen)).includes('Path:audio')) return;
        const audio = new Uint8Array(buf, 2 + headLen);
        if (!audio.length) return;
        out.write(audio).catch(() => {}); // not awaited: the reader only starts once the stream is handed back
        if (!started) { started = true; clearTimeout(first); resolve(readable); }
      });
    });
    ws.addEventListener('close', end);
    ws.addEventListener('error', end);
    ws.send(`X-Timestamp:${stamp()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`);
    ws.send(`X-RequestId:${uuid()}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${stamp()}Z\r\nPath:ssml\r\n\r\n${ssml(words, lang)}`);
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

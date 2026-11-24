// Voice talk: speech to text (Whisper), the spoken reply, and the "build it" hand-off to a task.
// index.js routes the requests; alexa.js reuses talkMessages and talkReply, so neither imports the other.
import { LANG_NAMES, PRODUCT_FACTS, replyRule } from './lang.js';
import { memoNote } from './memo.js';

export const MAX_AUDIO_B64 = 1_400_000; // about 1 MB of audio, a minute of speech
export const WHISPER_MODEL = '@cf/openai/whisper-large-v3-turbo';
export const TALK_SYSTEM = `You are Flisk Oracle, a voice you talk to on chat.flisk.si. Your reply is read aloud, so:
- Answer in one or two short sentences of plain spoken words. No Markdown, no lists, no tables, no links, no code, no emoji.
- Be warm, direct and sure of yourself, like a wise oracle who also knows practical things. Give the answer first.
- If the person asks you to build or make something (a website, an app, a video, a system) or says "build it", reply with ONLY this JSON and nothing else: {"say":"one short sentence saying you are building it now","build":"the full task in plain words, with every detail they gave, using the earlier turns if they said build it"}. A real computer then builds it. Never say you cannot build.
- Never invent phone numbers, emails, prices or addresses. If you do not know, say so in a few words.
- You can tell the live weather anywhere: chat looks it up from a live weather service and gives you the numbers. Weather numbers you said earlier in this talk were real and live: never take them back, never say they were made up, and never say you cannot check the weather.
- Reply in the language the person speaks.`;

// One spoken turn for voice talk: the model answers directly, no computer, short and plain so it sounds right aloud.
export function spokenReply(text) {
  let t = String(text || '').trim();
  if (t.startsWith('{')) {
    try {
      const o = JSON.parse(t);
      t = String(o.say || o.answer || o.text || o.reply || '').trim() || t;
    } catch {}
  }
  return t.replace(/```[\s\S]*?```/g, ' ').replace(/[*_#>|`~]/g, '').replace(/\s+/g, ' ').trim().slice(0, 1200);
}
// Voice talk builds when asked: the model answers {say, build}; if it only talked, a plain "build / make / create a ..."
// request (or "build it" after one) still starts the build.
const BUILD_ASK = /\b(build|make|create|generate|develop)\b[\s\S]{0,60}\b(app|application|website|web ?site|site|page|video|dashboard|bot|game|tool|api|shop|store|system|calculator|landing)\b/i;
const BUILD_IT = /^\W*(ok(ay)?\W+|yes\W+|please\W+)*(build|make|do) it\W*$/i;
export function talkReply(raw, heard = '', history = []) {
  let t = String(raw || '').trim(), build = '';
  const a = t.indexOf('{'), z = t.lastIndexOf('}');
  if (a >= 0 && z > a && (t.startsWith('{') || t.startsWith('```'))) {
    try { const o = JSON.parse(t.slice(a, z + 1)); build = String(o.build || o.task || '').trim().slice(0, 2000); t = String(o.say || o.answer || o.text || o.reply || '').trim(); } catch {}
  }
  if (!build && heard) {
    if (BUILD_IT.test(heard)) build = [...history].reverse().find((m) => m.role === 'user' && !BUILD_IT.test(m.content) && BUILD_ASK.test(m.content))?.content || '';
    else if (BUILD_ASK.test(heard)) build = heard;
    build = build.slice(0, 2000);
  }
  // When building, only the first sentence is spoken: the task itself goes to the computer, not to the speaker.
  const said = spokenReply(t);
  const text = (build ? said.split(/(?<=[.!?…])\s+/)[0] : said) || (build ? 'On it. I am building that now.' : '');
  return { text, build };
}
// Whisper's language code -> the name the model understands, so the reply comes back in the language spoken.
export { LANG_NAMES };
export function talkMessages(history, lang = '', memo = '') {
  const turns = (Array.isArray(history) ? history : [])
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1000) }));
  const rule = replyRule(lang);
  const sys = `${TALK_SYSTEM}\n${PRODUCT_FACTS}${rule ? `\n${rule}` : ''}${memoNote(memo)}`;
  return [{ role: 'system', content: sys }, ...turns];
}

// Speech to text for the mic button: the browser records, Workers AI Whisper writes it down. Works in every browser,
// unlike the browser's own speech recognition (missing in Firefox, broken in Arc, Brave and in-app browsers).
// Whisper on Workers AI usually answers in ~1 s but sometimes waits 3-6 s in a queue (measured 2026-11-14). A second ask
// started at hedgeMs, or at once when the first one fails, is usually fast, so the first answer wins.
export const WHISPER_HEDGE_MS = 1100;
export function hedgedRun(run, hedgeMs = WHISPER_HEDGE_MS) {
  return new Promise((ok, fail) => {
    let started = 0, failed = 0, done = false, timer = 0;
    const start = () => {
      if (done || started >= 2) return;
      started++;
      Promise.resolve().then(run).then(
        (r) => { if (done) return; done = true; clearTimeout(timer); ok(r); },
        (e) => { if (done) return; failed++; if (started < 2) { clearTimeout(timer); start(); } else if (failed === 2) { done = true; fail(e); } },
      );
    };
    start();
    timer = setTimeout(start, hedgeMs);
  });
}
// Whisper writes words for noise and silence: stock phrases from its training subtitles, or a clip it rates as "not speech".
// Such a clip is treated as nothing heard, so the Oracle does not answer a person who never spoke.
const STOCK = /^\W*(thanks? for watching|thank you for watching|please subscribe|subtitles? by .*|amara\.org.*|you|bye\.?|so|uh|um|hmm+|mm+)\W*$/i;
export function phantom(r) {
  const text = String(r?.text || '').trim();
  if (!text) return true;
  if (STOCK.test(text)) return true;
  const segs = Array.isArray(r?.segments) ? r.segments : [];
  return segs.length > 0 && segs.every((g) => Number(g?.no_speech_prob) > 0.6 && Number(g?.avg_logprob) < -1);
}
export async function transcribe(env, body, { hedgeMs = WHISPER_HEDGE_MS } = {}) {
  const audio = typeof body?.audio === 'string' ? body.audio : '';
  if (!audio) return { status: 400, error: 'no audio was recorded' };
  if (audio.length > MAX_AUDIO_B64) return { status: 413, error: 'keep it under a minute' };
  if (!/^[A-Za-z0-9+/=]+$/.test(audio)) return { status: 400, error: 'the recording was not readable' };
  if (!env.AI) return { status: 503, error: 'voice is not set up on this server' };
  try {
    const r = await hedgedRun(() => env.AI.run(WHISPER_MODEL, { audio }), hedgeMs);
    const lang = String(r?.transcription_info?.language || '').toLowerCase().replace(/[^a-z-]/g, '').slice(0, 8);
    return { status: 200, text: phantom(r) ? '' : String(r?.text || '').trim(), lang };
  } catch (e) {
    return { status: 502, error: 'could not hear that, try again: ' + String(e?.message || e).slice(0, 120) };
  }
}

// True when what was said (or the last thing said) looks like a request to build something, so the reply must be held
// back until the model's answer shows whether it is a spoken answer or a build task.
export const asksBuild = (text) => BUILD_IT.test(text) || BUILD_ASK.test(text);

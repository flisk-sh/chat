// Alexa skill endpoint: "Alexa, open Flisk" on an Echo. Alexa turns speech into text (no Whisper), this answers with
// the same Flisk Oracle prompt as voice talk, and Alexa speaks it in its own voice.
// Auth: Amazon cannot add headers, so the endpoint URL carries a secret (?key=ALEXA_KEY); the skill id and the request
// age are checked too. Own-account (development) skills need no Amazon review.
import { talkMessages, talkReply } from './index.js';

export const ALEXA_PER_DAY = 300;
const MAX_AGE_MS = 150_000;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const same = (a, b) => {
  a = String(a); b = String(b);
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
};

// Ava's voice: Alexa plays an mp3 from an HTTPS URL inside <audio>, and speaks the text between the tags in its own voice
// if the file cannot be fetched or played. The URL is signed with the skill key, so only text this endpoint wrote can be read.
export async function sign(text, key) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(key)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(String(text))));
  return [...mac.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export const MAX_VOICE = 400; // longer answers are spoken by Alexa itself: a long mp3 is slow to make and the URL grows
export const voiceUrl = async (origin, text, key) =>
  text.length <= MAX_VOICE ? `${origin}/alexa/voice?t=${encodeURIComponent(text)}&s=${await sign(text, key)}` : '';

export const reply = (text, { end = false, history = [], reprompt = 'What else would you like to know?', card = '', voice = '' } = {}) => ({
  version: '1.0',
  sessionAttributes: { history },
  response: {
    outputSpeech: { type: 'SSML', ssml: voice ? `<speak><audio src="${esc(voice)}">${esc(text)}</audio></speak>` : `<speak>${esc(text)}</speak>` },
    ...(end ? {} : { reprompt: { outputSpeech: { type: 'PlainText', text: reprompt } } }),
    ...(card ? { card: { type: 'Simple', title: 'Flisk', content: card } } : {}),
    shouldEndSession: end,
  },
});

// What was asked, from an Alexa request body: { kind: 'open'|'stop'|'help'|'ask'|'end', query }.
export function intentOf(body) {
  const r = body?.request || {};
  if (r.type === 'LaunchRequest') return { kind: 'open' };
  if (r.type === 'SessionEndedRequest') return { kind: 'end' };
  if (r.type !== 'IntentRequest') return { kind: 'help' };
  const name = r.intent?.name || '';
  if (/^AMAZON\.(Stop|Cancel|Navigate)/i.test(name)) return { kind: 'stop' };
  if (/^AMAZON\.Help/i.test(name)) return { kind: 'help' };
  const query = String(r.intent?.slots?.query?.value || '').trim().slice(0, 500);
  return query ? { kind: 'ask', query } : { kind: 'help' };
}

// ask(messages) -> { text } | { error }; overLimit() -> bool. Both come from index.js so tests can fake them.
export async function alexaHandle(request, env, { ask, overLimit, now = Date.now(), origin = '', prepare = null }) {
  if (!env.ALEXA_KEY) return Response.json({ error: 'the Alexa skill is not set up on this server' }, { status: 503 });
  const key = new URL(request.url).searchParams.get('key') || '';
  if (!same(key, env.ALEXA_KEY)) return Response.json({ error: 'not allowed' }, { status: 403 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'send an Alexa request' }, { status: 400 }); }
  const id = body?.session?.application?.applicationId || body?.context?.System?.application?.applicationId || '';
  if (env.ALEXA_SKILL_ID && !same(id, env.ALEXA_SKILL_ID)) return Response.json({ error: 'wrong skill' }, { status: 403 });
  const at = Date.parse(body?.request?.timestamp || '');
  if (!Number.isFinite(at) || Math.abs(now - at) > MAX_AGE_MS) return Response.json({ error: 'request too old' }, { status: 400 });

  const it = intentOf(body);
  // The audio tag goes in only when Ava has already made the file (prepare), so Alexa never meets a slow or failing link.
  const say = async (text, o = {}) => {
    let voice = origin ? await voiceUrl(origin, text, env.ALEXA_KEY) : '';
    if (voice && prepare && !(await prepare(text, voice).catch(() => false))) voice = '';
    return Response.json(reply(text, { ...o, voice }));
  };
  if (it.kind === 'end') return Response.json({ version: '1.0', response: {} });
  if (it.kind === 'stop') return say('Okay. Talk soon.', { end: true });
  if (it.kind === 'open') return say('Flisk Oracle here. Ask me anything.', { reprompt: 'Go ahead, ask me anything.' });
  if (it.kind === 'help') return say('Say ask, then your question. For example: ask what is the weather in London.');

  const old = Array.isArray(body?.session?.attributes?.history) ? body.session.attributes.history : [];
  const history = [...old.slice(-8), { role: 'user', content: it.query }];
  if (await overLimit()) return say("That's today's limit for the home speaker. Try again tomorrow.", { end: true });
  const r = await ask(talkMessages(history, 'en'), it.query);
  if (r.error) return say('Sorry, I could not think of an answer just now. Try again.', { history: old });
  const { text, build } = talkReply(r.text, it.query, history);
  const spoken = build ? `${text} I cannot build from the speaker, so open chat dot flisk dot si on your phone to build it.` : text;
  return say(spoken, { history: [...history, { role: 'assistant', content: text }].slice(-10), card: build ? 'Open chat.flisk.si to build: ' + build.slice(0, 200) : '' });
}

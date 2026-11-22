import { readAiStream } from './say-stream.js';
// Calling a model: which provider a choice means (the free Flisk Wolf, or the visitor's own key), the free fallback
// chain behind Wolf (OpenRouter, Workers AI, Pollinations), and how a failed call is explained. loop.js only asks.
// Who answers. "wolf" is Flisk Inference (free, shared, answers capped at 2048 tokens). The others use the visitor's own API key,
// sent with the request and never stored; only these three addresses are allowed, so a key can't be sent anywhere else.
export const BYO = {
  anthropic: { label: 'Claude (my API key)', url: 'https://api.anthropic.com/v1/chat/completions', model: 'claude-sonnet-5-5' },
  openai: { label: 'OpenAI (my API key)', url: 'https://api.openai.com/v1/chat/completions', model: '' },
  openrouter: { label: 'OpenRouter (my API key)', url: 'https://openrouter.ai/api/v1/chat/completions', model: '' },
};

// choice: undefined or { ai: 'wolf' } or { ai: 'anthropic'|'openai'|'openrouter', key, model }. Returns { error } for a bad choice.
// What to call the chosen AI when the user asks "which model are you".
export const modelLabel = (chosen) => (chosen?.free ? 'Flisk Wolf, a free model hosted by Flisk (a smaller backup model answers when it is busy)' : `${chosen?.model || ''} (through the visitor's own ${String(chosen?.ai || '')} key)`.trim());

export function resolveModel(choice) {
  const ai = choice?.ai || 'wolf';
  if (ai === 'wolf') return { ai, free: true };
  const p = BYO[ai];
  if (!p) return { error: 'pick one of the listed AI models' };
  const key = String(choice.key || '').trim();
  const model = String(choice.model || '').trim() || p.model;
  if (key.length < 8 || key.length > 300 || /\s/.test(key)) return { error: `paste your ${p.label.split(' (')[0]} API key`, kind: 'key' };
  if (!model) return { error: 'type the model name, for example the one shown on your provider\'s model list', kind: 'model' };
  if (!/^~?[A-Za-z0-9._:\/-]{1,80}$/.test(model)) return { error: 'the model name may only use letters, numbers and . _ : / - (copy it from your provider\'s model list)', kind: 'model' };
  return { ai, free: false, url: p.url, key, model };
}


// "Provider returned error" tells a person nothing. OpenRouter puts the real reason in error.metadata (raw text and the
// upstream provider's name), so show it, say what kind of problem it is, and let the page offer the matching next step.
export function explainModelError(body, status, chosen = {}) {
  const e = body?.error;
  const msg = typeof e === 'string' ? e : String(e?.message || '');
  const code = Number(e?.code) || status || 0;
  const meta = e?.metadata || {};
  let raw = meta.raw;
  if (raw && typeof raw !== 'string') raw = JSON.stringify(raw);
  const detail = String(raw || meta.reasons || '').replace(/\s+/g, ' ').slice(0, 220);
  const who = meta.provider_name ? ` from ${meta.provider_name}` : '';
  const hay = `${msg} ${detail}`.toLowerCase();
  let kind = 'other';
  if (/temperature|top_p|max_tokens|max_completion_tokens|unsupported (parameter|value)|not supported with this model/.test(hay) && code === 400) kind = 'setting';
  // "This model is not available in your region" comes as a 403 but is not a bad key: that one model is out, so the chain goes on to the next.
  else if (/(not available|unavailable|not supported|blocked|restricted)[^.]{0,30}\b(region|country|location)\b|\b(region|country|location)\b[^.]{0,30}(not (available|supported)|blocked|restricted)/.test(hay)) kind = 'model';
  else if (code === 401 || code === 403 || /api key|unauthori|invalid.*key|no auth/.test(hay)) kind = 'key';
  else if (code === 402 || code === 429 || /credit|quota|rate.?limit|insufficient|too many/.test(hay)) kind = 'limit';
  else if (code === 404 || code === 400 && /model/.test(hay) || /no endpoints|not a valid model|model.*not (found|exist)|does not exist|unknown model/.test(hay)) kind = 'model';
  else if (code >= 500 || /provider returned error|overloaded|timeout/.test(hay)) kind = 'provider';
  const head = {
    key: `Your ${chosen.free ? 'Flisk Wolf' : chosen.ai || 'provider'} API key was refused`,
    limit: 'Out of credit or rate limited',
    model: `The model "${chosen.free ? 'Flisk Wolf' : chosen.model || 'you chose'}" is not available`,
    setting: `The AI refused a setting Flisk Chat sent (HTTP ${code || 'unknown'})`,
    provider: `The model provider${who} had a problem (HTTP ${code || 'unknown'})`,
    other: `The model answered with an error (HTTP ${code || 'unknown'})`,
  }[kind];
  const why = [msg && !/^provider returned error$/i.test(msg) ? msg : '', detail].filter(Boolean).join(': ') || msg;
  return { error: `${head}${why ? `: ${why}` : ''}`.slice(0, 500), kind };
}

// An OpenAI-style event stream ("data: {...}" lines, ending "data: [DONE]"): each piece of text goes to onDelta as it
// arrives. Resolves { text, finish }, or { error } when the provider sends one in the stream.
async function readStream(res, onDelta) {
  const rd = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', text = '', finish = '', error = null;
  const line = (raw) => {
    const l = raw.trim();
    if (!l.startsWith('data:')) return;
    const data = l.slice(5).trim();
    if (!data || data === '[DONE]') return;
    let j;
    try { j = JSON.parse(data); } catch { return; }
    if (j?.error && !text) error = j.error;
    const c = j?.choices?.[0];
    const d = c?.delta?.content;
    if (typeof d === 'string' && d) { text += d; onDelta(d); }
    if (c?.finish_reason) finish = c.finish_reason;
  };
  for (;;) {
    const { value, done } = await rd.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { line(buf.slice(0, i)); buf = buf.slice(i + 1); }
  }
  line(buf);
  return error ? { error, text, finish } : { text, finish };
}

// Calls one model (OpenAI-compatible). Errors come back as { error }. A second argument { onDelta } streams the answer.
function oneModel(env = {}, fetchImpl = fetch, chosen = { ai: 'wolf', free: true }) {
  const url = chosen.free ? env.INFERENCE_URL || 'https://inference.flisk.si/v1/chat/completions' : chosen.url;
  const model = chosen.free ? env.INFERENCE_MODEL || 'flisk-wolf-chat' : chosen.model;
  const key = chosen.free ? env.INFERENCE_KEY : chosen.key;
  // Claude 5 thinks before it answers and thinking counts against max_tokens, so a Claude key gets room for both.
  const maxTokens = chosen.free ? 2048 : chosen.referer ? 1024 : chosen.ai === 'anthropic' ? 16000 : 4096;
  // The free model is another Worker on our own domain: Cloudflare refuses a Worker calling it by its public address
  // (error 1033), so the call goes through a service binding when there is one.
  const call = chosen.free && env.INFERENCE ? (u, init) => env.INFERENCE.fetch(u, init) : fetchImpl;
  return async (messages, o = {}) => {
    if (!key) return { error: 'chat has no model key yet (INFERENCE_KEY)' };
    // Voice talk and the chat page show the answer while it is still being written. Flisk Wolf streams too since
    // flisk-inference#74 (before that it answered 400 to stream: true).
    const stream = typeof o.onDelta === 'function';
    // Newer models refuse settings other models take: Claude 4.7 and later answer 400 to any `temperature` below 1, and
    // OpenAI's newer models want `max_completion_tokens` instead of `max_tokens`. So a model the visitor brings is called
    // without `temperature` (and OpenAI with `max_completion_tokens`), and a 400 that names one of them is retried once
    // with that setting fixed. (Anthropic's docs: platform.claude.com/docs/en/api/openai-sdk, "Request fields".)
    const opts = { temperature: chosen.free || chosen.referer || chosen.ai === 'openrouter', completion: chosen.ai === 'openai' };
    const send = async () => {
      const r = await call(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'user-agent': 'flisk-chat', ...(chosen.referer ? { 'http-referer': 'https://chat.flisk.si', 'x-title': 'Flisk Chat' } : {}) },
        body: JSON.stringify({ model, messages, [opts.completion ? 'max_completion_tokens' : 'max_tokens']: maxTokens, ...(opts.temperature ? { temperature: 0 } : {}), ...(chosen.free ? { reasoning_effort: o.effort === 'medium' ? 'medium' : 'low' } : {}), ...(stream ? { stream: true } : {}) }),
        ...(chosen.ms ? { signal: AbortSignal.timeout(chosen.ms) } : {}),
      });
      return { res: r, body: stream && r.ok ? null : await r.json().catch(() => null) };
    };
    let res, body;
    try {
      ({ res, body } = await send());
      for (let again = 0; again < 2 && !res.ok; again++) {
        const why = JSON.stringify(body?.error ?? '');
        if (opts.temperature && /temperature/i.test(why)) opts.temperature = false;
        else if (!opts.completion && /max_completion_tokens/i.test(why)) opts.completion = true;
        else break;
        ({ res, body } = await send());
      }
    } catch (e) {
      return { error: `the model did not answer: ${String(e?.message || e).slice(0, 150)}`, kind: 'provider' };
    }
    if (!res.ok || (body?.error && !body?.choices)) return explainModelError(body, res.status, chosen);
    if (stream) {
      let got;
      try { got = await readStream(res, o.onDelta); } catch (e) { return { error: `the model stopped answering: ${String(e?.message || e).slice(0, 150)}`, kind: 'provider' }; }
      if (got.error) return explainModelError({ error: got.error }, 0, chosen);
      if (got.text.trim()) return got.finish === 'length' ? { text: got.text, cut: true } : { text: got.text };
      return { error: 'the model sent an empty answer' + (got.finish ? ` (finish reason: ${String(got.finish).slice(0, 30)})` : ''), kind: 'empty' };
    }
    const text = body?.choices?.[0]?.message?.content;
    const finish = body?.choices?.[0]?.finish_reason;
    // cut: the answer stopped at the length limit, so an action in it may be missing its end.
    if (typeof text === 'string' && text.trim()) return finish === 'length' ? { text, cut: true } : { text };
    if (text && typeof text === 'object') return { text: JSON.stringify(text) };
    // Reasoning models sometimes spend the whole answer thinking and write nothing; say so, and let the loop retry.
    const thought = body?.choices?.[0]?.message?.reasoning;
    const why = finish === 'length' ? ' (it ran out of answer length' + (thought ? ' while thinking' : '') + ')' : finish ? ` (finish reason: ${String(finish).slice(0, 30)})` : '';
    return { error: `the model sent an empty answer${why}`, kind: 'empty' };
  };
}

// The free choice never shows a budget or rate-limit error. Flisk Wolf answers first; when it cannot (its shared daily
// budget is used up, or it fails), the same messages go to OpenRouter's free models (with OPENROUTER_KEY), then to a
// small Workers AI model on our own account (capped per day). Only when every one fails does the visitor see an error,
// and it says the free AI is busy, not why.
export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
// Nemotron first: both Gemma models were busy on most asks, so every chat paid for two failed calls before its first answer.
export const OPENROUTER_PREFERRED = ['nvidia/nemotron-3.5-lightning:free', 'nvidia/nemotron-3-ultra-550b-a55b:free', 'google/gemma-4-31b-it:free', 'google/gemma-4-26b-a4b-it:free', 'nvidia/nemotron-3.5-super-vl:free'];
// Was @cf/meta/llama-3.1-8b-instruct-fast: hidden from the Workers AI catalog, and its fp8 twin is set for deprecation on 2026-11-20.
// Mistral Small 3.1 24B has no deprecation date, runs on the free plan, does not spend the answer thinking, and writes good Ukrainian.
export const WORKERS_AI_FALLBACK = '@cf/mistralai/mistral-small-3.1-24b-instruct';
// The last fallback needs no key and no Cloudflare neurons: when the account's free 10,000 daily neurons are used up,
// Wolf and Workers AI both fail at once, and without it every free chat said "busy" until midnight UTC.
export const POLLINATIONS_TEXT_URL = 'https://text.pollinations.ai/openai';
export const POLLINATIONS_MS = 25_000; // it queues anonymous callers: a stuck call must end, not hang the chat
export const WORKERS_AI_PER_DAY = 300; // about 1,500 neurons at most: chat's share of the account's free 10,000
export const FREE_BUSY = 'The free AI is busy right now. Try again in a minute, or keep going free with your own OpenRouter account.';
// Step 4, our Vercel AI Gateway (pay per use, no markup): off unless a key AND a daily request cap are set. A request cap is a
// hard ceiling on cost (each call is limited to max_tokens), so a missing or zero cap means the route is never called.
export const VERCEL_URL = 'https://ai-gateway.vercel.sh/v1/chat/completions';
export const VERCEL_MODEL = 'alibaba/qwen3.8-27b';
export const vercelCap = (env) => (env.VERCEL_AI_KEY ? Math.max(0, Math.floor(Number(env.VERCEL_DAILY_REQUESTS) || 0)) : 0);
const WOLF_REST_MS = 10 * 60 * 1000;
// Wolf's free beta has one shared daily budget. Once it says the budget is used up, asking again every 10 minutes only
// adds a failed call (and a "rerouted" row) to every request until midnight, so rest until it resets at 00:00 UTC.
export function wolfRestUntil(error, nowMs) {
  if (/daily|resets at 00:00/i.test(String(error || ''))) {
    const d = new Date(nowMs);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  }
  return nowMs + WOLF_REST_MS;
}
// Cloudflare Workers Free allows 50 outgoing calls per request. Past that every model, search and fetch fails at once,
// so trying the next backup only fails again, and the page said "the free AI is busy" when nothing was busy.
export const SUBREQUESTS_RE = /too many subrequests/i;
export const SUBREQUESTS_USED = 'This task used up the 50 web calls the free plan allows for one request. Send the next step as a new message (or ask it in smaller parts) and chat carries on.';
export const OPENROUTER_TRIES = 6; // free OpenRouter models tried in turn before the next backup
// A short name a person can read: 'google/gemma-4-31b-it:free' -> 'gemma-4-31b-it'.
export const shortModel = (id) => String(id || '').split('/').pop().replace(/:free$/, '').replace(/^@cf\/.*\//, '');
const BACKUP_NAMES = { 'workers-ai': 'Mistral Small 3.1 on Cloudflare', vercel: 'Qwen on Vercel AI Gateway', pollinations: 'Pollinations' };
// The name the page shows for whoever answered a free ask (reply.by). Wolf, the planned model, is not named.
export function modelShown(by) {
  if (!by || by === 'wolf') return '';
  if (by === WORKERS_AI_FALLBACK) return BACKUP_NAMES['workers-ai'];
  if (BACKUP_NAMES[by]) return BACKUP_NAMES[by];
  return `${shortModel(by)} (OpenRouter, free)`;
}
let wolfOutUntil = 0; // after a budget or rate-limit answer, skip Wolf for a while instead of asking it every step
let orModels = { at: 0, ids: null };

// OpenRouter's free models right now (they come and go), in our preferred order first, kept 1 hour.
export async function freeOpenRouterModels(fetchImpl = fetch, now = Date.now()) {
  if (orModels.ids && now - orModels.at < 3_600_000) return orModels.ids;
  let live = [];
  try {
    const res = await fetchImpl('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(4000) });
    const data = (await res.json())?.data || [];
    live = data.filter((m) => String(m?.id || '').endsWith(':free') && !/vl|omni|code/i.test(m.id) && (m.context_length || 0) >= 32000).map((m) => m.id);
  } catch {}
  const ids = live.length ? [...OPENROUTER_PREFERRED.filter((id) => live.includes(id)), ...live.filter((id) => !OPENROUTER_PREFERRED.includes(id))] : OPENROUTER_PREFERRED;
  orModels = { at: now, ids };
  return ids;
}

// Does this message ask for a picture to be drawn (and nothing else)? Jev, a Cloudflare Workers AI decision model, answers a typed
// choice with a confidence, so a weak guess counts as "other". If Jev is unavailable, one cheap Llama call answers one word instead.
// Anything unclear, any error, any missing binding answers null, and the main model handles the message as usual.
export const JEV_MODEL = 'typesafe/jev';
export const JEV_MIN_CONFIDENCE = 0.7;
const JEV_QUESTIONS = {
  wants: {
    type: 'choice',
    instructions: 'What does the user want?',
    criteria: {
      image: 'They want a picture, photo, drawing or illustration generated for them, and nothing else',
      other: 'Anything else: writing or text about pictures, plans, code, websites, videos, charts, questions, edits, analysis',
    },
  },
};
export function imageIntent(env) {
  if (!env?.AI) return null;
  return async (task) => {
    try {
      const j = await env.AI.run(JEV_MODEL, { state: String(task).slice(0, 600), questions: JEV_QUESTIONS });
      const a = j?.answers?.wants;
      if (a?.type === 'choice' && (a.choice === 'image' || a.choice === 'other')) return a.choice === 'image' && Number(a.confidence) >= JEV_MIN_CONFIDENCE ? 'image' : 'other';
    } catch { /* Jev is in early access: fall through to the Llama question */ }
    const r = await env.AI.run(WORKERS_AI_FALLBACK, {
      messages: [
        { role: 'system', content: 'Decide what the user wants. Answer with ONE word. "image" = they want a picture, photo, drawing or illustration generated for them, and nothing else. "other" = anything else: writing or text about pictures, plans, code, websites, videos, charts, questions, edits, analysis. When unsure answer "other".' },
        { role: 'user', content: String(task).slice(0, 600) },
      ],
      max_tokens: 3, temperature: 0,
    });
    const raw = r?.response ?? r?.choices?.[0]?.message?.content ?? '';
    return /^\W*image\b/i.test(String(raw)) ? 'image' : 'other';
  };
}

// One Jev call per ask decides the language and the kind of ask together. Jev is in early access, so any failure answers null and the
// word lists, the regexes and the Llama question keep deciding as before.
export const ASK_TYPES = { weather: 'weather or a forecast', stats: 'numbers, statistics, figures or a chart of data', fact: 'a fact about the world, a person, a place or a thing', image: 'a picture, photo, drawing or illustration generated for them', video: 'a video or clip made for them', code: 'code, a script, a bug fix or a technical how-to', website: 'a website, web page, landing page or app built for them', chat: 'small talk, a greeting, an opinion or advice', other: 'anything else' };
const LANG_CODES = ['en', 'uk', 'ru', 'es', 'de', 'fr', 'it', 'pt', 'pl', 'nl', 'tr', 'cs', 'ro', 'hu', 'sv', 'el', 'ar', 'he', 'hi', 'ja', 'ko', 'zh', 'vi', 'th', 'id'];
const TYPE_Q = { type: { type: 'choice', instructions: 'What kind of ask is this?', criteria: Object.fromEntries(Object.entries(ASK_TYPES).map(([k, v]) => [k, `The user wants ${v}`])) } };
const DECIDE_QUESTIONS = {
  lang: { type: 'choice', instructions: 'Which language is the message written in?', criteria: Object.fromEntries(LANG_CODES.map((c) => [c, `Written in ${c}`])) },
  ...TYPE_Q,
};
// Cost: the free Workers AI allowance is 10,000 neurons a day. The language question (25 criteria) is only asked when the word lists
// could not name the language, and the ask is cut to 300 characters, so a call stays at a few neurons.
export function decide(env) {
  if (!env?.AI) return null;
  return async (task, { needLang = true } = {}) => {
    try {
      const j = await env.AI.run(JEV_MODEL, { state: String(task).slice(0, 300), questions: needLang ? DECIDE_QUESTIONS : TYPE_Q });
      const pick = (k) => { const a = j?.answers?.[k]; return a?.type === 'choice' && typeof a.choice === 'string' ? { choice: a.choice, confidence: Number(a.confidence) || 0 } : null; };
      const l = pick('lang'), t = pick('type');
      const out = {
        lang: l && LANG_CODES.includes(l.choice) && l.confidence >= JEV_MIN_CONFIDENCE ? l.choice : '',
        type: t && t.choice in ASK_TYPES && t.confidence >= JEV_MIN_CONFIDENCE ? t.choice : '',
      };
      return out.lang || out.type ? out : null;
    } catch { return null; }
  };
}

// Jev grades a finished reply: good, or one of the ways a reply goes wrong. A few neurons per ask (300 + 600 characters in). Null when
// Jev is unavailable or not sure, so a reply is never held back or redone on a guess.
export const BAD_REPLIES = { wrong_language: 'It is written in another language than the ask', off_topic: 'It does not answer what was asked', refusal: 'It refuses or says it cannot, with no real attempt', broken: 'It is empty, cut off, or raw code, JSON or markup instead of an answer', ignores_format: 'It ignores the length or format the ask gave (for example "two sentences")' };
const GRADE_QUESTIONS = { verdict: { type: 'choice', instructions: 'Is the reply a good answer to the ask?', criteria: { good: 'It answers the ask, in the ask\'s language, in the asked length and format', ...BAD_REPLIES } } };
export function gradeReply(env) {
  if (!env?.AI) return null;
  return async (task, answer) => {
    try {
      const j = await env.AI.run(JEV_MODEL, { state: `ASK: ${String(task).slice(0, 300)}\nREPLY: ${String(answer).slice(0, 600)}`, questions: GRADE_QUESTIONS });
      const a = j?.answers?.verdict;
      if (a?.type !== 'choice' || !(a.choice === 'good' || a.choice in BAD_REPLIES)) return null;
      return { verdict: a.choice, confidence: Number(a.confidence) || 0, bad: a.choice !== 'good' && Number(a.confidence) >= 0.8 };
    } catch { return null; }
  };
}

// The small fallback model drifts from the person's wording: it ignores "two sentences" and pads with markdown. These rules are added to
// the system message, where it weighs them most.
export const FALLBACK_RULES = 'Follow the length and format the user asks for exactly (for example "two sentences" means two sentences). Answer the question asked, with no extra facts and no closing offer. Write plain text, no ** or # marks, unless the user asks for a list or code.';
export function withFallbackRules(messages = []) {
  const i = messages.findIndex((m) => m.role === 'system');
  if (i < 0) return [{ role: 'system', content: FALLBACK_RULES }, ...messages];
  return messages.map((m, j) => (j === i ? { ...m, content: `${m.content}\n\n${FALLBACK_RULES}` } : m));
}

function workersAiModel(env, overLimit) {
  return async (messages, o = {}) => {
    if (!env.AI) return { error: 'no Workers AI binding', kind: 'provider' };
    if (overLimit && (await overLimit())) return { error: 'the Workers AI fallback is used up for today', kind: 'limit' };
    try {
      // Workers AI streams natively: with onDelta every token goes out as it is written.
      if (typeof o.onDelta === 'function') {
        const s = await env.AI.run(WORKERS_AI_FALLBACK, { messages: withFallbackRules(messages), max_tokens: 1024, temperature: 0, stream: true });
        if (s && typeof s.getReader === 'function') {
          const text = await readAiStream(s, o.onDelta);
          return text.trim() ? { text } : { error: 'the model sent an empty answer', kind: 'empty' };
        }
      }
      const r = await env.AI.run(WORKERS_AI_FALLBACK, { messages: withFallbackRules(messages), max_tokens: 1024, temperature: 0 });
      // Older models answer { response }; newer ones (llama-3.1-8b-fast-v2 behind the same name) answer OpenAI-style choices.
      const raw = r?.response ?? r?.choices?.[0]?.message?.content ?? '';
      const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
      return text.trim() ? { text } : { error: 'the model sent an empty answer', kind: 'empty' };
    } catch (e) {
      return { error: String(e?.message || e).slice(0, 200), kind: 'provider' };
    }
  };
}

// A person's own OpenRouter account on a free model ("Log in with OpenRouter"): when that model is busy, try other free
// models with the same key. The account's own daily free allowance being used up ends it, since every free model shares it.
export const ownFreeOpenRouter = (chosen) => !chosen.free && chosen.ai === 'openrouter' && /:free$/.test(chosen.model || '');
const dailyFreeUsed = (r) => /free-models-per-day|per.?day/i.test(r.error || '');
function ownFreeModel(env, fetchImpl, chosen) {
  return async (messages, o = {}) => {
    // Once words were streamed to the speaker, another model must not start the answer again.
    let streamed = false;
    const onDelta = typeof o.onDelta === 'function' ? (d) => { streamed = true; o.onDelta(d); } : undefined;
    const first = await oneModel(env, fetchImpl, chosen)(messages, { onDelta });
    if (!first.error || streamed || first.kind === 'key' || dailyFreeUsed(first)) return first;
    const others = (await freeOpenRouterModels(fetchImpl)).filter((id) => id !== chosen.model).slice(0, 2);
    for (const id of others) {
      const r = await oneModel(env, fetchImpl, { ...chosen, model: id })(messages);
      if (!r.error) return { ...r, by: id };
      if (dailyFreeUsed(r)) return r;
    }
    return first;
  };
}

// Models announced but not out yet: when the provider says the name does not exist, try these likely names too, then say plainly
// that it is not released. The first name in each list is the one the picker sends.
export const NAME_GUESSES = {
  'gpt-6.2-astra': ['gpt-6.2-astra', 'gpt-6.2', 'gpt-6-astra', 'gpt-6.2-astra-preview', 'gpt-6.2-astra-latest'],
};
export const NOT_RELEASED = (name) => `"${name}" is not released yet: OpenAI does not list it for your key. Flisk tried the likely names and none exists. Pick another model, or try again when OpenAI ships it.`;
function withNameGuesses(make, env, fetchImpl, chosen, trace = () => {}) {
  const names = chosen.ai === 'openai' ? NAME_GUESSES[chosen.model] : null;
  if (!names) return make(env, fetchImpl, chosen);
  return async (messages, o = {}) => {
    let last;
    const tried = [];
    for (const name of names) {
      const r = await make(env, fetchImpl, { ...chosen, model: name })(messages, o);
      if (!r.error || r.kind !== 'model') {
        // Answered by a different name than the one picked, or failed for another reason: a trace says which name, never the key or the prompt.
        if (!r.error && tried.length) trace({ kind: 'rerouted', why: `${chosen.model} not found, tried ${tried.join(', ')}`.slice(0, 300), expected: chosen.model, actual: name });
        else if (!r.error) trace({ kind: 'unexpected', why: `${chosen.model} is not released, yet OpenAI answered it`, expected: chosen.model, actual: name });
        else if (r.error) trace({ kind: 'error', why: `${name}: ${r.kind || 'error'}`, expected: chosen.model, actual: 'none', detail: [...tried, name].join(', ').slice(0, 300) });
        return r;
      }
      tried.push(name);
      last = r;
    }
    trace({ kind: 'error', why: 'model not released: OpenAI answered not found for every name', expected: chosen.model, actual: 'none', detail: tried.join(', ').slice(0, 300) });
    return { ...last, error: NOT_RELEASED(chosen.model), kind: 'model' };
  };
}

// Languages the Workers AI fallback is trusted in (the old Llama 3.1 8B list, kept): anything else (Ukrainian, Russian, Arabic...) tries the other backups first.
const WORKERS_AI_LANGS = new Set(['en', 'de', 'fr', 'it', 'pt', 'hi', 'es', 'th']);
export function modelFrom(env = {}, fetchImpl = fetch, chosen = { ai: 'wolf', free: true }, { overLimit = null, overVercel = null, now = () => Date.now(), log = () => {}, trace = () => {} } = {}) {
  if (ownFreeOpenRouter(chosen)) return ownFreeModel(env, fetchImpl, chosen);
  if (!chosen.free) return withNameGuesses(oneModel, env, fetchImpl, chosen, trace);
  const wolf = oneModel(env, fetchImpl, chosen);
  const workers = workersAiModel(env, overLimit);
  return async (messages, o = {}) => {
    const tried = [];
    const lang = String(o.lang || '').slice(0, 2).toLowerCase();
    // Llama 8B on Workers AI is weak outside its supported languages, so those requests try the stronger backups first.
    const weakHere = !!lang && !WORKERS_AI_LANGS.has(lang);
    // Wolf is the planned first stop. Whoever answers instead is a reroute worth a row, with the reason.
    // Whether wolf was skipped is decided once, before anything runs, so a pause that ends mid-request cannot change the story.
    const skipped = now() < wolfOutUntil;
    const rest = skipped ? Math.max(1, Math.ceil((wolfOutUntil - now()) / 60000)) : 0;
    // The page shows each switch while it happens ("Flisk Wolf is busy, switching to ..."), so a slow free answer is never a silent wait.
    const say = (text) => { try { o.onReroute?.(text); } catch {} };
    // A skipped Wolf was not asked, so the first switch says it is resting, not "busy" (it said both, on every step).
    let prev = skipped ? '' : 'Flisk Wolf';
    const switchTo = (name) => { say(prev ? `${prev} is busy, switching to ${name}` : `Flisk Wolf is resting after a limit, using ${name}`); prev = name; };
    // Out of subrequests: no backup can be reached either, and the trace call itself is a subrequest, so stop here.
    const outOfCalls = (r) => SUBREQUESTS_RE.test(String(r?.error || ''));
    const noCalls = () => { log(tried); return { error: SUBREQUESTS_USED, kind: 'subrequests' }; };
    const rerouted = (by, model) => {
      if (by === 'wolf') return;
      const why = [skipped ? `wolf skipped: resting ${rest} more min after a limit` : '', ...tried].filter(Boolean).join('; ') || 'wolf did not answer';
      trace({ kind: 'rerouted', why: why.slice(0, 300), expected: 'wolf', actual: model && model !== by ? `${by} (${model})` : by, detail: `answered by ${model || by} after ${tried.length} failed${lang ? ` · lang ${lang}` : ''}`, lang: lang || undefined });
    };
    if (now() >= wolfOutUntil) {
      const r = await wolf(messages, { effort: o.effort });
      if (!r.error) return { ...r, by: 'wolf' };
      tried.push(`wolf: ${r.error}`);
      if (outOfCalls(r)) return noCalls();
      if (r.kind === 'limit') wolfOutUntil = wolfRestUntil(r.error, now());
    }
    if (env.OPENROUTER_KEY) {
      const ids = (await freeOpenRouterModels(fetchImpl)).slice(0, OPENROUTER_TRIES);
      for (const id of ids) {
        switchTo(`${shortModel(id)} (OpenRouter, free)`);
        const r = await oneModel(env, fetchImpl, { ai: 'openrouter', url: OPENROUTER_URL, model: id, key: env.OPENROUTER_KEY, referer: true })(messages);
        if (!r.error) { rerouted('openrouter', id); return { ...r, by: id }; }
        tried.push(`${id}: ${r.error}`);
        if (outOfCalls(r)) return noCalls();
        if (dailyFreeUsed(r)) break; // the key's daily free allowance is shared by every free model
      }
    }
    const viaWorkers = async () => {
      switchTo(BACKUP_NAMES['workers-ai']);
      const r = await workers(messages, { onDelta: o.onDelta });
      if (!r.error) { rerouted('workers-ai', WORKERS_AI_FALLBACK); return { ...r, by: WORKERS_AI_FALLBACK }; }
      tried.push(`workers-ai: ${r.error}`);
      return outOfCalls(r) ? noCalls() : null;
    };
    const viaBackups = async () => {
      if (vercelCap(env) && !(overVercel && (await overVercel(vercelCap(env))))) {
        switchTo(BACKUP_NAMES.vercel);
        const v = await oneModel(env, fetchImpl, { ai: 'vercel', url: env.VERCEL_URL || VERCEL_URL, model: env.VERCEL_MODEL || VERCEL_MODEL, key: env.VERCEL_AI_KEY, ms: 60_000 })(messages);
        if (!v.error) { rerouted('vercel', env.VERCEL_MODEL || VERCEL_MODEL); return { ...v, by: 'vercel' }; }
        tried.push(`vercel: ${v.error}`);
        if (outOfCalls(v)) return noCalls();
      }
      if (env.NO_POLLINATIONS !== '1') {
        switchTo(BACKUP_NAMES.pollinations);
        const p = await oneModel(env, fetchImpl, { ai: 'pollinations', url: env.POLLINATIONS_TEXT_URL || POLLINATIONS_TEXT_URL, model: 'openai', key: '-', referer: true, ms: POLLINATIONS_MS })(messages);
        if (!p.error) { rerouted('pollinations', 'openai'); return { ...p, by: 'pollinations' }; }
        tried.push(`pollinations: ${p.error}`);
        if (outOfCalls(p)) return noCalls();
      }
      return null;
    };
    const order = weakHere ? [viaBackups, viaWorkers] : [viaWorkers, viaBackups];
    for (const step of order) { const hit = await step(); if (hit) return hit; }
    log(tried);
    trace({ kind: 'error', why: 'every free model failed', expected: 'wolf', actual: 'none', detail: `${tried.join('; ')}${lang ? ` · lang ${lang}` : ''}`.slice(0, 300), lang: lang || undefined });
    return { error: FREE_BUSY, kind: 'busy' };
  };
}

// Tests only: forget that Wolf was out and the cached OpenRouter list.
export function resetFallbacks() { wolfOutUntil = 0; orModels = { at: 0, ids: null }; }

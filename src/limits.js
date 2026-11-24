import { sendTrace } from './trace.js';
// Daily allowances. One place decides how much each kind of request may use per day, for a signed-in login or an
// anonymous visitor (counted by network address, not by cookie: a cookie can be thrown away, so their share is smaller).
// Counters live in Cloudflare's Cache API: no storage writes, and not exact across data centres.
import { WORKERS_AI_PER_DAY } from './model.js';

export const TASKS_PER_DAY = 20;
export const ANON_TASKS_PER_DAY = 10;
export const VOICE_PER_DAY = 60;
export const ANON_VOICE_PER_DAY = 20;
// The mic sends one request per spoken phrase (it writes while you talk), so phrases have their own, larger allowance.
export const VOICE_PARTS_PER_DAY = 400;
export const ANON_VOICE_PARTS_PER_DAY = 120;
export const TALK_PER_DAY = 100;
export const ANON_TALK_PER_DAY = 30;
export const MEMO_PER_DAY = 120;
export const ANON_MEMO_PER_DAY = 40;
export const SPEAK_PER_DAY = 2000;
export const ANON_SPEAK_PER_DAY = 600; // one ask per sentence: 150 ran out after a few talks and the page fell back to the robotic browser voice
export const ANON_PER_PERSON_BACKUP = 10;
// The free model's last fallback (Workers AI on our account) has one daily cap for everyone, so chat keeps to its share.
// Each person may use only a share of it, so one busy visitor cannot use up the day for everybody.
export const WORKERS_AI_PER_PERSON = 40;

// kind -> [signed-in limit, anonymous limit, counter name for signed-in, counter name for anonymous]
const KINDS = {
  chat: [TASKS_PER_DAY, ANON_TASKS_PER_DAY, 'chat-limit', 'chat-anon'],
  voice: [VOICE_PER_DAY, ANON_VOICE_PER_DAY, 'voice-limit', 'voice-anon'],
  'voice-part': [VOICE_PARTS_PER_DAY, ANON_VOICE_PARTS_PER_DAY, 'voice-part-limit', 'voice-part-anon'],
  talk: [TALK_PER_DAY, ANON_TALK_PER_DAY, 'talk-limit', 'talk-anon'],
  memo: [MEMO_PER_DAY, ANON_MEMO_PER_DAY, 'memo-limit', 'memo-anon'],
  speak: [SPEAK_PER_DAY, ANON_SPEAK_PER_DAY, 'speak-limit', 'speak-anon'],
};

export const limitOf = (kind, anon) => KINDS[kind][anon ? 1 : 0];
const scopeOf = (kind, anon) => KINDS[kind][anon ? 3 : 2];

export async function overDailyLimit(login, { cache = globalThis.caches?.default, now = Date.now(), limit = TASKS_PER_DAY, scope = 'chat-limit' } = {}) {
  if (!cache) return false;
  const url = `https://${scope}.invalid/${encodeURIComponent(login)}/${new Date(now).toISOString().slice(0, 10)}`;
  try {
    const hit = await cache.match(url);
    const count = hit ? Number(await hit.text()) || 0 : 0;
    if (count >= limit) return true;
    await cache.put(url, new Response(String(count + 1), { headers: { 'cache-control': 'max-age=90000' } }));
  } catch {}
  return false;
}

// A free task the free AI never answered (every free model busy) gives its count back, so "busy" does not use up the day.
export async function refundDailyLimit(login, { cache = globalThis.caches?.default, now = Date.now(), scope = 'chat-limit' } = {}) {
  if (!cache) return;
  const url = `https://${scope}.invalid/${encodeURIComponent(login)}/${new Date(now).toISOString().slice(0, 10)}`;
  try {
    const hit = await cache.match(url);
    const count = hit ? Number(await hit.text()) || 0 : 0;
    if (count > 0) await cache.put(url, new Response(String(count - 1), { headers: { 'cache-control': 'max-age=90000' } }));
  } catch {}
}

// Spend one unit of a kind's daily allowance. `id` is the counted identity (a login, or a hash of the network address).
// Resolves true when the day's allowance is already used up.
export const overQuota = (env, kind, { anon, id }) => overDailyLimit(id, { cache: env.LIMIT_CACHE, limit: limitOf(kind, anon), scope: scopeOf(kind, anon) });
export const refundQuota = (env, kind, { anon, id }) => refundDailyLimit(id, { cache: env.LIMIT_CACHE, scope: scopeOf(kind, anon) });

// What a person has used today, read only (nothing is counted). Same keys as overDailyLimit, so the numbers match what the gate enforces.
export async function usedToday(id, { cache = globalThis.caches?.default, scope, now = Date.now() }) {
  if (!cache) return 0;
  try {
    const hit = await cache.match(`https://${scope}.invalid/${encodeURIComponent(id)}/${new Date(now).toISOString().slice(0, 10)}`);
    return hit ? Math.max(0, Number(await hit.text()) || 0) : 0;
  } catch { return 0; }
}
export const usageOf = async (env, kind, { anon, id }) => ({ used: await usedToday(id, { cache: env.LIMIT_CACHE, scope: scopeOf(kind, anon) }), limit: limitOf(kind, anon) });

// The 429 body of a used-up free-task day, with the time until the counters reset (midnight UTC).
export function taskLimitBody(anon, now = new Date()) {
  const limit = limitOf('chat', anon);
  const resetsIn = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime();
  return { error: `That's your ${limit} free tasks for today`, limit, resetsIn, anon };
}

// Wraps a model so the task can tell, at its end, whether the model answered even once.
// A task (a website, code, a video) thinks harder than a chat reply: Flisk Wolf is asked at medium reasoning effort, chat at low.
export function answeredModel(model, defaults = { effort: 'medium' }) {
  let answered = false;
  const ask = async (messages, o = {}) => {
    const r = await model(messages, { ...defaults, ...o });
    if (!r?.error) answered = true;
    return r;
  };
  return { ask, answered: () => answered };
}

export const freeModelOpts = (env, login = '', anon = false) => ({
  overLimit: async () => (login && (await overDailyLimit(login, { cache: env.LIMIT_CACHE, limit: anon ? ANON_PER_PERSON_BACKUP : WORKERS_AI_PER_PERSON, scope: anon ? 'workers-ai-anon' : 'workers-ai-person' }))) || overDailyLimit('everyone', { cache: env.LIMIT_CACHE, limit: WORKERS_AI_PER_DAY, scope: 'workers-ai-fallback' }),
  overVercel: (cap) => overDailyLimit('everyone', { cache: env.LIMIT_CACHE, limit: cap, scope: 'vercel-backup' }),
  log: (tried) => console.log('free model fallbacks all failed', JSON.stringify(tried).slice(0, 600)),
  trace: (event) => sendTrace(env, { route: '/api/run', ...event }),
});

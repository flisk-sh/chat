import { githubAuthorizeUrl, githubLogin } from './auth.js';
import { fleetClient } from './fleet.js';
import { BYO_STEPS, cleanFiles, MAX_STEPS, MAX_TASK, modelFrom, resolveModel, runTask } from './loop.js';
import { appPage, cleanModels, DEFAULT_MODELS, messagePage, PROVIDER_CARDS, reviewsPage } from './page.js';
import { deleteSettings, loadSettings, saveSettings } from './keys.js';
import { githubWebhook, REVIEWS_PER_DAY } from './review.js';
import { clearSession, makeSession, readSession, sameOrigin } from './session.js';

export const TASKS_PER_DAY = 20;
export const MAX_SITE_BYTES = 200 * 1024;
export const SITES_PER_LOGIN = 5;
export const VIDEOS_PER_LOGIN = 5;
export const VOICE_PER_DAY = 60;
export const MAX_AUDIO_B64 = 1_400_000; // about 1 MB of audio, a minute of speech
export const WHISPER_MODEL = '@cf/openai/whisper-large-v3-turbo';
export const TALK_PER_DAY = 100;
export const TALK_SYSTEM = `You are Flisk Oracle, a voice you talk to on chat.flisk.si. Your reply is read aloud, so:
- Answer in one to three short sentences of plain spoken words. No Markdown, no lists, no tables, no links, no code, no emoji.
- Be warm, direct and sure of yourself, like a wise oracle who also knows practical things. Give the answer first.
- If the person asks you to build or make something (a website, an app, a video), say in one sentence what you would make, then tell them to say "build it" or type it in the chat to have it made on a real computer.
- Never invent phone numbers, emails, prices or addresses. If you do not know, say so in a few words.
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
// Whisper's language code -> the name the model understands, so the reply comes back in the language spoken.
export const LANG_NAMES = { en: 'English', uk: 'Ukrainian', ru: 'Russian', es: 'Spanish', de: 'German', fr: 'French', it: 'Italian', pt: 'Portuguese', pl: 'Polish', nl: 'Dutch', tr: 'Turkish', cs: 'Czech', sk: 'Slovak', ro: 'Romanian', hu: 'Hungarian', sv: 'Swedish', da: 'Danish', no: 'Norwegian', fi: 'Finnish', el: 'Greek', bg: 'Bulgarian', sr: 'Serbian', hr: 'Croatian', be: 'Belarusian', ka: 'Georgian', he: 'Hebrew', ar: 'Arabic', fa: 'Persian', hi: 'Hindi', ja: 'Japanese', ko: 'Korean', zh: 'Chinese', vi: 'Vietnamese', th: 'Thai', id: 'Indonesian', ms: 'Malay', kk: 'Kazakh', lt: 'Lithuanian', lv: 'Latvian', et: 'Estonian', sl: 'Slovenian' };
export function talkMessages(history, lang = '') {
  const turns = (Array.isArray(history) ? history : [])
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1000) }));
  const name = LANG_NAMES[String(lang).slice(0, 2)];
  const sys = name ? `${TALK_SYSTEM}\nThe person is speaking ${name}. Reply only in ${name}.` : TALK_SYSTEM;
  return [{ role: 'system', content: sys }, ...turns];
}

// Speech to text for the mic button: the browser records, Workers AI Whisper writes it down. Works in every browser,
// unlike the browser's own speech recognition (missing in Firefox, broken in Arc, Brave and in-app browsers).
export async function transcribe(env, body) {
  const audio = typeof body?.audio === 'string' ? body.audio : '';
  if (!audio) return { status: 400, error: 'no audio was recorded' };
  if (audio.length > MAX_AUDIO_B64) return { status: 413, error: 'keep it under a minute' };
  if (!/^[A-Za-z0-9+/=]+$/.test(audio)) return { status: 400, error: 'the recording was not readable' };
  if (!env.AI) return { status: 503, error: 'voice is not set up on this server' };
  try {
    const r = await env.AI.run(WHISPER_MODEL, { audio });
    const lang = String(r?.transcription_info?.language || '').toLowerCase().replace(/[^a-z-]/g, '').slice(0, 8);
    return { status: 200, text: String(r?.text || '').trim(), lang };
  } catch (e) {
    return { status: 502, error: 'could not hear that, try again: ' + String(e?.message || e).slice(0, 120) };
  }
}
const SITE_DAYS = 7;

// The model picker's list comes from inference (/v1/catalog), so a model added there shows up here with no chat change.
// Read through the service binding (a Worker cannot fetch another Worker on the same domain), kept 5 minutes per isolate.
let catalog = { at: 0, models: null };
export async function loadCatalog(env, now = Date.now()) {
  if (catalog.models && now - catalog.at < 300_000) return catalog.models;
  if (!env.INFERENCE) return DEFAULT_MODELS;
  try {
    const origin = new URL(env.INFERENCE_URL || 'https://inference.flisk.si/v1/chat/completions').origin;
    const res = await env.INFERENCE.fetch(`${origin}/v1/catalog`, { signal: AbortSignal.timeout(1500) });
    const models = res.ok ? cleanModels((await res.json())?.data) : DEFAULT_MODELS;
    catalog = { at: now, models };
    return models;
  } catch {
    return catalog.models || DEFAULT_MODELS;
  }
}

const SECURITY = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'same-origin',
  'strict-transport-security': 'max-age=31536000',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src 'self' https://openrouter.ai/api/v1/models; form-action 'self' https://github.com; frame-ancestors 'none'; base-uri 'none'",
};
const html = (body, status = 200, extra = {}) => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...SECURITY, ...extra } });
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
const redirect = (location, extra = {}) => new Response(null, { status: 303, headers: { location, ...extra } });
const readJson = async (request) => {
  try {
    const v = JSON.parse((await request.text()) || '{}');
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
};

// A counter per login per day in Cloudflare's Cache API: no storage writes, and not exact across data centres.
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

const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');

// A site a task made: stored as one HTML file, linked by an unguessable id, kept 7 days, the oldest dropped over 5.
export async function publishSite(env, login, content, origin) {
  const bytes = new TextEncoder().encode(String(content)).length;
  if (!/<html|<!doctype|<body|<h1|<div/i.test(content)) return { error: 'that file is not an HTML page' };
  if (bytes > MAX_SITE_BYTES) return { error: `the page is ${bytes} bytes; the limit is ${MAX_SITE_BYTES}` };
  const id = hex(8);
  await env.DB.prepare('INSERT INTO sites (id, login, html, created) VALUES (?, ?, ?, ?)').bind(id, login, content, new Date().toISOString()).run();
  await env.DB.prepare('DELETE FROM sites WHERE login = ? AND id NOT IN (SELECT id FROM sites WHERE login = ? ORDER BY created DESC LIMIT ?)').bind(login, login, SITES_PER_LOGIN).run();
  return { url: `${origin}/s/${id}` };
}

// A video a task made: kept as base64 parts in D1 (a row holds at most 2 MB), linked by an unguessable id, 7 days,
// the oldest dropped over VIDEOS_PER_LOGIN.
export async function saveVideo(env, login, parts, title, origin) {
  if (!Array.isArray(parts) || !parts.length) return { error: 'the video is empty' };
  const id = hex(8);
  const created = new Date().toISOString();
  await env.DB.batch(parts.map((data, i) => env.DB.prepare('INSERT INTO videos (id, part, login, title, data, created) VALUES (?, ?, ?, ?, ?, ?)').bind(id, i, login, String(title || '').slice(0, 60), data, created)));
  await env.DB.prepare('DELETE FROM videos WHERE login = ? AND id NOT IN (SELECT id FROM videos WHERE login = ? GROUP BY id ORDER BY MAX(created) DESC LIMIT ?)').bind(login, login, VIDEOS_PER_LOGIN).run();
  return { url: `${origin}/v/${id}.mp4` };
}

const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// Serves the mp4 with byte ranges, which Safari needs to play a <video>.
async function videoResponse(env, id, request) {
  const { results = [] } = await env.DB.prepare('SELECT part, data, created FROM videos WHERE id = ? ORDER BY part').bind(id).all();
  if (!results.length || Date.now() - Date.parse(results[0].created) > SITE_DAYS * 86400_000) return null;
  const chunks = results.map((r) => unb64(r.data));
  const size = chunks.reduce((n, c) => n + c.length, 0);
  const all = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) {
    all.set(c, o);
    o += c.length;
  }
  const headers = { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex, nofollow' };
  const m = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') || '');
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    let end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { ...headers, 'content-range': `bytes */${size}` } });
    return new Response(all.slice(start, end + 1), { status: 206, headers: { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(end - start + 1) } });
  }
  return new Response(all, { headers: { ...headers, 'content-length': String(size) } });
}

// The page opens in its own sandbox (no cookies, no access to chat), with a bar saying who made it.
function siteResponse(row) {
  const bar = `<div style="position:fixed;left:0;right:0;bottom:0;background:#111;color:#eee;font:12px ui-monospace,Menlo,monospace;padding:6px 10px;z-index:2147483647">Made with Flisk Chat by @${String(row.login).replace(/[^A-Za-z0-9-]/g, '')} · anyone can make a page here, so only enter what you would enter on any site · <a style="color:#7ee787" href="https://github.com/flisk-sh/fleet/issues/new?title=Report%20chat%20page%20${row.id}">report</a></div>`;
  const body = /<\/body>/i.test(row.html) ? row.html.replace(/<\/body>/i, `${bar}</body>`) : row.html + bar;
  return new Response(body, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "sandbox allow-scripts allow-forms; default-src 'unsafe-inline' data: blob:; connect-src 'none'",
      'x-content-type-options': 'nosniff',
      'x-robots-tag': 'noindex, nofollow',
      'referrer-policy': 'no-referrer',
      'cache-control': 'private, max-age=60',
    },
  });
}

// A HEAD request (link checkers, uptime monitors) gets the same status and headers as GET, with no body.
export async function handle(request, env = {}, opts = {}) {
  if (request.method === 'HEAD' && !/^\/v\//.test(new URL(request.url).pathname)) {
    const res = await handleRequest(new Request(request.url, { method: 'GET', headers: request.headers }), env, opts);
    return new Response(null, { status: res.status, headers: res.headers });
  }
  return handleRequest(request, env, opts);
}

async function handleRequest(request, env = {}, { fetchImpl = fetch, waitUntil = null } = {}) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const origin = env.PUBLIC_ORIGIN || url.origin;

  if (request.method === 'GET' && path === '/favicon.ico') return new Response(null, { status: 204, headers: { 'cache-control': 'public, max-age=86400' } });
  if (request.method === 'GET' && path === '/robots.txt') return new Response('User-agent: *\nDisallow: /s/\nDisallow: /v/\nDisallow: /api/\n', { headers: { 'content-type': 'text/plain' } });

  // Is chat able to reach what it depends on? No sign-in, no secrets, only status codes.
  if (request.method === 'GET' && path === '/health') {
    const probe = async (u, call = fetchImpl) => {
      try {
        const r = await call(u, { method: 'GET', headers: { 'user-agent': 'flisk-chat-health' } });
        const text = r.status >= 500 || r.status === 403 ? (await r.text()).slice(0, 120) : '';
        return { status: r.status, ...(text ? { body: text } : {}) };
      } catch (e) {
        return { status: 0, error: String(e?.message || e).slice(0, 120) };
      }
    };
    const fleet = (env.FLEET_URL || 'https://fleet.flisk.si').replace(/\/$/, '');
    const inference = new URL(env.INFERENCE_URL || 'https://inference.flisk.si/v1/chat/completions').origin;
    return json(200, { fleet: await probe(`${fleet}/v1/prices`), inference: await probe(`${inference}/v1/models`, env.INFERENCE ? (u, init) => env.INFERENCE.fetch(u, init) : fetchImpl) });
  }

  // GitHub App: "@flisk-chat review" on a pull request (signed webhook, no session).
  if (request.method === 'POST' && path === '/github/webhook') return githubWebhook(request, { ...env, PUBLIC_ORIGIN: origin }, { fetchImpl, waitUntil, overLimit: (login) => overDailyLimit(login, { cache: env.LIMIT_CACHE, limit: REVIEWS_PER_DAY, scope: 'review-limit' }) });

  const sm = /^\/s\/([a-f0-9]{16})$/.exec(path);
  if (sm && request.method === 'GET') {
    const row = await env.DB.prepare('SELECT * FROM sites WHERE id = ?').bind(sm[1]).first();
    if (!row || Date.now() - Date.parse(row.created) > SITE_DAYS * 86400_000) return html(messagePage('Page not found', 'This page expired or never existed.'), 404);
    return siteResponse(row);
  }

  const vm = /^\/v\/([a-f0-9]{16})\.mp4$/.exec(path);
  if (vm && (request.method === 'GET' || request.method === 'HEAD')) {
    const res = await videoResponse(env, vm[1], request);
    return res || html(messagePage('Video not found', 'This video expired or never existed.'), 404);
  }

  if (request.method === 'GET' && path === '/auth/start') {
    if (!env.SESSION_SECRET) return html(messagePage('Sign-in is not set up', 'This copy of chat has no session secret yet.'), 503);
    if (await readSession(env, request)) return redirect('/');
    if (env.DEV_LOGIN) return redirect('/', { 'set-cookie': await makeSession(env, env.DEV_LOGIN) });
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) return html(messagePage('Sign-in is not set up', 'GitHub sign-in has not been connected yet.'), 503);
    const state = crypto.randomUUID();
    const headers = new Headers({ location: githubAuthorizeUrl({ ...env, PUBLIC_ORIGIN: origin }, state) });
    headers.append('set-cookie', `chat_state=${state}; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
    return new Response(null, { status: 302, headers });
  }
  if (request.method === 'GET' && path === '/auth/callback') {
    const state = url.searchParams.get('state') || '';
    const cookie = /(?:^|;\s*)chat_state=([^;]+)/.exec(request.headers.get('cookie') || '')?.[1] || '';
    const code = url.searchParams.get('code') || '';
    if (!env.SESSION_SECRET || !code || !state || state !== cookie) return html(messagePage('Sign-in failed', 'The sign-in link expired. Start again.'), 400);
    const login = await githubLogin(env, code, fetchImpl);
    if (!login) return html(messagePage('Sign-in failed', "GitHub didn't confirm the sign-in. Start again."), 400);
    const headers = new Headers({ location: '/' });
    headers.append('set-cookie', await makeSession(env, login));
    headers.append('set-cookie', 'chat_state=; Path=/auth; Max-Age=0');
    return new Response(null, { status: 303, headers });
  }
  if (request.method === 'GET' && path === '/auth/signout') return redirect('/', { 'set-cookie': clearSession() });

  const session = await readSession(env, request);
  if (request.method === 'GET' && path === '/') {
    const models = await loadCatalog(env);
    if (!session) return html(appPage({ login: null, connected: [], models }));
    const connections = await fleetClient(env, session.login, fetchImpl).connections().catch(() => ({}));
    return html(appPage({ login: session.login, connected: Object.keys(connections), models }));
  }

  if (request.method === 'GET' && path === '/reviews') {
    if (!session) return redirect('/auth/start');
    return html(reviewsPage({ login: session.login, saved: await loadSettings(env, session.login).catch(() => null), stored: !!env.KEY_SECRET, limit: REVIEWS_PER_DAY, flash: url.searchParams.get('ok') || '' }));
  }
  if (request.method === 'POST' && (path === '/reviews/save' || path === '/reviews/delete')) {
    if (!session) return redirect('/auth/start');
    if (!sameOrigin(request, origin)) return html(messagePage('Not allowed', 'This only works from the chat page.'), 403);
    if (path === '/reviews/delete') {
      await deleteSettings(env, session.login);
      return redirect('/reviews?ok=deleted');
    }
    const f = await request.formData().catch(() => null);
    const chosen = resolveModel({ ai: String(f?.get('ai') || ''), key: String(f?.get('key') || ''), model: String(f?.get('model') || '') });
    if (chosen.error || chosen.free) return html(reviewsPage({ login: session.login, saved: await loadSettings(env, session.login).catch(() => null), stored: true, limit: REVIEWS_PER_DAY, error: chosen.error || 'pick an AI', form: { ai: String(f?.get('ai') || ''), model: String(f?.get('model') || '') } }), 400);
    const r = await saveSettings(env, session.login, { ai: chosen.ai, model: chosen.model, key: chosen.key });
    return r.error ? html(messagePage('Not saved', r.error), 503) : redirect('/reviews?ok=saved');
  }

  if (path.startsWith('/api/')) {
    if (!session) return json(401, { error: 'sign in first' });
    if (request.method !== 'POST' || !sameOrigin(request, origin)) return json(403, { error: 'this only works from chat itself' });
    const { login } = session;
    const fleet = fleetClient(env, login, fetchImpl);

    if (path === '/api/connect') {
      const body = await readJson(request);
      const card = PROVIDER_CARDS.find((c) => c.id === body?.provider);
      if (!card) return json(400, { error: 'pick one of the providers' });
      const r = await fleet.connect(card.id, String(body.key || ''));
      return r.error ? json(400, { error: r.error }) : json(200, { ok: true });
    }

    if (path === '/api/transcribe') {
      const body = await readJson(request);
      if (await overDailyLimit(login, { cache: env.LIMIT_CACHE, limit: VOICE_PER_DAY, scope: 'voice-limit' })) return json(429, { error: `You've used today's ${VOICE_PER_DAY} voice messages. Type instead, or come back tomorrow.` });
      const r = await transcribe(env, body);
      return r.error ? json(r.status, { error: r.error }) : json(200, { text: r.text, lang: r.lang });
    }

    if (path === '/api/talk') {
      const body = await readJson(request);
      // One round trip per spoken turn: the audio comes with the request, is written down here, then answered.
      let heard = '', lang = String(body?.lang || '').slice(0, 8);
      if (body?.audio) {
        if (await overDailyLimit(login, { cache: env.LIMIT_CACHE, limit: VOICE_PER_DAY, scope: 'voice-limit' })) return json(429, { error: `You've used today's ${VOICE_PER_DAY} voice messages. Come back tomorrow.` });
        const t = await transcribe(env, body);
        if (t.error) return json(t.status, { error: t.error });
        heard = t.text;
        lang = t.lang || lang;
        if (!heard) return json(200, { heard: '', lang, text: '' });
      }
      const history = Array.isArray(body?.history) ? body.history.slice(-12) : [];
      if (heard) history.push({ role: 'user', content: heard });
      const messages = talkMessages(history, lang);
      if (messages.length < 2 || messages[messages.length - 1].role !== 'user') return json(400, { error: 'say something first' });
      const chosen = resolveModel(body.ai);
      if (chosen.error) return json(400, { error: chosen.error, kind: chosen.kind });
      if (chosen.free && (await overDailyLimit(login, { cache: env.LIMIT_CACHE, limit: TALK_PER_DAY, scope: 'talk-limit' }))) return json(429, { error: `That's today's ${TALK_PER_DAY} free voice replies. Come back tomorrow, or pick your own AI key.` });
      const r = await modelFrom(env, fetchImpl, chosen)(messages);
      if (r.error) return json(502, { error: r.error, kind: r.kind });
      const text = spokenReply(r.text);
      return text ? json(200, { heard, lang, text }) : json(502, { error: 'the model sent an empty answer' });
    }

    if (path === '/api/run') {
      const body = await readJson(request);
      const task = String(body?.task || '').trim();
      if (!task) return json(400, { error: 'type a task' });
      if (task.length > MAX_TASK) return json(400, { error: `keep the task under ${MAX_TASK} characters` });
      const connections = await fleet.connections().catch(() => null);
      if (connections === null) return json(502, { error: 'chat could not reach fleet, try again in a minute' });
      if (!Object.keys(connections).length) return json(409, { error: 'connect a computer first', needProvider: true });
      // Which AI answers, and which of the user's computers may be used (empty = fleet picks the cheapest).
      const chosen = resolveModel(body.ai);
      if (chosen.error) return json(400, { error: chosen.error, kind: chosen.kind });
      const order = Array.isArray(body.providers) ? [...new Set(body.providers.map(String))].slice(0, 20) : [];
      const missing = order.find((p) => !connections[p]);
      if (missing) return json(400, { error: `${missing} is not connected yet. Connect it, or tick another computer` });
      // Only the shared free model counts against the daily cap; the visitor's own key costs us nothing.
      if (chosen.free && (await overDailyLimit(login, { cache: env.LIMIT_CACHE }))) {
        const now = new Date();
        const resetsIn = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime();
        return json(429, { error: `You've used today's ${TASKS_PER_DAY} free tasks`, limit: TASKS_PER_DAY, resetsIn });
      }
      const { readable, writable } = new TransformStream();
      const w = writable.getWriter();
      const enc = new TextEncoder();
      const emit = (e) => w.write(enc.encode(JSON.stringify(e) + '\n')).catch(() => {});
      const job = runTask({ task, history: body.history, model: modelFrom(env, fetchImpl, chosen), maxSteps: chosen.free ? MAX_STEPS : BYO_STEPS, computer: fleet, fetchImpl, order, files: cleanFiles(body.files), vision: !chosen.free && body.ai?.vision !== false, publish: (content) => publishSite(env, login, content, origin), saveVideo: (parts, title) => saveVideo(env, login, parts, title, origin), emit })
        .then((r) => emit({ type: 'done', ms: r.ms, error: r.error }))
        .catch((e) => emit({ type: 'error', error: String(e?.message || e).slice(0, 200) }))
        .finally(() => w.close().catch(() => {}));
      if (waitUntil) waitUntil(job);
      return new Response(readable, { headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } });
    }
  }
  return html(messagePage('Page not found', 'Nothing lives at this address.'), 404);
}

export default {
  fetch: (request, env, ectx) =>
    handle(request, env, { waitUntil: ectx?.waitUntil ? (p) => ectx.waitUntil(p) : null }).catch((e) => json(500, { error: 'chat failed: ' + String(e?.message || e).slice(0, 200) })),
};

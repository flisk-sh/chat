import { githubAuthorizeUrl, githubLogin } from './auth.js';
import { fleetClient } from './fleet.js';
import { cleanFiles, MAX_TASK, modelFrom, resolveModel, runTask } from './loop.js';
import { appPage, cleanModels, DEFAULT_MODELS, messagePage, PROVIDER_CARDS, reviewsPage } from './page.js';
import { deleteSettings, loadSettings, saveSettings } from './keys.js';
import { githubWebhook, REVIEWS_PER_DAY } from './review.js';
import { clearSession, makeSession, readSession, sameOrigin } from './session.js';

export const TASKS_PER_DAY = 20;
export const MAX_SITE_BYTES = 200 * 1024;
export const SITES_PER_LOGIN = 5;
export const VIDEOS_PER_LOGIN = 5;
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

export async function handle(request, env = {}, { fetchImpl = fetch, waitUntil = null } = {}) {
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
    if (chosen.error || chosen.free) return html(messagePage('Not saved', chosen.error || 'pick an AI'), 400);
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
      const job = runTask({ task, history: body.history, model: modelFrom(env, fetchImpl, chosen), computer: fleet, fetchImpl, order, files: cleanFiles(body.files), publish: (content) => publishSite(env, login, content, origin), saveVideo: (parts, title) => saveVideo(env, login, parts, title, origin), emit })
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

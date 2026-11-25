import { OG_PNG } from './og.js';
import { TOUCH_ICON_PNG } from './touch-icon.js';
import { cleanMemo, memoMessages } from './memo.js';
import { detectLang, resolveLang } from './lang.js';
import { verifyLoginToken } from './login-token.js';
import { githubAuthorizeUrl, githubLogin } from './auth.js';
import { forgetGithubToken, loadGithubToken, saveGithubToken } from './github.js';
import { THREE_SRC, TEXTURES } from './earth.js';
import { fleetClient } from './fleet.js';
import { BYO_STEPS, GITHUB_STEPS, cleanFiles, MAX_STEPS, MAX_TASK, runTask } from './loop.js';
import { decide, gradeReply, imageIntent, modelFrom, modelLabel, resolveModel } from './model.js';
import { lookup } from './lookup.js';
import { cleanMode, formatResults, searchWeb } from './search.js';
import { answer as answerApi, BUILD_SYSTEM, GAME_SYSTEM, extractHtml } from './answer.js';
import { KIT_CSS, withKit } from './kit.js';
import { previewHost } from './share.js';
import { appAsset, chatPage, appCsp, embedCsp } from './app-page.js';
import { appPage, cleanModels, DEFAULT_MODELS, messagePage, notFoundPage, PROVIDER_CARDS, PROVIDER_NAMES, settingsPanelHtml, THEME_IDS } from './page.js';
import { deleteSettings, loadSettings, saveSettings } from './keys.js';
import { githubWebhook, reportLostReviews, REVIEWS_PER_DAY } from './review.js';
import { runResult } from './run.js';
import { KEEP_DAYS, KEPT_PER_LOGIN } from './share.js';
import { runOverSocket } from './browserpod.js';
import { PHOTOS_PER_LOGIN, photoHistory, photosUsed, sitePhoto } from './photo.js';
import { ANON_DAYS, clearSession, isAnon, makeSession, newAnonLogin, readSession, sameOrigin } from './session.js';
import { speakStream, MAX_SPEAK } from './tts.js';
import { sentenceSplitter, splitReply } from './talk-stream.js';
import { COGITO_TYPE, cogitoStream, wantsCogito } from './cogito.js';
const EARLY_EVENTS = new Set(['delta', 'thinking', 'sources']);
import { placeFrom, warmWeather, weatherNote } from './weather.js';
import { ALEXA_PER_DAY, MAX_VOICE, alexaHandle, sign as alexaSign } from './alexa.js';
import { withSecurityHeaders } from './security-headers.js';
import { asksBuild, spokenReply, talkMessages, talkReply, transcribe } from './voice.js';
export * from './voice.js';
import { runEvents, sendTrace } from './trace.js';
import { usageOf, answeredModel, freeModelOpts, limitOf, overDailyLimit, overQuota, refundQuota, taskLimitBody } from './limits.js';
export * from './limits.js';

// RFC 9116 contact for security researchers, published at /.well-known/security.txt.
const SECURITY_TXT = `Contact: https://github.com/flisk-sh/chat/security/advisories/new
Expires: 2027-06-01T00:00:00Z
Preferred-Languages: en
Canonical: https://chat.flisk.si/.well-known/security.txt
`;

const LLMS_TXT = `# Flisk Chat

> AI chat assistant, fast, minimal, built for developers.

Ask for a task or a website. Flisk Chat gets a real computer and does it.

## Key Links

- [Home](https://chat.flisk.si/): Web interface for Flisk Chat
- [GitHub](https://github.com/flisk-sh/chat): Open-source repository, issues, and discussions
- [Flisk](https://flisk.sh/): Flisk CLI and local developer runtime
`;

export const MAX_SITE_BYTES = 200 * 1024;
export const SITES_PER_LOGIN = 5;
export const VIDEOS_PER_LOGIN = 5;
export const IMAGES_PER_LOGIN = 50;
export const IMAGE_DAYS = 30;
const alexaCache = (env) => env.VOICE_CACHE || (typeof caches !== 'undefined' && caches.default) || null;
const alexaAudio = (bytes) => new Response(bytes, { headers: { 'content-type': 'audio/mpeg', 'content-length': String(bytes.length), 'cache-control': 'public, max-age=86400' } });
async function alexaVoiceBytes(env, text) {
  const stream = await (env.SPEAK || speakStream)(text, '', { backup: null, hedgeMs: 2000, firstMs: 5000 });
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  if (bytes.length < 500) throw new Error('the voice sent no audio');
  return bytes;
}
export const AVA_RETRY_MS = 1500; // Ava is the only voice: when no audio has come after this long, ask Ava again on a new connection (never a robot voice)
export const AVA_HEAD_START_MS = 3000; // answers read aloud by the Ava voice, per login
const SITE_DAYS = 7;

// The model picker's list comes from inference (/v1/catalog), so a model added there shows up here with no chat change.
// Read through the service binding (a Worker cannot fetch another Worker on the same domain), kept 5 minutes per isolate.
let catalog = { at: 0, models: null };
// The sandbox providers fleet routes to, by id and name, from fleet's public price list (cached 5 minutes), so a provider
// added to fleet shows in the computer menu without a chat release. Falls back to the built-in list.
let fleetNames = { at: 0, names: null };
// In-memory cache for /health probes (10 seconds per isolate, #165).
let healthCache = { at: 0, result: null };
export const HEALTH_CACHE_MS = 10_000;
export function resetHealthCache() { healthCache = { at: 0, result: null }; }
export function resetFleetNames() { fleetNames = { at: 0, names: null }; }
export async function loadFleetNames(env, fetchImpl = fetch, now = Date.now()) {
  if (fleetNames.names && now - fleetNames.at < 300_000) return fleetNames.names;
  try {
    const fleet = (env.FLEET_URL || 'https://fleet.flisk.si').replace(/\/$/, '');
    const res = await fetchImpl(`${fleet}/v1/prices`, { signal: AbortSignal.timeout(1500) });
    const rows = res.ok ? (await res.json())?.prices : null;
    if (!Array.isArray(rows) || !rows.length) throw new Error('no prices');
    const names = { ...PROVIDER_NAMES };
    for (const r of rows) if (r?.provider && r.provider !== 'demo' && typeof r.label === 'string') names[r.provider] = names[r.provider] || r.label.slice(0, 40);
    fleetNames = { at: now, names };
    return names;
  } catch {
    return fleetNames.names || PROVIDER_NAMES;
  }
}

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
  'referrer-policy': 'same-origin',
  'strict-transport-security': 'max-age=31536000',
  // The Earth look loads three.js and its globe textures from these exact folders only (see earth.js).
  'content-security-policy': `default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-inline' https://flisk.si https://flisk.sh ${THREE_SRC}; img-src 'self' data: blob: https://flisk.si ${TEXTURES.join(' ')}; media-src 'self' data: blob:; connect-src 'self' https://analytics.flisk.si https://openrouter.ai/api/v1/models https://openrouter.ai/api/v1/auth/keys; form-action 'self' https://github.com; frame-ancestors https://analytics.flisk.si; base-uri 'none'`,
};
// A visitor who has no look yet gets Earth and keeps it in a cookie; the switch under the box changes it.
export const DEFAULT_THEME = 'earth';
// The shared Flisk look (the bar's ?flisk_theme= parameter, or its flisk_theme cookie on .flisk.si) maps onto the closest of
// the five chat looks: ivory and soft glow have their own, other light looks get Focus, dark looks get Classic.
const LIGHT_LOOKS = new Set(['paper-tool', 'editorial-ruled', 'soft-satoshi', 'clean', 'ice', 'chapters']);
// A chat look's own id (classic, ivory, glow, focus, voice, earth) is taken as it is, so a link can ask for Voice first or Earth.
export const lookForFliskTheme = (id) => (THEME_IDS.includes(id) ? id : id === 'ivory' ? 'ivory' : id === 'cool-glow' ? 'glow' : LIGHT_LOOKS.has(id) ? 'focus' : /^[a-z-]{2,24}$/.test(id || '') ? 'classic' : undefined);
const setLook = (theme) => ({ theme, cookie: `chat_theme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax; Secure` });
export const pickTheme = (request) => {
  const cookies = request.headers.get('cookie') || '';
  // A look sent in the link wins: the person just chose it on another Flisk site.
  const fromLink = lookForFliskTheme(new URL(request.url).searchParams.get('flisk_theme') || '');
  if (fromLink) return setLook(fromLink);
  const saved = /(?:^|;\s*)chat_theme=([a-z]+)/.exec(cookies)?.[1];
  if (THEME_IDS.includes(saved)) return { theme: saved, cookie: '' };
  const shared = lookForFliskTheme(/(?:^|;\s*)flisk_theme=([a-z-]+)/.exec(cookies)?.[1]);
  if (shared) return setLook(shared);
  return setLook(DEFAULT_THEME);
};

// Where the browser computer's files are served from (fleet's /browserpod/, a pinned release of github.com/flisk-sh/linux2wasm). Empty string in BROWSER_POD_URL turns it off.
export const podBase = (env) => (env.BROWSER_POD_URL === '' ? '' : (env.BROWSER_POD_URL || `${(env.FLEET_URL || 'https://fleet.flisk.si').replace(/\/$/, '')}/browserpod/`).replace(/\/?$/, '/'));
// The chat page may load the browser computer (a script, a WebAssembly file and a Linux image) from that one folder, and
// open the task's WebSocket back to chat itself. 'wasm-unsafe-eval' allows WebAssembly only, never eval of text.
// The emulator starts one worker from a blob it builds itself, so worker-src allows blob: and nothing else.
// The browser model runs on inference's own origin, in a hidden iframe (inference's /browser-model page): chat frames that one
// origin and loads no script from anywhere new, so the engine and the weights never run in the page that holds the session.
export const inferenceOrigin = (env) => { try { return new URL(env.INFERENCE_URL || 'https://inference.flisk.si/v1/chat/completions').origin; } catch { return 'https://inference.flisk.si'; } };
// The page itself may be framed (the side panel previews a published /s/<id> page); inference's origin is added when it is set.
export const withFrame = (csp, inf) => csp.replace("default-src 'none';", `default-src 'none'; frame-src 'self'${inf ? ' ' + inf : ''};`);
export function cspWithPod(pod, origin) {
  if (!pod) return SECURITY['content-security-policy'];
  const from = new URL(pod).href;
  const ws = origin.replace(/^http/, 'ws');
  return SECURITY['content-security-policy'].replace("script-src 'unsafe-inline'", `script-src 'unsafe-inline' 'wasm-unsafe-eval' blob: ${from} ${new URL('../cfworker2browser/', from).href}`).replace("connect-src 'self'", `connect-src 'self' ${ws} ${from}`) + `; worker-src blob: ${new URL('../cfworker2browser/', from).href}`;
}
const html = (body, status = 200, extra = {}) => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...SECURITY, ...extra } });
// '2 tries, won 2 | 1 at0 o412 s520 a- x | 2 at800 o1190 s1290 a1450': for each ask of the voice, ms from the request
// to its start (at), socket open (o), Microsoft's turn start (s) and first audio (a); x = it failed.
export function voiceDesc(info = {}) {
  const asks = (info.asks || []).map((r, i) => `${i + 1}${r.kind ? ' ' + r.kind : ''} at${r.at ?? 0} o${r.o ?? '-'} s${r.s ?? '-'} a${r.a ?? '-'}${r.x ? ' x' : ''}`);
  return [`${info.tries || 1} tries${info.won ? `, won ${info.won}` : ''}`, ...asks].join(' | ');
}
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
const redirect = (location, extra = {}) => new Response(null, { status: 303, headers: { location, ...extra } });
// A body bigger than the audio limit allows is refused before it is read, so a huge upload costs nothing.
const MAX_BODY = 2_000_000;
const readJson = async (request) => {
  try {
    if (Number(request.headers.get('content-length') || 0) > MAX_BODY) return null;
    const text = await request.text();
    if (text.length > MAX_BODY) return null;
    const v = JSON.parse(text || '{}');
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
};

const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');

// Build analytics: one row per finished task (no login, no key), so a weak result can be traced to its cause.
export async function recordRun(env, { task, ai, free, anon, result, login = null }) {
  if (!env.DB) return;
  const st = result.stats || {};
  await env.DB.prepare('INSERT INTO task_runs (created, who, task, ai, free, provider, steps, errors, bad_json, empty, provider_retries, big, system, first_action, shared, copy, links, ms, error, answer) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(new Date().toISOString(), anon ? 'anon' : 'user', String(task).slice(0, 300), String(ai || '').slice(0, 80), free ? 1 : 0, result.provider || null, result.steps.length, st.errors || 0, st.bad || 0, st.empty || 0, st.provider || 0, st.big ? 1 : 0, st.system ? 1 : 0, st.firstAction || null, st.shared ? 1 : 0, st.copy ? 1 : 0, result.links.length, result.ms || 0, result.error ? String(result.error).slice(0, 200) : null, result.answer ? String(result.answer).slice(0, 400) : null)
    .run();
  // A signed-in person's day, once: lets us count different people and returns. Its own catch, so a database where
  // user_days is not created yet still records the task.
  if (!anon && login) await env.DB.prepare('INSERT OR IGNORE INTO user_days (login, day) VALUES (?, ?)').bind(String(login), new Date().toISOString().slice(0, 10)).run().catch(() => {});
}

// Why a finished task is worth a look: it failed, a bigger app skipped the "system" builder, most of its steps failed,
// or one write, read, publish or share failed (even when the task got past it, like a write to a home folder that is not there).
export function runProblem(result) {
  const st = result.stats || {};
  if (result.error) return `failed: ${String(result.error).slice(0, 150)}`;
  if (st.big && !st.system) return 'a bigger app did not use the system builder';
  if (st.errors >= 3) return `${st.errors} steps failed`;
  if (st.refused >= 2) return `chat refused the model ${st.refused} times: ${st.refusedWhy}`;
  if (st.failed) return `a step failed: ${st.failed}`;
  if (st.big && !st.shared) return 'a bigger app ended without a live link';
  return null;
}

// Posts a weak or failed task to a private Discord channel (env.DISCORD_ERRORS_WEBHOOK, a webhook URL). Never throws.
export async function alertRun(env, { task, ai, anon, result }, fetchImpl = fetch) {
  const url = env.DISCORD_ERRORS_WEBHOOK;
  const why = runProblem(result);
  if (!url || !why) return;
  const st = result.stats || {};
  const text = `**Chat task needs a look: ${why}**\n> ${String(task).slice(0, 300).replace(/\n/g, ' ')}\n${anon ? 'anonymous' : 'signed in'} · ${ai} · ${result.steps.length} steps · ${st.errors || 0} failed · ${st.bad || 0} bad JSON · ${st.system ? 'system builder' : 'no system builder'} · ${st.shared ? 'live link' : 'no live link'} · ${Math.round((result.ms || 0) / 1000)} s${result.answer ? `\nAnswer: ${String(result.answer).slice(0, 300)}` : ''}`;
  await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: text.slice(0, 1900), allowed_mentions: { parse: [] } }) }).catch(() => {});
}

// GET /api/admin/runs?days=7 with Authorization: Bearer <ADMIN_KEY>: totals and the 30 newest tasks.
async function adminRuns(request, env) {
  const key = env.ADMIN_KEY || '';
  const given = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
  if (!key || given !== key) return json(404, { error: 'not found' });
  const days = Math.min(90, Math.max(1, Number(new URL(request.url).searchParams.get('days')) || 7));
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const totals = await env.DB.prepare('SELECT COUNT(*) AS tasks, SUM(error IS NOT NULL) AS failed, SUM(shared) AS live_links, SUM(copy) AS copies, SUM(big) AS big_apps, SUM(big AND system) AS big_built_by_system, SUM(big AND NOT system) AS big_skipped_system, SUM(bad_json) AS bad_json, SUM(provider_retries) AS provider_retries, ROUND(AVG(steps), 1) AS avg_steps, ROUND(AVG(ms) / 1000.0, 1) AS avg_seconds FROM task_runs WHERE created >= ?').bind(since).first();
  const byAi = await env.DB.prepare('SELECT ai, COUNT(*) AS tasks, SUM(error IS NOT NULL) AS failed, SUM(shared) AS live_links, SUM(big AND system) AS big_built_by_system, SUM(big) AS big_apps FROM task_runs WHERE created >= ? GROUP BY ai ORDER BY tasks DESC').bind(since).all();
  const recent = await env.DB.prepare('SELECT created, who, task, ai, provider, steps, errors, bad_json, big, system, first_action, shared, copy, ms, error, answer FROM task_runs WHERE created >= ? ORDER BY id DESC LIMIT 30').bind(since).all();
  const reviews = await env.DB.prepare("SELECT COUNT(*) AS reviews, SUM(status = 'posted') AS posted, SUM(status = 'failed') AS failed, SUM(status = 'lost') AS lost, SUM(status = 'started') AS running, SUM(status = 'limited') AS limited, ROUND(AVG(ms) / 1000.0, 1) AS avg_seconds FROM review_runs WHERE created >= ?").bind(since).first().catch(() => null);
  const recentReviews = await env.DB.prepare('SELECT created, repo, pr, auto, status, ai, verdict, error, ms FROM review_runs WHERE created >= ? ORDER BY id DESC LIMIT 30').bind(since).all().catch(() => ({ results: [] }));
  return json(200, { days, totals, byAi: byAi.results, recent: recent.results, reviews, recentReviews: recentReviews.results });
}

// A site a task made (limit: a layout page with its photo may be bigger): stored as one HTML file, linked by an unguessable id, kept 7 days, the oldest dropped over 5.
export async function publishSite(env, login, content, origin, limit = MAX_SITE_BYTES) {
  const bytes = new TextEncoder().encode(String(content)).length;
  if (!/<html|<!doctype|<body|<h1|<div/i.test(content)) return { error: 'that file is not an HTML page' };
  if (bytes > limit) return { error: `the page is ${bytes} bytes; the limit is ${limit}` };
  const id = hex(8);
  await env.DB.prepare('INSERT INTO sites (id, login, html, created) VALUES (?, ?, ?, ?)').bind(id, login, content, new Date().toISOString()).run();
  await env.DB.prepare('DELETE FROM sites WHERE login = ? AND id NOT IN (SELECT id FROM sites WHERE login = ? ORDER BY created DESC LIMIT ?)').bind(login, login, SITES_PER_LOGIN).run();
  return { url: `${(env.APP_ORIGIN || origin).replace(/\/$/, '')}/s/${id}` };
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

// A picture a task drew (the "image" action): kept at its own unguessable link, so the chat history holds a short link
// instead of the picture. IMAGE_DAYS, the newest IMAGES_PER_LOGIN per login.
export async function saveImage(env, login, dataUrl, prompt, origin) {
  const m = /^data:image\/(jpeg|png|webp|svg\+xml);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl));
  if (!m) return { error: 'the picture is not an image' };
  const id = hex(8);
  await env.DB.prepare('INSERT INTO images (id, login, type, prompt, data, created) VALUES (?, ?, ?, ?, ?, ?)').bind(id, login, m[1], String(prompt || '').slice(0, 300), m[2], new Date().toISOString()).run();
  await env.DB.prepare('DELETE FROM images WHERE login = ? AND id NOT IN (SELECT id FROM images WHERE login = ? ORDER BY created DESC LIMIT ?)').bind(login, login, IMAGES_PER_LOGIN).run();
  return { url: `${origin}/i/${id}.${m[1] === 'jpeg' ? 'jpg' : m[1] === 'svg+xml' ? 'svg' : m[1]}` };
}

// Computers chat started. Every one is written down when it starts, so none is left running by accident: a task's computer is
// deleted when the task ends, a shared app's computer after KEEP_DAYS, the oldest shared one when a login shares more than
// KEPT_PER_LOGIN, and whatever a crashed task left behind after two hours (cleanPods, run by the hourly cron).
const hoursFromNow = (h) => new Date(Date.now() + h * 3600_000).toISOString();
export function podTracker(env, login, fleet) {
  return {
    started: (id) => env.DB.prepare('INSERT OR REPLACE INTO pods (id, login, url, created, until) VALUES (?, ?, NULL, ?, ?)').bind(id, login, new Date().toISOString(), hoursFromNow(2)).run(),
    stopped: (id) => env.DB.prepare('DELETE FROM pods WHERE id = ?').bind(id).run(),
    // until: when the provider stops the computer by itself (no sleep and wake); else KEEP_DAYS.
    kept: async (id, url, until = null) => {
      await env.DB.prepare('UPDATE pods SET url = ?, until = ? WHERE id = ?').bind(url, until || hoursFromNow(KEEP_DAYS * 24), id).run();
      const { results = [] } = await env.DB.prepare('SELECT id FROM pods WHERE login = ? AND url IS NOT NULL ORDER BY created DESC LIMIT -1 OFFSET ?').bind(login, KEPT_PER_LOGIN).all();
      for (const old of results) {
        const s = await fleet.stop(old.id).catch(() => null);
        if (s && (s.status === 200 || s.status === 404 || s.status === 410)) await env.DB.prepare('DELETE FROM pods WHERE id = ?').bind(old.id).run();
      }
    },
  };
}

export async function cleanPods(env, fetchImpl = fetch, now = new Date().toISOString()) {
  const { results = [] } = await env.DB.prepare('SELECT id, login FROM pods WHERE until < ? ORDER BY until LIMIT 25').bind(now).all();
  let stopped = 0;
  for (const p of results) {
    const s = await fleetClient(env, p.login, fetchImpl).stop(p.id).catch(() => null);
    if (s && (s.status === 200 || s.status === 404 || s.status === 410)) {
      await env.DB.prepare('DELETE FROM pods WHERE id = ?').bind(p.id).run();
      stopped++;
    }
  }
  return { due: results.length, stopped };
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
// The sandbox has no allow-same-origin on purpose, so the browser makes every localStorage/sessionStorage access THROW. Model-written
// pages use localStorage for their data, and a throwing save aborts the click handler before it redraws: buttons look dead.
// This shim runs first and, only when real storage is blocked, gives the page a stand-in that keeps data in memory and in
// window.name (survives a reload of the same tab, never leaves the browser). The key holds the page's own path, so two pages
// opened one after the other in a tab never see each other's data.
export const STORAGE_SHIM = `<script>(function(){try{window.localStorage.getItem('x');return}catch(e){}
var P='flisk-site-storage:'+((window.location&&window.location.pathname)||'')+':',d={local:{},session:{}};
try{if(window.name.indexOf(P)==0)d=JSON.parse(window.name.slice(P.length))||d}catch(e){}
function save(){try{window.name=P+JSON.stringify(d)}catch(e){}}
function mk(k){var o=d[k]=d[k]||{};return{getItem:function(n){n=String(n);return Object.prototype.hasOwnProperty.call(o,n)?o[n]:null},setItem:function(n,v){o[String(n)]=String(v);save()},removeItem:function(n){delete o[String(n)];save()},clear:function(){for(var n in o)delete o[n];save()},key:function(i){var a=Object.keys(o);return i<a.length?a[i]:null},get length(){return Object.keys(o).length}}}
var l=mk('local'),s=mk('session');
try{Object.defineProperty(window,'localStorage',{configurable:true,get:function(){return l}});Object.defineProperty(window,'sessionStorage',{configurable:true,get:function(){return s}})}catch(e){}})()</script>`;

// Put the shim before any script of the page, without dropping the page into quirks mode (no text before the doctype).
export function withStorageShim(html) {
  for (const tag of [/<head(?:\s[^<>]*)?>/i, /<html(?:\s[^<>]*)?>/i, /<!doctype[^<>]*>/i]) {
    const m = tag.exec(html);
    if (m) return html.slice(0, m.index + m[0].length) + STORAGE_SHIM + html.slice(m.index + m[0].length);
  }
  return STORAGE_SHIM + html;
}

function siteResponse(row) {
  // One line that never wraps (a wrapped bar grew to 3 lines on a phone and sat over the page's bottom tabs), and it lets taps through
  // to the page below; only the report link takes taps.
  const bar = `<div style="position:fixed;left:0;right:0;bottom:0;display:flex;gap:10px;background:#111;color:#eee;font:12px/16px ui-monospace,Menlo,monospace;padding:4px 10px;z-index:2147483647;pointer-events:none"><span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Made with Flisk Chat by @${String(row.login).replace(/[^A-Za-z0-9-]/g, '')} · anyone can make a page here, so only enter what you would enter on any site</span><a style="color:#7ee787;flex:none;pointer-events:auto" href="https://github.com/flisk-sh/chat/issues/new?title=Report%20chat%20page%20${row.id}">report</a></div>`;
  // The bar is fixed to the bottom edge: leave room under the page so its last line is not hidden behind it.
  const room = '<style>body{padding-bottom:40px!important}</style>';
  const page = withStorageShim(withKit(row.html));
  const body = /<\/body>/i.test(page) ? page.replace(/<\/body>/i, () => `${room}${bar}</body>`) : page + room + bar;
  return new Response(body, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "sandbox allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox; default-src 'unsafe-inline' data: blob:; connect-src 'none'",
      'x-content-type-options': 'nosniff',
      'x-robots-tag': 'noindex, nofollow',
      'referrer-policy': 'no-referrer',
      'cache-control': 'private, max-age=60',
    },
  });
}

// A HEAD request (link checkers, uptime monitors) gets the same status and headers as GET, with no body.
export async function handle(request, env = {}, opts = {}) {
  const url = new URL(request.url);
  const proto = request.headers.get('x-forwarded-proto') || url.protocol.replace(/:$/, '');
  if (proto === 'http') {
    url.protocol = 'https:';
    return Response.redirect(url.toString(), 301);
  }
  if (request.method === 'HEAD' && !/^\/v\//.test(new URL(request.url).pathname)) {
    const res = await handleRequest(new Request(request.url, { method: 'GET', headers: request.headers }), env, opts);
    return new Response(null, { status: res.status, headers: res.headers });
  }
  return handleRequest(request, env, opts);
}

async function handleRequest(request, env = {}, { fetchImpl = fetch, waitUntil = null, socketPair = null, now = Date.now() } = {}) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const origin = env.PUBLIC_ORIGIN || url.origin;

  // <name>-<port>.app.flisk.si is a sandbox preview shown on our own host (share.js friendlyUrl): pass the request through.
  const preview = previewHost(url.hostname, env.APP_HOST);
  if (preview) {
    const res = await fetchImpl(new Request(`https://${preview}${url.pathname}${url.search}`, request));
    const out = new Response(res.body, res);
    out.headers.set('x-robots-tag', 'noindex');
    return out;
  }

  if (request.method === 'GET' && path === '/og.png') return new Response(OG_PNG, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' } });
  if (request.method === 'GET' && path === '/apple-touch-icon.png') return new Response(TOUCH_ICON_PNG, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' } });
  if (request.method === 'GET' && path.startsWith('/logo/')) {
    const host = decodeURIComponent(path.slice(6)).toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)+$/.test(host) || host.length > 100) return new Response(null, { status: 404 });
    for (const u of [`https://icons.duckduckgo.com/ip3/${host}.ico`, `https://www.google.com/s2/favicons?domain=${host}&sz=64`]) {
      try {
        const r = await fetchImpl(u, { cf: { cacheTtl: 604800, cacheEverything: true } });
        const type = r.headers.get('content-type') || '';
        if (r.ok && /^image\//.test(type)) return new Response(r.body, { headers: { 'content-type': type, 'cache-control': 'public, max-age=604800' } });
      } catch {}
    }
    return new Response(null, { status: 404, headers: { 'cache-control': 'public, max-age=3600' } });
  }
  if ((request.method === 'GET' || request.method === 'HEAD') && path.startsWith('/_app/')) return appAsset(path) || new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  if (request.method === 'GET' && path === '/favicon.ico') return new Response(null, { status: 204, headers: { 'cache-control': 'public, max-age=86400' } });
  if (request.method === 'GET' && path === '/robots.txt') return new Response('User-agent: *\nAllow: /$\nAllow: /ja/$\nDisallow: /s/\nDisallow: /v/\nDisallow: /i/\nDisallow: /api/\nSitemap: https://chat.flisk.si/sitemap.xml\n', { headers: { 'content-type': 'text/plain', 'cache-control': 'public, max-age=86400' } });
  if (request.method === 'GET' && path === '/llms.txt') return new Response(LLMS_TXT, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=86400' } });
  if (request.method === 'GET' && path === '/.well-known/security.txt') return new Response(SECURITY_TXT, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=86400' } });
  if (request.method === 'GET' && path === '/sitemap.xml') return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml"><url><loc>https://chat.flisk.si/</loc><xhtml:link rel="alternate" hreflang="en" href="https://chat.flisk.si/"/><xhtml:link rel="alternate" hreflang="ja" href="https://chat.flisk.si/ja/"/><xhtml:link rel="alternate" hreflang="x-default" href="https://chat.flisk.si/"/></url><url><loc>https://chat.flisk.si/ja/</loc><xhtml:link rel="alternate" hreflang="en" href="https://chat.flisk.si/"/><xhtml:link rel="alternate" hreflang="ja" href="https://chat.flisk.si/ja/"/><xhtml:link rel="alternate" hreflang="x-default" href="https://chat.flisk.si/"/></url></urlset>', { headers: { 'content-type': 'application/xml', 'cache-control': 'public, max-age=86400' } });

  // Is chat able to reach what it depends on? No sign-in, no secrets, only status codes.
  // Cached for 10 seconds per isolate (#165) so repeated checks make no extra outgoing requests.
  if (request.method === 'GET' && path === '/health') {
    if (healthCache.result && now - healthCache.at < HEALTH_CACHE_MS) {
      return json(healthCache.result.status, healthCache.result.body);
    }
    const probe = async (u, call = fetchImpl) => {
      try {
        const r = await call(u, { method: 'GET', headers: { 'user-agent': 'flisk-chat-health' } });
        const text = r.status >= 500 || r.status === 403 ? (await r.text()).slice(0, 120) : '';
        return { status: r.status, ...(text ? { body: text } : {}) };
      } catch (e) {
        console.log('probe failed', String(e?.message || e));
        return { status: 0, error: 'request failed' };
      }
    };
    const fleet = (env.FLEET_URL || 'https://fleet.flisk.si').replace(/\/$/, '');
    const inference = new URL(env.INFERENCE_URL || 'https://inference.flisk.si/v1/chat/completions').origin;
    // Both probes at once (#165). A 4xx still proves the service answers (the probe sends no key); 0 or 5xx is down,
    // and then the endpoint answers 503 so an uptime monitor alerts (#356).
    const [f, i] = await Promise.all([probe(`${fleet}/v1/prices`), probe(`${inference}/v1/models`, env.INFERENCE ? (u, init) => env.INFERENCE.fetch(u, init) : fetchImpl)]);
    const up = (p) => p.status >= 200 && p.status < 500;
    const ok = up(f) && up(i);
    const code = ok ? 200 : 503;
    const body = { ok, fleet: f, inference: i, checkedAt: new Date(now).toISOString() };
    healthCache = { at: now, result: { status: code, body } };
    return json(code, body);
  }

  // GitHub App: "@flisk-chat review" on a pull request (signed webhook, no session).
  if (path === '/github/webhook') {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
    return githubWebhook(request, { ...env, PUBLIC_ORIGIN: origin, freeModelLimit: freeModelOpts(env).overLimit }, { fetchImpl, waitUntil, overLimit: (login) => overDailyLimit(login, { cache: env.LIMIT_CACHE, limit: REVIEWS_PER_DAY, scope: 'review-limit' }) });
  }

  // Alexa skill (Echo speaker at home): public URL guarded by ?key=ALEXA_KEY, see src/alexa.js.
  // Ava reading an Alexa answer: Alexa fetches this mp3 itself (no cookie, no headers), so the URL carries a signature
  // of the text made with ALEXA_KEY. 24 kHz 48 kbps mono mp3 is the format Alexa's <audio> accepts.
  if (request.method === 'GET' && path === '/alexa/voice') {
    const text = String(url.searchParams.get('t') || '');
    const sig = String(url.searchParams.get('s') || '');
    if (!env.ALEXA_KEY || !text || text.length > MAX_VOICE || sig !== (await alexaSign(text, env.ALEXA_KEY))) return json(403, { error: 'not allowed' });
    const hit = await alexaCache(env)?.match(new Request(url.toString())).catch(() => null);
    if (hit) return hit;
    const bytes = await alexaVoiceBytes(env, text).catch(() => null);
    if (!bytes) return json(502, { error: 'the voice sent no audio' });
    return alexaAudio(bytes);
  }
  if (request.method === 'POST' && path === '/alexa') {
    const chosen = resolveModel({ ai: 'wolf' });
    return alexaHandle(request, env, {
      origin: env.ALEXA_AVA === '1' ? origin : '', // Ava is opt-in (ALEXA_AVA=1): when it is slow the speaker swaps between two voices
      // Make Ava's file now and keep it for the fetch Alexa does next; false means Alexa reads the text itself.
      prepare: async (text, voice) => {
        const cache = alexaCache(env);
        if (!cache) return false;
        const bytes = await alexaVoiceBytes(env, text);
        await cache.put(new Request(voice), alexaAudio(bytes));
        return true;
      },
      overLimit: () => overDailyLimit('alexa-home', { cache: env.LIMIT_CACHE, limit: ALEXA_PER_DAY, scope: 'alexa-limit' }),
      ask: async (messages, heard) => {
        const note = await weatherNote(heard, fetchImpl, placeFrom(request.cf));
        if (note) messages[0] = { role: 'system', content: `${messages[0].content}\n${note}` };
        return modelFrom(env, fetchImpl, chosen, freeModelOpts(env, 'alexa-home', false))(messages);
      },
    });
  }

  if (request.method === 'GET' && path === '/api/admin/runs') return adminRuns(request, env);
  // @askflisk on X: a bot (not a browser) sends a question with a bearer key, see src/answer.js.
  if (request.method === 'POST' && path === '/api/answer') {
    return answerApi(request, env, {
      weather: (q) => weatherNote(q, fetchImpl, null),
      search: (q) => searchWeb(q, { fetch: fetchImpl }),
      format: formatResults,
      image: (prompt) => sitePhoto(env, 'x-bot', prompt, { fetchImpl }),
      build: async (q, game) => {
        const r = await modelFrom(env, fetchImpl, resolveModel({ ai: 'wolf' }), freeModelOpts(env, 'x-bot', false))([{ role: 'system', content: game ? GAME_SYSTEM : BUILD_SYSTEM }, { role: 'user', content: q }]);
        const html = r.error ? '' : extractHtml(r.text);
        return html ? publishSite(env, 'x-bot', html, origin) : { error: r.error || 'the model sent no page' };
      },
      over: (scope, id, limit) => overDailyLimit(id, { cache: env.LIMIT_CACHE, limit, scope }),
      ask: (messages) => modelFrom(env, fetchImpl, resolveModel({ ai: 'wolf' }), freeModelOpts(env, 'x-bot', false))(messages),
    });
  }
  if (request.method === 'POST' && path === '/github/run-result') return runResult(request, { ...env, PUBLIC_ORIGIN: origin }, { fetchImpl, waitUntil });

  // The app kit (Astryx look) as a stylesheet, for pages and apps that are not published as one file.
  if (request.method === 'GET' && path === '/_kit/astryx.css') return new Response(KIT_CSS, { headers: { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'public, max-age=3600', 'access-control-allow-origin': '*', 'x-content-type-options': 'nosniff' } });

  const sm = /^\/s\/([a-f0-9]{16})$/.exec(path);
  if (sm && request.method === 'GET') {
    const row = await env.DB.prepare('SELECT * FROM sites WHERE id = ?').bind(sm[1]).first();
    if (!row || Date.now() - Date.parse(row.created) > SITE_DAYS * 86400_000) return html(notFoundPage('Page not found', 'This page expired or never existed.'), 404);
    return siteResponse(row);
  }

  const im = /^\/i\/([a-f0-9]{16})\.(jpg|png|webp|svg)$/.exec(path);
  if (im && (request.method === 'GET' || request.method === 'HEAD')) {
    const row = await env.DB.prepare('SELECT type, data, created FROM images WHERE id = ?').bind(im[1]).first().catch(() => null);
    if (!row || Date.now() - Date.parse(row.created) > IMAGE_DAYS * 86400_000) return html(notFoundPage('Picture not found', 'This picture expired or never existed.'), 404);
    return new Response(request.method === 'HEAD' ? null : unb64(row.data), { headers: { 'content-type': `image/${row.type}`, ...(row.type === 'svg+xml' ? { 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" } : {}), 'cache-control': 'public, max-age=604800, immutable', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex, nofollow' } });
  }

  const vm = /^\/v\/([a-f0-9]{16})\.mp4$/.exec(path);
  if (vm && (request.method === 'GET' || request.method === 'HEAD')) {
    const res = await videoResponse(env, vm[1], request);
    return res || html(notFoundPage('Video not found', 'This video expired or never existed.'), 404);
  }

  if (request.method === 'GET' && path === '/auth/start') {
    if (!env.SESSION_SECRET) return html(messagePage('Sign-in is not set up', 'This copy of chat has no session secret yet.'), 503);
    const have = await readSession(env, request);
    // ?again=1: someone who signed in before chat asked for GitHub access goes through GitHub once more to allow it.
    if (have && !isAnon(have.login) && !url.searchParams.get('again')) return redirect('/');
    if (env.DEV_LOGIN) return redirect('/', { 'set-cookie': await makeSession(env, env.DEV_LOGIN) });
    if (env.LOGIN_PUBLIC_KEY && !url.searchParams.get('again')) {
      // Identity comes from login.flisk.si (one GitHub app for every Flisk site). GitHub repo access is a separate step: ?again=1.
      const state = crypto.randomUUID();
      const back = new URL('/auth/done', origin);
      back.searchParams.set('s', state);
      const headers = new Headers({ location: `${env.LOGIN_ORIGIN || 'https://login.flisk.si'}/start?return=${encodeURIComponent(back.href)}` });
      headers.append('set-cookie', `chat_state=${state}; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
      return new Response(null, { status: 302, headers });
    }
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) return html(messagePage('Sign-in is not set up', 'GitHub sign-in has not been connected yet.'), 503);
    const state = crypto.randomUUID();
    const headers = new Headers({ location: githubAuthorizeUrl({ ...env, PUBLIC_ORIGIN: origin }, state) });
    headers.append('set-cookie', `chat_state=${state}; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
    return new Response(null, { status: 302, headers });
  }
  if (request.method === 'GET' && path === '/auth/done') {
    const cookie = /(?:^|;\s*)chat_state=([^;]+)/.exec(request.headers.get('cookie') || '')?.[1] || '';
    const st = url.searchParams.get('s') || '';
    const who = env.LOGIN_PUBLIC_KEY && env.SESSION_SECRET && st && st === cookie ? await verifyLoginToken(url.searchParams.get('flisk_token'), env.LOGIN_PUBLIC_KEY, origin) : null;
    if (!who || !/^[A-Za-z0-9-]{1,39}$/.test(who.login) || /^anon-/i.test(who.login)) return html(messagePage('Sign-in failed', 'The sign-in link expired. Start again.'), 400);
    const headers = new Headers({ location: '/' });
    headers.append('set-cookie', await makeSession(env, who.login));
    headers.append('set-cookie', 'chat_state=; Path=/auth; Max-Age=0');
    return new Response(null, { status: 303, headers });
  }
  if (request.method === 'GET' && path === '/auth/callback') {
    const state = url.searchParams.get('state') || '';
    const cookie = /(?:^|;\s*)chat_state=([^;]+)/.exec(request.headers.get('cookie') || '')?.[1] || '';
    const code = url.searchParams.get('code') || '';
    if (!env.SESSION_SECRET || !code || !state || state !== cookie) return html(messagePage('Sign-in failed', 'The sign-in link expired. Start again.'), 400);
    const signed = await githubLogin(env, code, fetchImpl);
    const login = signed?.login;
    if (!login || /^anon-/i.test(login)) return html(messagePage('Sign-in failed', "GitHub didn't confirm the sign-in. Start again."), 400);
    await saveGithubToken(env, login, signed.token, signed.scope).catch(() => {});
    const headers = new Headers({ location: '/' });
    headers.append('set-cookie', await makeSession(env, login));
    headers.append('set-cookie', 'chat_state=; Path=/auth; Max-Age=0');
    return new Response(null, { status: 303, headers });
  }
  if (request.method === 'GET' && path === '/auth/signout') {
    const was = await readSession(env, request);
    if (was && !isAnon(was.login)) await Promise.resolve(forgetGithubToken(env, was.login)).catch(() => {});
    return redirect('/', { 'set-cookie': clearSession() });
  }

  const session = await readSession(env, request);
  // Signing in with GitHub is optional: a visitor with no session gets a private anonymous one on the home page.
  const anon = !!session && isAnon(session.login);
  const who = async (login) => (isAnon(login) ? `ip-${[...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(request.headers.get('cf-connecting-ip') || 'unknown')))].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('')}` : login);
  // One gate for a task, whichever way it arrives (POST /api/run or the browser-computer WebSocket): the daily cap for the shared
  // free model, the model that answers, and the refund of a free task the free AI never answered (or that needs a computer).
  const admitTask = async (login, chosen) => {
    if (chosen.free && (await overQuota(env, 'chat', { anon, id: await who(login) }))) return { refuse: taskLimitBody(anon) };
    const m = answeredModel(modelFrom(env, fetchImpl, chosen, freeModelOpts(env, await who(login), anon)));
    const refund = async (force = false) => chosen.free && (force || !m.answered()) && refundQuota(env, 'chat', { anon, id: await who(login) });
    return { m, refund };
  };
  if (request.method === 'GET' && (path === '/' || path === '/ja' || path === '/next' || path === '/classic' || path === '/embed' || path === '/settings' || path === '/reviews')) {
    // The new Astryx page is the home page; the previous page stays at /classic.
    const isApp = path !== '/classic';  // /settings and /reviews are the chat with the settings dialog open over it (the page script opens it)
    // /embed is the chat as a window inside grow.flisk.si: same app, no side bar, no Earth, and only Grow may frame it.
    const embed = path === '/embed';
    const [models, names] = await Promise.all([loadCatalog(env), loadFleetNames(env, fetchImpl)]);
    const { theme, cookie } = pickTheme(request);
    // The session cookie goes first and the look cookie last.
    const withLook = (res) => {
      if (cookie) res.headers.append('set-cookie', cookie);
      return res;
    };
    // The talk circle's Earth turns to the visitor's side of the world (whole degrees only).
    const spot = placeFrom(request.cf);
    const here = spot ? { lat: Math.round(spot.latitude), lng: Math.round(spot.longitude) } : null;
    const pod = podBase(env);
    // The visitor's country goes to the page so a visit from Ukraine opens in Ukrainian (a saved choice or the browser language still decide first).
    const geo = /^[A-Z]{2}$/.test(String(request.cf?.country || '')) ? request.cf.country : '';
    const page = (opts) => {
      const inf = inferenceOrigin(env);
      const csp = withFrame(cspWithPod(pod, origin), inf);
      if (isApp) return html(chatPage({ ...opts, models, theme: embed ? 'system' : theme, here, pod, inf, names, embed, lang: path === '/ja' ? 'ja' : 'en' }), 200, { 'content-security-policy': embed ? embedCsp(appCsp(csp)) : appCsp(csp) });
      let body = appPage({ ...opts, models, theme, here, pod, inf, names });
      if (geo === 'UA') body = body.replace('<head>', `<head><script>window.__GEO="UA"</script>`);
      return html(body, 200, { 'content-security-policy': csp });
    };
    if (!session) {
      if (!env.SESSION_SECRET) return withLook(page({ login: null, connected: [] }));
      const login = newAnonLogin();
      const res = page({ login, anon: true, connected: [] });
      res.headers.append('set-cookie', await makeSession(env, login, Date.now(), ANON_DAYS));
      return withLook(res);
    }
    const connections = await fleetClient(env, session.login, fetchImpl).connections().catch(() => ({}));
    return withLook(page({ login: session.login, anon, connected: Object.keys(connections) }));
  }

  // The inside of the settings dialog for this visitor. Anyone can open it: a guest sees the account and help sections, a signed-in
  // visitor also their AI for reviews. Only the AI's name and model come back, never its key.
  // What this visitor has used today, read only: the free tasks and voice chats (counted per login, or per network address for a guest)
    // and the pictures (counted per login in D1). The same counters the gates use, so the numbers match what will be refused.
    const usageToday = async (named) => {
      const login = session?.login || 'anon-none';
      const id = await who(login);
      const [tasks, talk, pics] = await Promise.all([usageOf(env, 'chat', { anon: !named, id }), usageOf(env, 'talk', { anon: !named, id }), session ? photosUsed(env, session.login) : 0]);
      return [{ key: 'tasks', ...tasks }, { key: 'pictures', used: pics, limit: PHOTOS_PER_LOGIN }, { key: 'talk', ...talk }];
    };
  if (request.method === 'GET' && path === '/settings/data') {

    const site = request.headers.get('sec-fetch-site');
    if (site && site !== 'same-origin') return json(403, { error: 'this only works from chat itself' });
    const named = session && !anon;
    return json(200, {
      login: named ? session.login : '', named: !!named, stored: !!env.KEY_SECRET, limit: REVIEWS_PER_DAY,
      saved: named ? await loadSettings(env, session.login).catch(() => null) : null,
      usage: await usageToday(!!named), history: { pictures: session ? await photoHistory(env, session.login) : [] },
    });
  }
  if (request.method === 'GET' && path === '/settings/panel') {
    const site = request.headers.get('sec-fetch-site');
    if (site && site !== 'same-origin') return json(403, { error: 'this only works from chat itself' });
    const ok = url.searchParams.get('ok');
    const named = session && !anon;
    return html(settingsPanelHtml({
      login: session?.login || '', anon: !named, stored: !!env.KEY_SECRET, limit: REVIEWS_PER_DAY,
      saved: named ? await loadSettings(env, session.login).catch(() => null) : null,
      usage: await usageToday(!!named), history: { pictures: session ? await photoHistory(env, session.login) : [] },
      section: url.searchParams.get('section') || '', lang: url.searchParams.get('lang') === 'uk' ? 'uk' : '',
      flash: ok === 'saved' || ok === 'deleted' ? ok : '',
    }));
  }
  if (request.method === 'POST' && (path === '/reviews/save' || path === '/reviews/delete')) {
    // The dialog posts with fetch and wants JSON; a plain form post (no script) is redirected back to the chat as before.
    const wantsJson = (request.headers.get('accept') || '').includes('application/json');
    const fail = (status, error) => (wantsJson ? json(status, { error }) : html(messagePage('Not saved', error), status));
    if (!session || anon) return wantsJson ? json(403, { error: 'PR reviews need GitHub sign-in' }) : redirect('/auth/start');
    if (!sameOrigin(request, origin)) return wantsJson ? json(403, { error: 'this only works from chat itself' }) : html(messagePage('Not allowed', 'This only works from the chat page.'), 403);
    if (path === '/reviews/delete') {
      await deleteSettings(env, session.login);
      return wantsJson ? json(200, { ok: true, flash: 'deleted' }) : redirect('/settings?ok=deleted');
    }
    const f = await request.formData().catch(() => null);
    const chosen = resolveModel({ ai: String(f?.get('ai') || ''), key: String(f?.get('key') || ''), model: String(f?.get('model') || '') });
    if (chosen.error || chosen.free) return fail(400, chosen.error || 'pick an AI');
    const r = await saveSettings(env, session.login, { ai: chosen.ai, model: chosen.model, key: chosen.key });
    if (r.error) return fail(503, r.error);
    return wantsJson ? json(200, { ok: true, flash: 'saved' }) : redirect('/settings?ok=saved');
  }

  // The video repo's voice (Ava Multilingual) reading text aloud, streamed as mp3 so the page's audio player starts on
  // the first chunk. A GET so <audio src> can stream it; only for a signed-in visitor on chat itself (the cookie is
  // SameSite=Lax, and the browser marks the request same-origin).
  if (request.method === 'GET' && path === '/voice') {
    if (!session) return json(401, { error: 'sign in first' });
    const site = request.headers.get('sec-fetch-site');
    if (site && site !== 'same-origin') return json(403, { error: 'this only works from chat itself' });
    const text = String(url.searchParams.get('t') || '').trim();
    if (!text) return json(400, { error: 'nothing to say' });
    if (text.length > MAX_SPEAK) return json(413, { error: `keep it under ${MAX_SPEAK} characters` });
    if (await overQuota(env, 'speak', { anon, id: await who(session.login) })) return json(429, { error: 'the voice has read enough for today' });
    const info = {}, t0 = Date.now();
    try {
      const lang = String(url.searchParams.get('l') || '').slice(0, 8);
      const stream = await (env.SPEAK || speakStream)(text, lang, { info, hedgeMs: AVA_RETRY_MS });
      // Time to the first audio and how many asks it took, so a slow voice can be told apart in the browser.
      return new Response(stream, { headers: { 'content-type': info.type || 'audio/mpeg', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'server-timing': `voice;dur=${Date.now() - t0};desc="${voiceDesc(info)}"` } });
    } catch (e) {
      console.log('upstream failed', String(e?.message || e));
      const res = json(502, { error: 'upstream request failed' });
      res.headers.set('server-timing', `voice;desc="${voiceDesc(info)}"`);
      return res;
    }
  }

  // A task on the computer in the visitor's own browser (browserpod.js): the page opens a WebSocket, sends the task, and
  // answers the computer calls. Same sign-in, same-origin rule, daily cap and model choice as POST /api/run.
  if (path === '/api/run' && (request.headers.get('upgrade') || '').toLowerCase() === 'websocket') {
    if (!session) return json(401, { error: 'sign in first' });
    if (request.headers.get('origin') !== origin) return json(403, { error: 'this only works from chat itself' });
    if (!podBase(env)) return json(404, { error: 'the browser computer is turned off here' });
    const { login } = session;
    // socketPair is for tests: Bun has no WebSocketPair and cannot build a 101 response.
    const [client, server] = socketPair ? socketPair() : Object.values(new WebSocketPair());
    server.accept?.();
    const gate = async (body) => {
      const chosen = resolveModel(body.ai);
      if (chosen.error) return { refuse: { status: 400, error: chosen.error, kind: chosen.kind } };
      const admitted = await admitTask(login, chosen);
      if (admitted.refuse) return { refuse: { status: 429, ...admitted.refuse } };
      const { m, refund } = admitted;
      return { model: m.ask, settle: () => refund(), maxSteps: chosen.free ? MAX_STEPS : BYO_STEPS, vision: !chosen.free && body.ai?.vision !== false, modelName: modelLabel(chosen) };
    };
    const job = runOverSocket(server, { lookupFacts: (q) => lookup(q), gate, origin, fetchImpl, publish: (content, o) => publishSite(env, login, content, origin, o?.limit), photo: (p) => sitePhoto(env, login, p), saveImage: (pic, p) => saveImage(env, login, pic, p, origin), saveVideo: async () => ({ error: 'a video needs a cloud computer' }) });
    if (waitUntil) waitUntil(job);
    return socketPair ? json(200, { socket: true }) : new Response(null, { status: 101, webSocket: client });
  }

  if (path.startsWith('/api/')) {
    if (!session) return json(401, { error: 'sign in first' });
    if (request.method !== 'POST' || !sameOrigin(request, origin)) return json(403, { error: 'this only works from chat itself' });
    const { login } = session;
    const fleet = fleetClient(env, login, fetchImpl);

    if (path === '/api/review-ai') {
      if (anon) return json(403, { error: 'PR reviews need GitHub sign-in' });
      const body = await readJson(request);
      const chosen = resolveModel({ ai: String(body?.ai || ''), key: String(body?.key || ''), model: String(body?.model || '') });
      if (chosen.error || chosen.free) return json(400, { error: chosen.error || 'pick an AI with your own key' });
      const r = await saveSettings(env, login, { ai: chosen.ai, model: chosen.model, key: chosen.key });
      return r.error ? json(503, { error: r.error }) : json(200, { ok: true });
    }

    if (path === '/api/connect') {
      const body = await readJson(request);
      const card = PROVIDER_CARDS.find((c) => c.id === body?.provider);
      if (!card) return json(400, { error: 'pick one of the providers' });
      const r = await fleet.connect(card.id, String(body.key || ''));
      return r.error ? json(400, { error: r.error }) : json(200, { ok: true });
    }

    if (path === '/api/transcribe') {
      const body = await readJson(request);
      const part = body?.part === true;
      const limit = limitOf(part ? 'voice-part' : 'voice', anon);
      if (await overQuota(env, part ? 'voice-part' : 'voice', { anon, id: await who(login) })) return json(429, { error: `You've used today's voice (${limit} ${part ? 'spoken phrases' : 'voice messages'}).${anon ? ' Sign in with GitHub for more, or come back tomorrow.' : ' Type instead, or come back tomorrow.'}` });
      const r = await transcribe(env, body);
      return r.error ? json(r.status, { error: r.error }) : json(200, { text: r.text, lang: r.lang });
    }

    // The talk page calls this when it opens: the visitor's own weather is fetched now, so asking for it answers at once.
    if (path === '/api/talk/warm') {
      const job = warmWeather(placeFrom(request.cf), fetchImpl).catch(() => {});
      if (waitUntil) waitUntil(job);
      else await job;
      return json(200, { ok: true });
    }

    if (path === '/api/talk') {
      const body = await readJson(request);
      const timing = [];
      const timed = (name, t0) => timing.push(`${name};dur=${Date.now() - t0}`);
      // One round trip per spoken turn: the audio comes with the request, is written down here, then answered.
      let heard = '', lang = String(body?.lang || '').slice(0, 8);
      if (body?.audio) {
        if (await overQuota(env, 'voice', { anon, id: await who(login) })) return json(429, { error: `You've used today's ${limitOf('voice', anon)} voice messages.${anon ? ' Sign in with GitHub for more, or come back tomorrow.' : ' Come back tomorrow.'}` });
        const t0 = Date.now();
        const t = await transcribe(env, body);
        timed('stt', t0);
        if (t.error) return json(t.status, { error: t.error });
        heard = t.text;
        // Whisper guesses uk or ru per clip; the words, the chat's last language and the page language settle it.
        lang = resolveLang({ text: t.text, heard: t.lang, sticky: lang, ui: body?.ui });
        if (!heard) return json(200, { heard: '', lang, text: '' });
      }
      const history = Array.isArray(body?.history) ? body.history.slice(-12) : [];
      if (heard) history.push({ role: 'user', content: heard });
      // A typed turn has no Whisper hint, so the words of the last message settle the language, not a stale one from the page.
      else { const last = history[history.length - 1]; if (last?.role === 'user') lang = resolveLang({ text: String(last.content || ''), sticky: lang, ui: body?.ui }); }
      const messages = talkMessages(history, lang, body?.memo);
      const note = await weatherNote(messages[messages.length - 1]?.content, fetchImpl, placeFrom(request.cf));
      if (note) messages[0] = { role: 'system', content: `${messages[0].content}\n${note}` };
      if (messages.length < 2 || messages[messages.length - 1].role !== 'user') return json(400, { error: 'say something first' });
      const chosen = resolveModel(body.ai);
      if (chosen.error) return json(400, { error: chosen.error, kind: chosen.kind });
      if (chosen.free && (await overQuota(env, 'talk', { anon, id: await who(login) }))) return json(429, { error: `That's your ${limitOf('talk', anon)} free voice replies for today.${anon ? ' Sign in with GitHub for more.' : ''} Keep going free with your own OpenRouter account in the model menu, or come back tomorrow.` });
      const t1 = Date.now();
      // Voice talk asks for a stream: each sentence goes out as soon as it is written, so the page starts reading the first
      // one while the rest is still coming. {heard,lang}, then {say} per sentence, then {done,text,build} (or {error}).
      if (body?.stream === true) {
        const { readable, writable } = new TransformStream();
        const w = writable.getWriter();
        const enc = new TextEncoder();
        const emit = (e) => w.write(enc.encode(JSON.stringify(e) + '\n')).catch(() => {});
        emit({ heard, lang });
        const last = heard || String(messages[messages.length - 1]?.content || '');
        // An answer to "build me ..." is read after it is whole: only its first sentence is spoken, and a model may answer in JSON.
        const split = sentenceSplitter({ hold: asksBuild(last) });
        let deltas = 0;
        const job = (async () => {
          const r = await modelFrom(env, fetchImpl, chosen, freeModelOpts(env, await who(login), anon))(messages, { onDelta: (d) => { deltas++; for (const s of split.push(d)) { const t = spokenReply(s); if (t) emit({ say: t }); } } });
          timed('llm', t1);
          if (r.error) { emit({ error: r.error, kind: r.kind }); return; }
          const { text, build } = talkReply(r.text, heard || String(messages[messages.length - 1]?.content || ''), messages);
          if (!text) { emit({ error: 'the model sent an empty answer' }); return; }
          // A model that streamed has said all but its last words; one that cannot (Flisk Wolf) sends the whole answer now.
          const rest = deltas && split.live && !build ? split.flush().map(spokenReply).filter(Boolean) : splitReply(text);
          for (const s of rest) emit({ say: s });
          emit({ done: true, text, ...(build ? { build } : {}), timing: timing.join(', ') });
        })()
          .catch((e) => emit({ error: String(e?.message || e).slice(0, 200) }))
          .finally(() => w.close().catch(() => {}));
        if (waitUntil) waitUntil(job);
        return new Response(readable, { headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } });
      }
      const r = await modelFrom(env, fetchImpl, chosen, freeModelOpts(env, await who(login), anon))(messages);
      timed('llm', t1);
      // Server-Timing says which step of a slow turn was slow (Whisper or the model).
      const withTiming = (res) => { res.headers.set('server-timing', timing.join(', ')); return res; };
      if (r.error) return withTiming(json(502, { error: r.error, kind: r.kind }));
      const { text, build } = talkReply(r.text, heard || String(messages[messages.length - 1]?.content || ''), messages);
      return withTiming(text ? json(200, { heard, lang, text, ...(build ? { build } : {}) }) : json(502, { error: 'the model sent an empty answer' }));
    }

    if (path === '/api/memo') {
      const body = await readJson(request);
      const msgs = Array.isArray(body?.msgs) ? body.msgs : [];
      if (!msgs.length) return json(400, { error: 'nothing to remember' });
      const chosen = resolveModel(body.ai);
      if (chosen.error) return json(400, { error: chosen.error, kind: chosen.kind });
      if (chosen.free && (await overQuota(env, 'memo', { anon, id: await who(login) }))) return json(429, { error: 'memo limit for today' });
      const r = await modelFrom(env, fetchImpl, chosen, freeModelOpts(env, await who(login), anon))(memoMessages(body.memo, msgs));
      if (r.error) return json(502, { error: r.error });
      const memo = cleanMemo(r.text);
      return memo ? json(200, { memo }) : json(502, { error: 'empty summary' });
    }

    if (path === '/api/run') {
      const body = await readJson(request);
      const task = String(body?.task || '').trim();
      if (!task) return json(400, { error: 'type a task' });
      if (task.length > MAX_TASK) return json(400, { error: `keep the task under ${MAX_TASK} characters` });
      const connections = await fleet.connections().catch(() => null);
      if (connections === null) return json(502, { error: 'chat could not reach fleet, try again in a minute' });
      // No computer connected: answer straight away on the Worker, and only when the model asks for a computer, send the page
      // to start the one in the visitor's browser (body.pod). A plain question then needs no Linux boot (4 s on a phone).
      const noPod = !Object.keys(connections).length;
      if (noPod && body.pod) return json(409, { error: 'connect a computer first', needProvider: true });
      // Which AI answers, and which of the user's computers may be used (empty = fleet picks the cheapest).
      const chosen = resolveModel(body.ai);
      if (chosen.error) return json(400, { error: chosen.error, kind: chosen.kind });
      const order = Array.isArray(body.providers) ? [...new Set(body.providers.map(String))].slice(0, 20) : [];
      const missing = order.find((p) => !connections[p]);
      if (missing) return json(400, { error: `${missing} is not connected yet. Connect it, or tick another computer` });
      // Only the shared free model counts against the daily cap; the visitor's own key costs us nothing.
      const admitted = await admitTask(login, chosen);
      if (admitted.refuse) { await sendTrace(env, { route: '/api/run', kind: 'capped', why: 'the free daily limit stopped a task', status: 429 }, fetchImpl); return json(429, admitted.refuse); }
      const { m, refund } = admitted;
      const { readable, writable } = new TransformStream();
      const w = writable.getWriter();
      const enc = new TextEncoder();
      let needPod = false, buffered = [];
      // Opt-in: a client that asks for cogito frames gets them (src/cogito.js); everyone else gets chat's own events as before.
      const tr = wantsCogito(request) ? cogitoStream() : null;
      if (tr) w.write(enc.encode(tr.hello())).catch(() => {});
      const send = (e) => w.write(enc.encode(tr ? tr.encode(e) : JSON.stringify(e) + '\n')).catch(() => {});
      // Without a computer the steps are held until we know the task needs none; plain answers are then sent all at once.
      // Status-only events (they set the label and add no step) go out at once even with no computer, so the visitor sees "Thinking"
      // while the model works. Steps stay held: they are dropped if the task turns out to need a computer.
      const emit = (e) => { if (!noPod || EARLY_EVENTS.has(e.type)) return send(e); if (needPod) return; if (e.type === 'pod_starting') { needPod = true; buffered = []; return; } buffered.push(e); };
      const computer = noPod ? { ...fleet, start: async () => ({ error: ['needs', 'a computer'].join(' ') }) } : fleet;
      const github = anon ? null : { login, ...((await loadGithubToken(env, login).catch(() => null)) || {}) };
      const heuristicLang = resolveLang({ text: task, sticky: String(body?.lang || '').slice(0, 8), ui: body?.ui });
      // Jev names the language and the kind of ask; the word lists only win when they are certain (Ukrainian vs Russian words).
      const decision = await (decide(env)?.(task, { needLang: !detectLang(task) }) ?? null);
      const turnLang = decision?.lang && !detectLang(task) ? decision.lang : heuristicLang;
      if (decision?.lang && heuristicLang && decision.lang !== heuristicLang) await sendTrace(env, { route: '/api/run', kind: 'unexpected', why: `Jev says ${decision.lang}, word lists say ${heuristicLang}`, lang: turnLang }, fetchImpl);
      const job = runTask({ mode: cleanMode(body.mode), search: (q) => searchWeb(q, { fetch: fetchImpl }), grade: gradeReply(env), stream: true, decision, classify: imageIntent(env), lookupFacts: (q) => lookup(q), task, history: body.history, lang: turnLang, kind: String(body?.cat || '').slice(0, 12), memo: body?.memo, github, origin, model: m.ask, maxSteps: chosen.free ? MAX_STEPS : (github?.token ? GITHUB_STEPS : BYO_STEPS), computer, track: podTracker(env, login, fleet), fetchImpl, citable: env.CITABLE ? (u, init) => env.CITABLE.fetch(u, init) : null, order, files: cleanFiles(body.files), vision: !chosen.free && body.ai?.vision !== false, modelName: modelLabel(chosen), publish: (content, o) => publishSite(env, login, content, origin, o?.limit), photo: (p) => sitePhoto(env, login, p), saveImage: (pic, p) => saveImage(env, login, pic, p, origin), saveVideo: (parts, title) => saveVideo(env, login, parts, title, origin), emit })
        .then(async (r) => {
          if (needPod) return;
          for (const e of buffered) send(e);
          await recordRun(env, { task, ai: modelLabel(chosen), free: !!chosen.free, anon, result: r, login }).catch(() => {});
          await alertRun(env, { task, ai: modelLabel(chosen), anon, result: r }, fetchImpl).catch(() => {});
          for (const t of runEvents(r, runProblem(r), '/api/run', turnLang)) await sendTrace(env, t, fetchImpl);
          if (!needPod) send({ type: 'done', ms: r.ms, error: r.error });
        })
        .catch(async (e) => { await sendTrace(env, { route: '/api/run', kind: 'error', why: `task crashed: ${String(e?.message || e).slice(0, 150)}` }, fetchImpl); for (const x of buffered) send(x); send({ type: 'error', error: String(e?.message || e).slice(0, 200) }); })
        .finally(async () => {
          if (needPod) send({ type: 'needcomputer' });
          await refund(needPod);
          await w.close().catch(() => {});
        });
      if (waitUntil) waitUntil(job);
      return new Response(readable, { headers: { 'content-type': tr ? COGITO_TYPE : 'application/x-ndjson', 'cache-control': 'no-store', 'x-accel-buffering': 'no', ...(tr ? { vary: 'Accept' } : {}) } });
    }
  }
  return html(notFoundPage('Page not found', 'Nothing lives at this address.'), 404);
}

export default {
  // The voice button records, so the microphone stays allowed for chat's own pages; camera and location are off.
  fetch: async (request, env, ectx) =>
    withSecurityHeaders(
      await handle(request, env, { waitUntil: ectx?.waitUntil ? (p) => ectx.waitUntil(p) : null }).catch((e) => json(500, { error: 'chat failed: ' + String(e?.message || e).slice(0, 200) })),
      { permissionsPolicy: 'camera=(), microphone=(self), geolocation=()' },
    ),
  // Hourly (wrangler.toml [triggers]): delete computers that are past their time.
  scheduled: (event, env, ectx) => {
    ectx.waitUntil(cleanPods(env).then((r) => console.log('cleanPods', JSON.stringify(r))));
    ectx.waitUntil(reportLostReviews(env).then((r) => console.log('lostReviews', JSON.stringify(r))).catch((e) => console.log('lostReviews failed', String(e?.message || e))));
  },
};

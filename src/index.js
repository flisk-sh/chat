import { githubAuthorizeUrl, githubLogin } from './auth.js';
import { forgetGithubToken, loadGithubToken, saveGithubToken } from './github.js';
import { THREE_SRC, TEXTURES } from './earth.js';
import { fleetClient } from './fleet.js';
import { BYO_STEPS, GITHUB_STEPS, cleanFiles, MAX_STEPS, MAX_TASK, modelFrom, modelLabel, resolveModel, runTask, WORKERS_AI_PER_DAY } from './loop.js';
import { appPage, cleanModels, DEFAULT_MODELS, messagePage, PROVIDER_CARDS, reviewsPage, THEME_IDS } from './page.js';
import { deleteSettings, loadSettings, saveSettings } from './keys.js';
import { githubWebhook, REVIEWS_PER_DAY } from './review.js';
import { runResult } from './run.js';
import { KEEP_DAYS, KEPT_PER_LOGIN } from './share.js';
import { ANON_DAYS, clearSession, isAnon, makeSession, newAnonLogin, readSession, sameOrigin } from './session.js';
import { speakStream, MAX_SPEAK } from './tts.js';
import { placeFrom, warmWeather, weatherNote } from './weather.js';

export const TASKS_PER_DAY = 20;
// Visitors without GitHub are counted by network address, not by cookie (a cookie can be thrown away), so their share is smaller.
export const ANON_TASKS_PER_DAY = 10;
export const ANON_VOICE_PER_DAY = 20;
export const ANON_TALK_PER_DAY = 30;
export const ANON_SPEAK_PER_DAY = 150;
export const ANON_PER_PERSON_BACKUP = 10;
export const MAX_SITE_BYTES = 200 * 1024;
export const SITES_PER_LOGIN = 5;
export const VIDEOS_PER_LOGIN = 5;
export const VOICE_PER_DAY = 60;
// The mic sends one request per spoken phrase (it writes while you talk), so phrases have their own, larger allowance.
export const VOICE_PARTS_PER_DAY = 400;
export const ANON_VOICE_PARTS_PER_DAY = 120;
export const MAX_AUDIO_B64 = 1_400_000; // about 1 MB of audio, a minute of speech
export const WHISPER_MODEL = '@cf/openai/whisper-large-v3-turbo';
export const TALK_PER_DAY = 100;
export const SPEAK_PER_DAY = 600; // answers read aloud by the Ava voice, per login
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
  const j = t.match(/\{[\s\S]*\}/);
  if (j && (t.startsWith('{') || t.startsWith('```'))) {
    try { const o = JSON.parse(j[0]); build = String(o.build || o.task || '').trim().slice(0, 2000); t = String(o.say || o.answer || o.text || o.reply || '').trim(); } catch {}
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
  // The Earth look loads three.js and its globe textures from these exact folders only (see earth.js).
  'content-security-policy': `default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-inline' https://flisk.si https://flisk.sh ${THREE_SRC}; img-src 'self' data: blob: https://flisk.si ${TEXTURES.join(' ')}; media-src 'self' data: blob:; connect-src 'self' https://analytics.flisk.si https://openrouter.ai/api/v1/models https://openrouter.ai/api/v1/auth/keys; form-action 'self' https://github.com; frame-ancestors 'none'; base-uri 'none'`,
};
// A visitor who has no look yet gets Earth and keeps it in a cookie; the switch under the box changes it.
export const DEFAULT_THEME = 'earth';
// The shared Flisk look (the bar's ?flisk_theme= parameter, or its flisk_theme cookie on .flisk.si) maps onto the closest of
// the five chat looks: ivory and soft glow have their own, other light looks get Focus, dark looks get Classic.
const LIGHT_LOOKS = new Set(['paper-tool', 'editorial-ruled', 'soft-satoshi', 'clean', 'ice', 'chapters']);
export const lookForFliskTheme = (id) => (id === 'ivory' ? 'ivory' : id === 'cool-glow' ? 'glow' : LIGHT_LOOKS.has(id) ? 'focus' : /^[a-z-]{2,24}$/.test(id || '') ? 'classic' : undefined);
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

// The free model's last fallback (Workers AI on our account) has one daily cap for everyone, so chat keeps to its share.
// Each person may use only a share of it, so one busy visitor cannot use up the day for everybody.
export const WORKERS_AI_PER_PERSON = 40;
export const freeModelOpts = (env, login = '', anon = false) => ({
  overLimit: async () => (login && (await overDailyLimit(login, { cache: env.LIMIT_CACHE, limit: anon ? ANON_PER_PERSON_BACKUP : WORKERS_AI_PER_PERSON, scope: anon ? 'workers-ai-anon' : 'workers-ai-person' }))) || overDailyLimit('everyone', { cache: env.LIMIT_CACHE, limit: WORKERS_AI_PER_DAY, scope: 'workers-ai-fallback' }),
  log: (tried) => console.log('free model fallbacks all failed', JSON.stringify(tried).slice(0, 600)),
});

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
  for (const tag of [/<head(\s[^>]*)?>/i, /<html(\s[^>]*)?>/i, /<!doctype[^>]*>/i]) {
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
  const page = withStorageShim(row.html);
  const body = /<\/body>/i.test(page) ? page.replace(/<\/body>/i, () => `${room}${bar}</body>`) : page + room + bar;
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
  if (request.method === 'GET' && path === '/robots.txt') return new Response('User-agent: *\nAllow: /$\nDisallow: /s/\nDisallow: /v/\nDisallow: /api/\nSitemap: https://chat.flisk.si/sitemap.xml\n', { headers: { 'content-type': 'text/plain' } });
  if (request.method === 'GET' && path === '/sitemap.xml') return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://chat.flisk.si/</loc></url></urlset>', { headers: { 'content-type': 'application/xml' } });

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
  if (request.method === 'POST' && path === '/github/webhook') return githubWebhook(request, { ...env, PUBLIC_ORIGIN: origin, freeModelLimit: freeModelOpts(env).overLimit }, { fetchImpl, waitUntil, overLimit: (login) => overDailyLimit(login, { cache: env.LIMIT_CACHE, limit: REVIEWS_PER_DAY, scope: 'review-limit' }) });

  if (request.method === 'POST' && path === '/github/run-result') return runResult(request, { ...env, PUBLIC_ORIGIN: origin }, { fetchImpl, waitUntil });

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
    const have = await readSession(env, request);
    // ?again=1: someone who signed in before chat asked for GitHub access goes through GitHub once more to allow it.
    if (have && !isAnon(have.login) && !url.searchParams.get('again')) return redirect('/');
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
  if (request.method === 'GET' && path === '/') {
    const models = await loadCatalog(env);
    const { theme, cookie } = pickTheme(request);
    // The session cookie goes first and the look cookie last.
    const withLook = (res) => {
      if (cookie) res.headers.append('set-cookie', cookie);
      return res;
    };
    // The talk circle's Earth turns to the visitor's side of the world (whole degrees only).
    const spot = placeFrom(request.cf);
    const here = spot ? { lat: Math.round(spot.latitude), lng: Math.round(spot.longitude) } : null;
    const page = (opts) => html(appPage({ ...opts, models, theme, here }));
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

  if (request.method === 'GET' && path === '/reviews') {
    if (!session || anon) return redirect('/auth/start');
    return html(reviewsPage({ login: session.login, saved: await loadSettings(env, session.login).catch(() => null), stored: !!env.KEY_SECRET, limit: REVIEWS_PER_DAY, flash: url.searchParams.get('ok') || '' }));
  }
  if (request.method === 'POST' && (path === '/reviews/save' || path === '/reviews/delete')) {
    if (!session || anon) return redirect('/auth/start');
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
    if (await overDailyLimit(await who(session.login), { cache: env.LIMIT_CACHE, limit: anon ? ANON_SPEAK_PER_DAY : SPEAK_PER_DAY, scope: anon ? 'speak-anon' : 'speak-limit' })) return json(429, { error: 'the voice has read enough for today' });
    try {
      const info = {}, t0 = Date.now();
      const stream = await (env.SPEAK || speakStream)(text, String(url.searchParams.get('l') || '').slice(0, 8), { info });
      // Time to the first audio and how many asks it took, so a slow voice can be told apart in the browser.
      return new Response(stream, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'server-timing': `voice;dur=${Date.now() - t0};desc="${info.tries || 1} tries"` } });
    } catch (e) {
      return json(502, { error: String(e?.message || e).slice(0, 160) });
    }
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
      const limit = part ? (anon ? ANON_VOICE_PARTS_PER_DAY : VOICE_PARTS_PER_DAY) : anon ? ANON_VOICE_PER_DAY : VOICE_PER_DAY;
      const scope = (part ? 'voice-part' : 'voice') + (anon ? '-anon' : '-limit');
      if (await overDailyLimit(await who(login), { cache: env.LIMIT_CACHE, limit, scope })) return json(429, { error: `You've used today's voice (${limit} ${part ? 'spoken phrases' : 'voice messages'}).${anon ? ' Sign in with GitHub for more, or come back tomorrow.' : ' Type instead, or come back tomorrow.'}` });
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
        if (await overDailyLimit(await who(login), { cache: env.LIMIT_CACHE, limit: anon ? ANON_VOICE_PER_DAY : VOICE_PER_DAY, scope: anon ? 'voice-anon' : 'voice-limit' })) return json(429, { error: `You've used today's ${anon ? ANON_VOICE_PER_DAY : VOICE_PER_DAY} voice messages.${anon ? ' Sign in with GitHub for more, or come back tomorrow.' : ' Come back tomorrow.'}` });
        const t0 = Date.now();
        const t = await transcribe(env, body);
        timed('stt', t0);
        if (t.error) return json(t.status, { error: t.error });
        heard = t.text;
        lang = t.lang || lang;
        if (!heard) return json(200, { heard: '', lang, text: '' });
      }
      const history = Array.isArray(body?.history) ? body.history.slice(-12) : [];
      if (heard) history.push({ role: 'user', content: heard });
      const messages = talkMessages(history, lang);
      const note = await weatherNote(messages[messages.length - 1]?.content, fetchImpl, placeFrom(request.cf));
      if (note) messages[0] = { role: 'system', content: `${messages[0].content}\n${note}` };
      if (messages.length < 2 || messages[messages.length - 1].role !== 'user') return json(400, { error: 'say something first' });
      const chosen = resolveModel(body.ai);
      if (chosen.error) return json(400, { error: chosen.error, kind: chosen.kind });
      if (chosen.free && (await overDailyLimit(await who(login), { cache: env.LIMIT_CACHE, limit: anon ? ANON_TALK_PER_DAY : TALK_PER_DAY, scope: anon ? 'talk-anon' : 'talk-limit' }))) return json(429, { error: `That's your ${anon ? ANON_TALK_PER_DAY : TALK_PER_DAY} free voice replies for today.${anon ? ' Sign in with GitHub for more.' : ''} Keep going free with your own OpenRouter account in the model menu, or come back tomorrow.` });
      const t1 = Date.now();
      const r = await modelFrom(env, fetchImpl, chosen, freeModelOpts(env, await who(login), anon))(messages);
      timed('llm', t1);
      // Server-Timing says which step of a slow turn was slow (Whisper or the model).
      const withTiming = (res) => { res.headers.set('server-timing', timing.join(', ')); return res; };
      if (r.error) return withTiming(json(502, { error: r.error, kind: r.kind }));
      const { text, build } = talkReply(r.text, heard || String(messages[messages.length - 1]?.content || ''), messages);
      return withTiming(text ? json(200, { heard, lang, text, ...(build ? { build } : {}) }) : json(502, { error: 'the model sent an empty answer' }));
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
      if (chosen.free && (await overDailyLimit(await who(login), { cache: env.LIMIT_CACHE, limit: anon ? ANON_TASKS_PER_DAY : TASKS_PER_DAY, scope: anon ? 'chat-anon' : 'chat-limit' }))) {
        const now = new Date();
        const resetsIn = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime();
        return json(429, { error: `That's your ${anon ? ANON_TASKS_PER_DAY : TASKS_PER_DAY} free tasks for today`, limit: anon ? ANON_TASKS_PER_DAY : TASKS_PER_DAY, resetsIn, anon });
      }
      const { readable, writable } = new TransformStream();
      const w = writable.getWriter();
      const enc = new TextEncoder();
      const emit = (e) => w.write(enc.encode(JSON.stringify(e) + '\n')).catch(() => {});
      const github = anon ? null : { login, ...((await loadGithubToken(env, login).catch(() => null)) || {}) };
      const job = runTask({ task, history: body.history, github, origin, model: modelFrom(env, fetchImpl, chosen, freeModelOpts(env, await who(login), anon)), maxSteps: chosen.free ? MAX_STEPS : (github?.token ? GITHUB_STEPS : BYO_STEPS), computer: fleet, track: podTracker(env, login, fleet), fetchImpl, order, files: cleanFiles(body.files), vision: !chosen.free && body.ai?.vision !== false, modelName: modelLabel(chosen), publish: (content) => publishSite(env, login, content, origin), saveVideo: (parts, title) => saveVideo(env, login, parts, title, origin), emit })
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
  // Hourly (wrangler.toml [triggers]): delete computers that are past their time.
  scheduled: (event, env, ectx) => ectx.waitUntil(cleanPods(env).then((r) => console.log('cleanPods', JSON.stringify(r)))),
};

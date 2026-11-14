import { widgetPrompt, parseWidget } from './widgets.js';
import { cleanVideo, makeVideo } from './video.js';
import { cleanSystem, makeSystem, MAX_SERVICES } from './system.js';
import { cleanShare, KEEP_DAYS, shareApp } from './share.js';
import { githubNote, scrub, setupGithub } from './github.js';
// One task: a model plans, a computer from fleet does the work, the answer comes back. One task = one computer,
// started on the first action and always stopped at the end.
export const MAX_STEPS = 8;
// The visitor's own key pays for its own steps, so a bigger app (install, write several files, start, check) fits.
export const BYO_STEPS = 16;
export const GITHUB_STEPS = 20; // a fork-to-PR run needs more than 16 actions, but Workers Free stops at 50 subrequests per run (a 32-action run died at 25)
export const MAX_TASK = 2000;
const OUT_CHARS = 1500;

export const SYSTEM = `You are Flisk Chat. You do the user's task on a real Linux computer (sh, curl and usually python3).

CRITICAL: Your entire reply must be exactly one JSON object and nothing else.
No markdown, no XML, no tags, no <|DSML|>, no tool-call wrappers, no explanations before or after.
Only the JSON.

Pick exactly one of these shapes:
{"run": "<shell command>"}
{"write": {"path": "<file>", "content": "<text>"}}
{"read": "<file>"}
{"publish": "<path to an index.html>"}
{"video": {"title": "<short title>", "scenes": [{"text": "<words on screen, at most 10>", "say": "<one spoken sentence>"}]}}
{"system": {"title": "<name>", "services": [{"name": "<lowercase-name>", "does": "<one short phrase>", "fields": ["<column>"]}]}}
{"widget": {"kind": "<widget>", ...}}
{"say": "<answer for the user>"}

Rules:
- Use the computer for anything you can check: maths, code, data, files, web pages (curl).
- One action per reply. Keep commands short. Never wait for input; add -y to installs.
- For more than one line of code, "write" a file first, then "run" it. Never put several lines into python3 -c.
- Escape every " inside a string as \\" and every newline as \\n so the JSON is valid.
- To make a website that only shows things (a landing page, a portfolio, a menu, an event page: nothing for the visitor to add, save or delete): "write" ONE self-contained index.html (inline CSS and JS, no external files or CDNs, under 200 KB, good looking: a hero section, a calm colour palette, system fonts, cards or sections with spacing and rounded corners; mobile friendly. Never invent a phone number, email address or street address: write "Add your address here" style placeholders), then "publish" it, then "say" the link in one sentence.
- Anything where people add, save, change or delete data (a CRM, a tracker, a shop, a booking tool, a to-do list, a dashboard with records) is an app, never a published page: build it with Flisk (below) so it has a real API, and share it. Never keep an app's data in localStorage and never publish a one-file copy of an app.
- To make a video (the user asks for a video, a clip or a promo, or the answers say "What: A video"): send ONE "video" action with 4 to 6 scenes. Chat draws the scenes, records a voice-over and makes an mp4 on the computer (it takes a few minutes), then tells you the link. Then "say" the link in one sentence. Never invent a phone number, email address or street address.
- For a bigger app with several parts (the user asks for a CRM, a back office, an ERP-style suite, a platform, "several services", "a bigger app", or the answers say "What: A system of services"): send ONE "system" action with 3 to ${MAX_SERVICES} parts named after the business areas (contacts, deals, tasks; or orders, stock, billing...), each with up to 6 "fields" (the columns a person fills in), for example {"system": {"title": "Sales CRM", "services": [{"name": "contacts", "does": "people and companies", "fields": ["Name", "Email", "Company"]}, {"name": "deals", "does": "open deals", "fields": ["Title", "Value", "Stage"]}]}}. Chat makes ONE Flisk project in ~/app with a backend per part (records saved to a file), a website in front that adds, lists and deletes records with real calls to /api/<part>, starts it all with flisk up and checks every part through the website. Do NOT rewrite the generated files unless the user asked for a specific change (the page already works); send {"share": <the website port it gives you>} right away and "say" the link FIRST, then what was checked (a table). Never write a one-file copy. Be honest: it is a working first version with simple records, not a finished product.
- For an app with several parts (a website plus an API, a worker; the user asks for an app, a shop, a dashboard with data): use Flisk. This computer has no Docker, so Flisk runs each part as a plain process. Follow these steps exactly; never read flisk --help or files under .flisk/:
  1. {"run": "curl -fsSL https://flisk.sh/install.sh | sh >/dev/null 2>&1; command -v bun >/dev/null || curl -fsSL https://bun.sh/install | bash >/dev/null 2>&1; export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH; cd ~ && flisk create app --frontend vanilla --language node --yes 2>&1 | tail -8; ls ~/app/api ~/app/api/src ~/app/web"}
     It makes ~/app/api (a Node API in src/index.js that already answers /health) and ~/app/web (the website), each with a service.json that has a \"command\".
  2. "write" your code over the generated files without reading them first: the API into ~/app/api/src/index.js (keep its port from process.env.PORT and /health; every other route starts with /api, for example /api/contacts), the page into the website's index.html. The page calls the API with fetch('/api/...') on its own address, never localhost or a port number: Flisk's website forwards /api to the API. For data use SQLite in a file inside the API (Node 22: import { DatabaseSync } from 'node:sqlite'; new DatabaseSync('data.db')), not a database server.
  3. {"run": "export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH; cd ~/app && (cd api && npm install --silent) && (cd web && npm install --silent); (nohup flisk up > /tmp/up.log 2>&1 &); sleep 20; tail -15 /tmp/up.log"}
  4. Check it with curl through the website's port (curl the page, then add a record with POST /api/... and read it back), so the check goes the same way a visitor's clicks do.
  5. {"share": <the website's port from that log>} gives the running app a public link: the real website and the real API, kept running after you answer. Then "say" that link FIRST, then what you checked with curl.
- Only if share returned an error saying this computer cannot have a public link (never when it returned a live link): do NOT make a copy of the app. "say" plainly: the app was built and checked on the computer (what you checked), but this computer's provider cannot give it a public link, so it stops when you answer; connecting a provider that can (for example Upstash Box) gives a live link next time.
- Every app ends with a shared live link and every show-only page with a published link, in the same answer. Never end with an offer to publish later or with only a localhost address.
- Each task starts on a fresh computer: files and servers from earlier answers are gone. If the user asks for the link to something built earlier, build it again, then publish it.
- After at most ${MAX_STEPS - 1} actions, reply with "say". If the task needs no computer, reply with "say" at once.
- Widgets draw a card for the user from data. Prefer one whenever it fits; the computer is only for work a widget cannot do:
${widgetPrompt()}
- In "say", give the result itself (numbers, the content, the link), not a description of the steps.
- "say" is shown as Markdown: **bold**, "- " lists, and "| a | b |" tables. For weather, prices, schedules or any comparison over days or items, give one line with the current state, then a table (for weather: Day | Sky | High / Low | Rain chance, for the next 7 days), then 2 or 3 bullets with what it means for the user. Keep plain questions short with no table.

Remember: reply is only the JSON object. Nothing else.`;

export function parseAction(text) {
  let s = String(text ?? '').trim();

  // Strip common tool-call / DSML / XML wrappers the free model sometimes emits.
  s = s
    .replace(/<\|DSML\|>[\s\S]*?<\|\/DSML\|>/gi, '')
    .replace(/<\/?invoke[^>]*>/gi, '')
    .replace(/<\/?parameter[^>]*>/gi, '')
    .replace(/<\|[^|]+\|>/g, '')
    .trim();

  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const a = JSON.parse(s.slice(start, end + 1));
      if (typeof a?.run === 'string' && a.run.trim()) return { type: 'run', command: a.run.trim() };
      if (a?.write && typeof a.write.path === 'string' && typeof a.write.content === 'string') return { type: 'write', path: a.write.path, content: a.write.content };
      if (typeof a?.read === 'string' && a.read.trim()) return { type: 'read', path: a.read.trim() };
      if (typeof a?.publish === 'string' && a.publish.trim()) return { type: 'publish', path: a.publish.trim() };
      if (a?.video) {
        const spec = cleanVideo(a.video);
        if (spec) return { type: 'video', spec };
      }
      if (a?.system) {
        const spec = cleanSystem(a.system);
        if (spec) return { type: 'system', spec };
      }
      if (a?.share !== undefined) {
        const spec = cleanShare(a.share);
        if (spec) return { type: 'share', spec };
      }
      if (a?.widget && typeof a.widget === 'object') return { type: 'widget', raw: a.widget };
      if (typeof a?.say === 'string') return { type: 'say', text: a.say };
    } catch {}
    if (/^\s*\{\s*"(run|write|read|publish|video|system|share|widget)"\s*:/.test(s.slice(start))) return { type: 'bad', text: s };
  }

  // If it still looks like a tool call or XML, force a retry.
  if (/DSML|<invoke|<parameter|tool_call|function_call/i.test(String(text))) {
    return { type: 'bad', text: String(text) };
  }

  return { type: 'say', text: s || '(no answer)' };
}

const clip = (s, n = OUT_CHARS) => {
  const t = String(s ?? '');
  return t.length > n ? `${t.slice(0, n)}\n…(${t.length - n} more characters cut)` : t;
};

// Who answers. "wolf" is Flisk Inference (free, shared, answers capped at 1024 tokens). The others use the visitor's own API key,
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

// Calls one model (OpenAI-compatible). Errors come back as { error }.
function oneModel(env = {}, fetchImpl = fetch, chosen = { ai: 'wolf', free: true }) {
  const url = chosen.free ? env.INFERENCE_URL || 'https://inference.flisk.si/v1/chat/completions' : chosen.url;
  const model = chosen.free ? env.INFERENCE_MODEL || 'flisk-wolf-chat' : chosen.model;
  const key = chosen.free ? env.INFERENCE_KEY : chosen.key;
  // Claude 5 thinks before it answers and thinking counts against max_tokens, so a Claude key gets room for both.
  const maxTokens = chosen.free || chosen.referer ? 1024 : chosen.ai === 'anthropic' ? 16000 : 4096;
  // The free model is another Worker on our own domain: Cloudflare refuses a Worker calling it by its public address
  // (error 1033), so the call goes through a service binding when there is one.
  const call = chosen.free && env.INFERENCE ? (u, init) => env.INFERENCE.fetch(u, init) : fetchImpl;
  return async (messages) => {
    if (!key) return { error: 'chat has no model key yet (INFERENCE_KEY)' };
    // Newer models refuse settings other models take: Claude 4.7 and later answer 400 to any `temperature` below 1, and
    // OpenAI's newer models want `max_completion_tokens` instead of `max_tokens`. So a model the visitor brings is called
    // without `temperature` (and OpenAI with `max_completion_tokens`), and a 400 that names one of them is retried once
    // with that setting fixed. (Anthropic's docs: platform.claude.com/docs/en/api/openai-sdk, "Request fields".)
    const opts = { temperature: chosen.free || chosen.referer || chosen.ai === 'openrouter', completion: chosen.ai === 'openai' };
    const send = async () => {
      const r = await call(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'user-agent': 'flisk-chat', ...(chosen.referer ? { 'http-referer': 'https://chat.flisk.si', 'x-title': 'Flisk Chat' } : {}) },
        body: JSON.stringify({ model, messages, [opts.completion ? 'max_completion_tokens' : 'max_tokens']: maxTokens, ...(opts.temperature ? { temperature: 0 } : {}) }),
      });
      return { res: r, body: await r.json().catch(() => null) };
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
    const text = body?.choices?.[0]?.message?.content;
    if (typeof text === 'string' && text.trim()) return { text };
    if (text && typeof text === 'object') return { text: JSON.stringify(text) };
    // Reasoning models sometimes spend the whole answer thinking and write nothing; say so, and let the loop retry.
    const finish = body?.choices?.[0]?.finish_reason;
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
export const OPENROUTER_PREFERRED = ['google/gemma-4-31b-it:free', 'google/gemma-4-26b-a4b-it:free', 'nvidia/nemotron-3.5-lightning:free', 'nvidia/nemotron-3-ultra-550b-a55b:free', 'nvidia/nemotron-3.5-super-vl:free'];
export const WORKERS_AI_FALLBACK = '@cf/meta/llama-3.1-8b-instruct-fast';
export const WORKERS_AI_PER_DAY = 300; // about 1,500 neurons at most: chat's share of the account's free 10,000
export const FREE_BUSY = 'The free AI is busy right now. Try again in a minute, or keep going free with your own OpenRouter account.';
const WOLF_REST_MS = 10 * 60 * 1000;
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

function workersAiModel(env, overLimit) {
  return async (messages) => {
    if (!env.AI) return { error: 'no Workers AI binding', kind: 'provider' };
    if (overLimit && (await overLimit())) return { error: 'the Workers AI fallback is used up for today', kind: 'limit' };
    try {
      const r = await env.AI.run(WORKERS_AI_FALLBACK, { messages, max_tokens: 1024, temperature: 0 });
      const text = typeof r?.response === 'string' ? r.response : r?.response ? JSON.stringify(r.response) : '';
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
  return async (messages) => {
    const first = await oneModel(env, fetchImpl, chosen)(messages);
    if (!first.error || first.kind === 'key' || dailyFreeUsed(first)) return first;
    const others = (await freeOpenRouterModels(fetchImpl)).filter((id) => id !== chosen.model).slice(0, 2);
    for (const id of others) {
      const r = await oneModel(env, fetchImpl, { ...chosen, model: id })(messages);
      if (!r.error) return { ...r, by: id };
      if (dailyFreeUsed(r)) return r;
    }
    return first;
  };
}

export function modelFrom(env = {}, fetchImpl = fetch, chosen = { ai: 'wolf', free: true }, { overLimit = null, now = () => Date.now(), log = () => {} } = {}) {
  if (ownFreeOpenRouter(chosen)) return ownFreeModel(env, fetchImpl, chosen);
  if (!chosen.free) return oneModel(env, fetchImpl, chosen);
  const wolf = oneModel(env, fetchImpl, chosen);
  const workers = workersAiModel(env, overLimit);
  return async (messages) => {
    const tried = [];
    if (now() >= wolfOutUntil) {
      const r = await wolf(messages);
      if (!r.error) return { ...r, by: 'wolf' };
      tried.push(`wolf: ${r.error}`);
      if (r.kind === 'limit') wolfOutUntil = now() + WOLF_REST_MS;
    }
    if (env.OPENROUTER_KEY) {
      const ids = (await freeOpenRouterModels(fetchImpl)).slice(0, 3);
      for (const id of ids) {
        const r = await oneModel(env, fetchImpl, { ai: 'openrouter', url: OPENROUTER_URL, model: id, key: env.OPENROUTER_KEY, referer: true })(messages);
        if (!r.error) return { ...r, by: id };
        tried.push(`${id}: ${r.error}`);
      }
    }
    const r = await workers(messages);
    if (!r.error) return { ...r, by: WORKERS_AI_FALLBACK };
    tried.push(`workers-ai: ${r.error}`);
    log(tried);
    return { error: FREE_BUSY, kind: 'busy' };
  };
}

// Tests only: forget that Wolf was out and the cached OpenRouter list.
export function resetFallbacks() { wolfOutUntil = 0; orModels = { at: 0, ids: null }; }


export const MAX_FILES = 3;
export const MAX_FILE_BYTES = 150 * 1024;
// Files the visitor attached: text, or base64 for anything else. Names are flattened so nothing escapes the folder.
export function cleanFiles(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_FILES).flatMap((f) => {
    const path = String(f?.name || '').split(/[\\/]/).pop().replace(/[^A-Za-z0-9._ -]/g, '_').replace(/^\.+/, '').slice(0, 80);
    const content = typeof f?.content === 'string' ? f.content : '';
    if (!path || !content || content.length > MAX_FILE_BYTES * 1.4) return [];
    const b64 = !!f.b64;
    if (b64 && !/^[A-Za-z0-9+/=\s]+$/.test(content)) return [];
    const image = b64 && /^image\/(png|jpeg|gif|webp)$/.test(String(f.type || '')) ? String(f.type) : null;
    return [{ path: path.replace(/ /g, '_'), content: b64 ? content.replace(/\s/g, '') : content, b64, ...(image ? { image } : {}) }];
  });
}

// Addresses on the task's own computer stop working when it stops at the end of the task: say so under the answer.
export function noteDeadLinks(text, hadComputer) {
  if (!hadComputer || !/\b(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?\b/.test(String(text))) return text;
  return `${text}\n\n(The localhost addresses above were on this task's computer, which has stopped now, so they will not open for you. Ask me to publish the page if you want a link.)`;
}

export function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string')
    .slice(-6)
    .map((m) => {
      // A file attached on an earlier turn was on that turn's computer only; say so, so the model asks for it again.
      const names = Array.isArray(m.files) ? m.files.filter((n) => typeof n === 'string').slice(0, 3).map((n) => n.slice(0, 80)) : [];
      const note = m.role === 'user' && names.length ? `\n[Attached then: ${names.join(', ')}. Not on this computer any more: ask the user to attach it again if you need it.]` : '';
      return { role: m.role, content: m.content.slice(0, 1500) + note };
    });
}

// computer: { start, run, write, read, share, stop } (fleet.js, or the visitor's browser: browserpod.js). note: extra instructions about that computer. track: optional { started(podId), kept(podId, url), stopped(podId) }. publish(html) -> url. emit(event) gets every step.
export async function runTask({ task, history = [], github = undefined, origin = 'https://chat.flisk.si', model, computer, publish, track = {}, saveVideo = async () => ({ error: 'videos are not set up here' }), fetchImpl = fetch, order = [], files = [], vision = false, modelName = '', note = '', emit = () => {}, maxSteps = MAX_STEPS, wait = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const where = files.length ? `\n\nThe user attached ${files.length} file(s), already on the computer in the current folder: ${files.map((f) => f.path).join(', ')}. Use them.` : '';
  // A model that sees images gets the attached pictures themselves, not only the file on the computer.
  const pics = vision ? files.filter((f) => f.image) : [];
  const first = pics.length
    ? [{ type: 'text', text: `${task}${where} The picture${pics.length > 1 ? 's are' : ' is'} also shown to you here: look at ${pics.length > 1 ? 'them' : 'it'} to answer.` }, ...pics.map((f) => ({ type: 'image_url', image_url: { url: `data:${f.image};base64,${f.content}` } }))]
    : task + where;
  // The page sends the new task as the last history entry too: drop it so the model gets the task once.
  const past = Array.isArray(history) ? history.slice() : [];
  const lastPast = past[past.length - 1];
  if (lastPast?.role === 'user' && String(lastPast.content || '').trim() === String(task).trim()) past.pop();
  // Asked "which model are you", the model would say it does not know: tell it what the visitor picked.
  const who = modelName ? `\n\nThe AI model behind you is ${String(modelName).slice(0, 120)}. If the user asks which model you are, say that, in "say".` : '';
  // A small model reads the one-app recipe and skips the "system" action: for a bigger app, say so plainly and last.
  const bigApp = /\b(crm|erp|back office|platform|services|microservices?|suite|bigger app|system of services)\b/i.test(String(task));
  const force = bigApp ? '\n\nThis task is a bigger app with several parts: your FIRST action must be the "system" action described above. Do not run flisk create and do not write the app files yourself.' : '';
  const system = SYSTEM.replace(`After at most ${MAX_STEPS - 1} actions`, `After at most ${maxSteps - 1} actions`) + who + force + (github === undefined ? '' : githubNote(github, origin)) + note;
  const token = github?.token || '';
  const messages = [{ role: 'system', content: system }, ...cleanHistory(past), { role: 'user', content: first }];
  let podId = null;
  let provider = null;
  const steps = [];
  const links = [];
  const t0 = Date.now();
  const finish = async (answer, error = null) => {
    if (podId && kept) {
      emit({ type: 'pod_kept', url: kept.url, days: kept.expiresAt ? 0 : KEEP_DAYS, until: kept.expiresAt || null });
    } else if (podId) {
      const s = await computer.stop(podId).catch(() => null);
      emit({ type: 'pod_stopped', ok: s?.status === 200 });
      if (s?.status === 200) await Promise.resolve(track.stopped?.(podId)).catch(() => {});
    }
    return { answer, error, steps, links, provider, ms: Date.now() - t0 };
  };
  let emptyRetries = 0;
  let providerRetries = 0;
  let kept = null; // the public URL of the running app: the computer is kept, not stopped
  let startedServer = false;
  let builtSystem = false; // a bigger app was built by chat: its generated page must not be replaced by a stub
  let ranApp = false; // flisk up or a bigger app runs: the answer is a shared live link, never a published copy
  let appPort = null; // the website port a bigger app answered with
  let shareRefused = false; // the provider cannot give this computer a public link
  let askedForLink = false;
  try {
    for (let step = 1; step <= maxSteps; step++) {
      emit({ type: 'thinking', step });
      const last = step === maxSteps;
      if (last) messages.push({ role: 'user', content: 'That was the last action. Reply with {"say": ...} now.' });
      const reply = await model(messages);
      // An empty reply is usually a one-off (a long command output, a reasoning model that only thought): ask again, twice at most,
      // without using up a step.
      if (reply.kind === 'empty' && emptyRetries < 2) {
        emptyRetries++;
        emit({ type: 'retry' });
        messages.push({ role: 'user', content: 'Your last reply was empty. Reply now with the next action as one short JSON object.' });
        step--;
        continue;
      }
      // A provider hiccup (HTTP 5xx, overloaded, a dropped connection) is nearly always gone a few seconds later. Without a
      // retry one bad answer ended a build halfway and stopped its computer, so wait and ask again, twice per task at most.
      if (reply.kind === 'provider' && providerRetries < 2) {
        providerRetries++;
        emit({ type: 'retry' });
        await wait(providerRetries * 3000);
        step--;
        continue;
      }
      if (reply.error) {
        emit({ type: 'error', error: reply.error, kind: reply.kind });
        return await finish(null, reply.error);
      }
      messages.push({ role: 'assistant', content: reply.text });
      const action = parseAction(reply.text);
      if (action.type === 'bad' && !last) {
        emit({ type: 'retry' });
        messages.push({ role: 'user', content: 'That reply is not valid JSON. Send the same action again as one valid JSON object only (no tags, no XML, no explanations). Escape " as \\" inside strings.' });
        continue;
      }
      // A server was started on the computer but nothing was published: the computer stops with this answer, so the user
      // would get an app they cannot open and have to ask for the link. Ask for the published copy once.
      if (action.type === 'say' && !last && podId && startedServer && !links.length && !askedForLink && !shareRefused) {
        askedForLink = true;
        emit({ type: 'retry' });
        messages.push({ role: 'user', content: `No public link yet, and the computer stops when you answer unless the app is shared. Send {"share": ${appPort || '<the website port>'}} so the running app gets a public link. Never make a copy of the app. Next action as JSON only.` });
        continue;
      }
      if (action.type === 'say' || last) {
        // Out of steps with an action still planned: never show that raw JSON as the answer.
        const text = action.type === 'say' ? noteDeadLinks(action.text, !!podId) : `I ran out of steps (${maxSteps}) before finishing. What I did is in the steps above; the computer is stopped now, so its files are gone. Ask again with a smaller first part${maxSteps < BYO_STEPS ? `, or pick a model with your own key for ${BYO_STEPS} steps` : ''}.`;
        emit({ type: 'answer', text });
        return await finish(text);
      }
      let widget = null;
      if (action.type === 'widget') {
        const w = parseWidget(action.raw);
        if (w.error) {
          messages.push({ role: 'user', content: `Error: ${w.error}\n\nNext action as JSON only.` });
          continue;
        }
        widget = w;
        if (!w.widget.needsComputer) {
          const r = await w.widget.run(w.input, { fetch: fetchImpl });
          if (r.error) {
            emit({ type: 'output', error: r.error });
            messages.push({ role: 'user', content: `Error: ${r.error}\n\nNext action as JSON only.` });
          } else {
            emit({ type: 'widget', kind: w.widget.id, data: r.data });
            steps.push({ action, widget: w.widget.id });
            messages.push({ role: 'user', content: `${r.summary}\n\nNext action as JSON only (usually "say").` });
          }
          continue;
        }
      }
      if (!podId) {
        emit({ type: 'pod_starting' });
        const made = await computer.start(order);
        if (made.error) {
          emit({ type: 'error', error: made.error, kind: 'computer' });
          return await finish(null, made.error);
        }
        podId = made.data.id;
        provider = made.data.provider;
        await Promise.resolve(track.started?.(podId)).catch(() => {});
        emit({ type: 'pod_started', provider });
        if (token) {
          const g = await setupGithub({ computer, podId, github }).catch((e) => ({ error: String(e?.message || e) }));
          emit({ type: 'github', ok: !!g.ok, error: g.error ? scrub(g.error, token) : null });
          if (g.error) messages.push({ role: 'user', content: `Note: signing GitHub in on this computer failed (${scrub(g.error, token)}), so push and gh may not work.` });
        }
        for (const f of files) {
          const r = f.b64 ? await computer.write(podId, `${f.path}.b64`, f.content) : await computer.write(podId, f.path, f.content);
          if (!r.error && f.b64) await computer.run(podId, `base64 -d '${f.path}.b64' > '${f.path}' && rm '${f.path}.b64'`);
          emit({ type: 'file', path: f.path, error: r.error || null });
        }
      }
      let shown;
      if (widget) {
        const r = await widget.widget.run(widget.input, { fetch: fetchImpl, computer, podId });
        if (r.error) shown = { error: r.error };
        else {
          emit({ type: 'widget', kind: widget.widget.id, data: r.data });
          shown = { widget: widget.widget.id, summary: r.summary };
        }
      } else if (action.type === 'run') {
        emit({ type: 'run', command: action.command });
        if (/\b(flisk up|nohup)\b/.test(action.command)) startedServer = true;
        if (/\bflisk up\b/.test(action.command)) ranApp = true;
        const r = await computer.run(podId, action.command);
        shown = r.error ? { error: scrub(r.error, token) } : { exitCode: r.data.exitCode, stdout: clip(scrub(r.data.stdout, token)), stderr: clip(scrub(r.data.stderr, token), 600) };
      } else if (action.type === 'write') {
        emit({ type: 'write', path: action.path, bytes: action.content.length });
        // A short stub over the generated page leaves the live link blank; keep the working page.
        if (builtSystem && /(^|\/)app\/web\/index\.html$/.test(action.path) && action.content.length < 1500) {
          shown = { error: 'Refused: that is far shorter than the working page already there, so it would blank the website. Keep the generated page and go straight to share, or write the whole page.' };
          emit({ type: 'output', error: shown.error });
          steps.push({ action, output: shown });
          messages.push({ role: 'user', content: `${JSON.stringify(shown)}\n\nNext action as JSON only.` });
          continue;
        }
        const r = await computer.write(podId, action.path, action.content);
        shown = r.error ? { error: r.error } : { written: action.path };
      } else if (action.type === 'video') {
        emit({ type: 'video_start', title: action.spec.title, scenes: action.spec.scenes.length });
        const made = await makeVideo({ computer, podId, spec: action.spec, save: saveVideo, emit });
        if (made.error) shown = { error: made.error };
        else {
          links.push(made.url);
          shown = { video: made.url };
        }
      } else if (action.type === 'system') {
        emit({ type: 'system_plan', title: action.spec.title, services: action.spec.services.map((x) => x.name) });
        const made = await makeSystem({ computer, podId, spec: action.spec, emit });
        shown = made.error ? { error: made.error } : { exitCode: 0, stdout: made.summary, stderr: '' };
        // The app runs on a computer that stops with the answer unless it is shared (see the nudge above).
        if (!made.error) {
          startedServer = ranApp = builtSystem = true;
          appPort = made.web;
        }
      } else if (action.type === 'share') {
        emit({ type: 'share', port: action.spec.port });
        const r = await shareApp({ computer, podId, spec: action.spec, fetchImpl, provider });
        if (r.refused) shareRefused = true;
        if (r.error) shown = { error: r.error };
        else {
          kept = r;
          links.push(r.url);
          await Promise.resolve(track.kept?.(podId, r.url, r.expiresAt)).catch(() => {});
          emit({ type: 'live', url: r.url });
          const mins = r.expiresAt ? Math.max(1, Math.round((Date.parse(r.expiresAt) - Date.now()) / 60000)) : 0;
          const lasts = !r.expiresAt
            ? `it sleeps when idle and wakes on a visit, deleted after ${KEEP_DAYS} days`
            : `it works until ${new Date(r.expiresAt).toUTCString()} (about ${mins > 90 ? `${Math.round(mins / 60)} hours` : `${mins} minutes`}), when ${provider || 'the provider'} ends the computer${r.wakesOnVisit ? ' (until then it sleeps when idle and a visit wakes it)' : ''}; tell the user how long it lasts`;
          shown = { live: r.url, note: `This is the running app (website and API), kept running after you answer; ${lasts}. Say this link first.` };
        }
      } else if (action.type === 'publish' && ranApp) {
        // An app with a running API is never shipped as a page: a copy of it cannot save anything.
        shown = { error: shareRefused
          ? 'do not publish a copy of the app. This computer cannot have a public link, so "say" that plainly: the app was built and checked here, and a provider that can share (for example Upstash Box) gives a live link next time.'
          : `this task runs an app with an API, so do not publish a copy of it. Send {"share": ${appPort || '<the website port>'}} for a live link to the real app.` };
      } else if (action.type === 'publish') {
        emit({ type: 'publish', path: action.path });
        const r = await computer.read(podId, action.path);
        if (r.error) shown = { error: r.error };
        else if (r.data.encoding !== 'utf8') shown = { error: 'that file is not text' };
        else {
          const made = await publish(r.data.content);
          if (made.error) shown = { error: made.error };
          else {
            links.push(made.url);
            shown = { published: made.url };
          }
        }
      } else {
        emit({ type: 'read', path: action.path });
        const r = await computer.read(podId, action.path);
        shown = r.error ? { error: scrub(r.error, token) } : { content: clip(scrub(r.data.content, token)) };
      }
      steps.push({ action, ...shown });
      if (!shown.widget) emit({ type: 'output', ...shown });
      const note = shown.error
        ? `Error: ${shown.error}`
        : shown.summary
          ? shown.summary
        : shown.live
          ? `Shared. The running app's public link is ${shown.live}. ${shown.note}`
        : shown.published
          ? `Published. The live link is ${shown.published}`
          : shown.video
            ? `The video is ready. Its link is ${shown.video}`
          : shown.exitCode !== undefined
            ? `Exit code ${shown.exitCode}\nstdout:\n${shown.stdout || '(empty)'}${shown.stderr ? `\nstderr:\n${shown.stderr}` : ''}`
            : shown.written
              ? `Wrote ${shown.written}`
              : `Content:\n${shown.content}`;
      messages.push({ role: 'user', content: `${note}\n\nNext action as JSON only.` });
    }
    return await finish(null, 'ran out of steps');
  } catch (e) {
    const why = String(e?.message || e).slice(0, 200);
    emit({ type: 'error', error: why });
    return await finish(null, why);
  }
}

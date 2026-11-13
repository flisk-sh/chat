import { widgetPrompt, parseWidget } from './widgets.js';
import { cleanVideo, makeVideo } from './video.js';
// One task: a model plans, a computer from fleet does the work, the answer comes back. One task = one computer,
// started on the first action and always stopped at the end.
export const MAX_STEPS = 8;
// The visitor's own key pays for its own steps, so a bigger app (install, write several files, start, check) fits.
export const BYO_STEPS = 16;
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
{"widget": {"kind": "<widget>", ...}}
{"say": "<answer for the user>"}

Rules:
- Use the computer for anything you can check: maths, code, data, files, web pages (curl).
- One action per reply. Keep commands short. Never wait for input; add -y to installs.
- For more than one line of code, "write" a file first, then "run" it. Never put several lines into python3 -c.
- Escape every " inside a string as \\" and every newline as \\n so the JSON is valid.
- To make a website: "write" ONE self-contained index.html (inline CSS and JS, no external files or CDNs, under 200 KB, good looking: a hero section, a calm colour palette, system fonts, cards or sections with spacing and rounded corners; mobile friendly. Never invent a phone number, email address or street address: write "Add your address here" style placeholders), then "publish" it, then "say" the link in one sentence.
- To make a video (the user asks for a video, a clip or a promo, or the answers say "What: A video"): send ONE "video" action with 4 to 6 scenes. Chat draws the scenes, records a voice-over and makes an mp4 on the computer (it takes a few minutes), then tells you the link. Then "say" the link in one sentence. Never invent a phone number, email address or street address.
- For an app with several parts (a website plus an API, a worker; the user asks for an app, a shop, a dashboard with data): use Flisk. This computer has no Docker, so Flisk runs each part as a plain process. Follow these steps exactly; never read flisk --help or files under .flisk/:
  1. {"run": "curl -fsSL https://flisk.sh/install.sh | sh >/dev/null 2>&1; export PATH=$HOME/.local/bin:$PATH; cd ~ && flisk create app --frontend vanilla --language node --yes 2>&1 | tail -8; ls ~/app/api ~/app/api/src ~/app/web"}
     It makes ~/app/api (a Node API in src/index.js that already answers /health) and ~/app/web (the website), each with a service.json that has a \"command\".
  2. "write" your code: the API into ~/app/api/src/index.js (keep its port and /health), the page into the website's index.html. For data use SQLite inside the API (Node 22: import { DatabaseSync } from 'node:sqlite'), not a database server.
  3. {"run": "export PATH=$HOME/.local/bin:$PATH; cd ~/app && (cd api && npm install --silent) && (cd web && npm install --silent); (nohup flisk up > /tmp/up.log 2>&1 &); sleep 20; tail -15 /tmp/up.log"}
  4. Check it with curl on the ports from that log (place an order, read it back), then "say" what works, with the commands and their output.
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
      if (a?.widget && typeof a.widget === 'object') return { type: 'widget', raw: a.widget };
      if (typeof a?.say === 'string') return { type: 'say', text: a.say };
    } catch {}
    if (/^\s*\{\s*"(run|write|read|publish|video|widget)"\s*:/.test(s.slice(start))) return { type: 'bad', text: s };
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
  if (code === 401 || code === 403 || /api key|unauthori|invalid.*key|no auth/.test(hay)) kind = 'key';
  else if (code === 402 || code === 429 || /credit|quota|rate.?limit|insufficient|too many/.test(hay)) kind = 'limit';
  else if (code === 404 || code === 400 && /model/.test(hay) || /no endpoints|not a valid model|model.*not (found|exist)|does not exist|unknown model/.test(hay)) kind = 'model';
  else if (code >= 500 || /provider returned error|overloaded|timeout/.test(hay)) kind = 'provider';
  const head = {
    key: `Your ${chosen.free ? 'Flisk Wolf' : chosen.ai || 'provider'} API key was refused`,
    limit: 'Out of credit or rate limited',
    model: `The model "${chosen.free ? 'Flisk Wolf' : chosen.model || 'you chose'}" is not available`,
    provider: `The model provider${who} had a problem (HTTP ${code || 'unknown'})`,
    other: `The model answered with an error (HTTP ${code || 'unknown'})`,
  }[kind];
  const why = [msg && !/^provider returned error$/i.test(msg) ? msg : '', detail].filter(Boolean).join(': ') || msg;
  return { error: `${head}${why ? `: ${why}` : ''}`.slice(0, 500), kind };
}

// Calls the model (OpenAI-compatible). Errors come back as { error }.
export function modelFrom(env = {}, fetchImpl = fetch, chosen = { ai: 'wolf', free: true }) {
  const url = chosen.free ? env.INFERENCE_URL || 'https://inference.flisk.si/v1/chat/completions' : chosen.url;
  const model = chosen.free ? env.INFERENCE_MODEL || 'flisk-wolf-chat' : chosen.model;
  const key = chosen.free ? env.INFERENCE_KEY : chosen.key;
  const maxTokens = chosen.free ? 1024 : 4096;
  // The free model is another Worker on our own domain: Cloudflare refuses a Worker calling it by its public address
  // (error 1033), so the call goes through a service binding when there is one.
  const call = chosen.free && env.INFERENCE ? (u, init) => env.INFERENCE.fetch(u, init) : fetchImpl;
  return async (messages) => {
    if (!key) return { error: 'chat has no model key yet (INFERENCE_KEY)' };
    let res;
    try {
      res = await call(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'user-agent': 'flisk-chat' },
        body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0 }),
      });
    } catch (e) {
      return { error: `the model did not answer: ${String(e?.message || e).slice(0, 150)}`, kind: 'provider' };
    }
    const body = await res.json().catch(() => null);
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

// computer: { start, run, write, read, stop } (fleet.js). publish(html) -> url. emit(event) gets every step.
export async function runTask({ task, history = [], model, computer, publish, saveVideo = async () => ({ error: 'videos are not set up here' }), fetchImpl = fetch, order = [], files = [], vision = false, emit = () => {}, maxSteps = MAX_STEPS }) {
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
  const system = SYSTEM.replace(`After at most ${MAX_STEPS - 1} actions`, `After at most ${maxSteps - 1} actions`);
  const messages = [{ role: 'system', content: system }, ...cleanHistory(past), { role: 'user', content: first }];
  let podId = null;
  let provider = null;
  const steps = [];
  const links = [];
  const t0 = Date.now();
  const finish = async (answer, error = null) => {
    if (podId) {
      const s = await computer.stop(podId).catch(() => null);
      emit({ type: 'pod_stopped', ok: s?.status === 200 });
    }
    return { answer, error, steps, links, provider, ms: Date.now() - t0 };
  };
  let emptyRetries = 0;
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
      if (action.type === 'say' || last) {
        // Out of steps with an action still planned: never show that raw JSON as the answer.
        const text = action.type === 'say' ? action.text : `I ran out of steps (${maxSteps}) before finishing. What I did is in the steps above; the computer is stopped now, so its files are gone. Ask again with a smaller first part${maxSteps < BYO_STEPS ? `, or pick a model with your own key for ${BYO_STEPS} steps` : ''}.`;
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
        emit({ type: 'pod_started', provider });
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
        const r = await computer.run(podId, action.command);
        shown = r.error ? { error: r.error } : { exitCode: r.data.exitCode, stdout: clip(r.data.stdout), stderr: clip(r.data.stderr, 600) };
      } else if (action.type === 'write') {
        emit({ type: 'write', path: action.path, bytes: action.content.length });
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
        shown = r.error ? { error: r.error } : { content: clip(r.data.content) };
      }
      steps.push({ action, ...shown });
      if (!shown.widget) emit({ type: 'output', ...shown });
      const note = shown.error
        ? `Error: ${shown.error}`
        : shown.summary
          ? shown.summary
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

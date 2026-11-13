import { cleanVideo, makeVideo } from './video.js';
// One task: a model plans, a computer from fleet does the work, the answer comes back. One task = one computer,
// started on the first action and always stopped at the end.
export const MAX_STEPS = 8;
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
{"say": "<answer for the user>"}

Rules:
- Use the computer for anything you can check: maths, code, data, files, web pages (curl).
- One action per reply. Keep commands short. Never wait for input; add -y to installs.
- For more than one line of code, "write" a file first, then "run" it. Never put several lines into python3 -c.
- Escape every " inside a string as \\" and every newline as \\n so the JSON is valid.
- To make a website: "write" ONE self-contained index.html (inline CSS and JS, no external files or CDNs, under 200 KB, good looking: a hero section, a calm colour palette, system fonts, cards or sections with spacing and rounded corners; mobile friendly. Never invent a phone number, email address or street address: write "Add your address here" style placeholders), then "publish" it, then "say" the link in one sentence.
- To make a video (the user asks for a video, a clip or a promo, or the answers say "What: A video"): send ONE "video" action with 4 to 6 scenes. Chat draws the scenes, records a voice-over and makes an mp4 on the computer (it takes a few minutes), then tells you the link. Then "say" the link in one sentence. Never invent a phone number, email address or street address.
- For multi-service apps: Fleet pods have no Docker or Tilt. Use Flisk in local-process mode only (services that declare a \"command\" field). First install the CLI with:
  curl -fsSL https://flisk.sh/install.sh | sh
  Then:
  flisk project --yes
  Write service.json files that include a \"command\" (e.g. \"command\": \"node server.js\" or \"python app.py\"). Do NOT rely on generated Dockerfiles or Tilt.
  flisk up
  This starts the services as plain processes with health checks and no containers. Prefer this over hand-written scripts when the task needs more than one process.
  If the curl install fails, fall back to installing Node first then npm install -g @flisk-sh/flisk.
- After at most ${MAX_STEPS - 1} actions, reply with "say". If the task needs no computer, reply with "say" at once.
- In "say", give the result itself (numbers, the content, the link), not a description of the steps.

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
      if (typeof a?.say === 'string') return { type: 'say', text: a.say };
    } catch {}
    if (/^\s*\{\s*"(run|write|read|publish|video)"\s*:/.test(s.slice(start))) return { type: 'bad', text: s };
  }

  // If it still looks like a tool call or XML, force a retry.
  if (/<\|DSML\||<invoke|<parameter|tool_call|function_call/i.test(String(text))) {
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
  if (key.length < 8 || key.length > 300 || /\s/.test(key)) return { error: `paste your ${p.label.split(' (')[0]} API key` };
  if (!model || !/^[A-Za-z0-9._:\/-]{1,80}$/.test(model)) return { error: 'type the model name, for example the one shown on your provider\'s model list' };
  return { ai, free: false, url: p.url, key, model };
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
      return { error: `the model did not answer: ${String(e?.message || e).slice(0, 150)}` };
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) return { error: String(body?.error?.message || body?.error || `the model answered ${res.status}`).slice(0, 300) };
    const text = body?.choices?.[0]?.message?.content;
    if (typeof text === 'string' && text.trim()) return { text };
    if (text && typeof text === 'object') return { text: JSON.stringify(text) };
    return { error: 'the model sent an empty answer' };
  };
}

export function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string')
    .slice(-6)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }));
}

// computer: { start, run, write, read, stop } (fleet.js). publish(html) -> url. emit(event) gets every step.
export async function runTask({ task, history = [], model, computer, publish, saveVideo = async () => ({ error: 'videos are not set up here' }), order = [], emit = () => {}, maxSteps = MAX_STEPS }) {
  const messages = [{ role: 'system', content: SYSTEM }, ...cleanHistory(history), { role: 'user', content: task }];
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
  try {
    for (let step = 1; step <= maxSteps; step++) {
      emit({ type: 'thinking', step });
      const last = step === maxSteps;
      if (last) messages.push({ role: 'user', content: 'That was the last action. Reply with {"say": ...} now.' });
      const reply = await model(messages);
      if (reply.error) {
        emit({ type: 'error', error: reply.error });
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
        const text = action.type === 'say' ? action.text : reply.text;
        emit({ type: 'answer', text });
        return await finish(text);
      }
      if (!podId) {
        emit({ type: 'pod_starting' });
        const made = await computer.start(order);
        if (made.error) {
          emit({ type: 'error', error: made.error });
          return await finish(null, made.error);
        }
        podId = made.data.id;
        provider = made.data.provider;
        emit({ type: 'pod_started', provider });
      }
      let shown;
      if (action.type === 'run') {
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
      emit({ type: 'output', ...shown });
      const note = shown.error
        ? `Error: ${shown.error}`
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

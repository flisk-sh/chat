// Sends a problem to traces.flisk.si (flisk-sh/traces): only when something went wrong or took an unexpected path, never a normal request.
// Never throws, never waits more than 2 s, and does nothing until TRACE_KEY is set. No prompt, answer or name is ever sent.
// Needs the TRACES service binding (a Worker cannot call a Worker on the same domain by its public address) or falls back to the public URL.
import { detectLang } from './lang.js';
export const SLOW_ASK_MS = 30_000;
export const SLOW_STEP_MS = 90_000;

// Provider errors can quote a key, even a masked one ("key_gl8C********hRTv"). Cut anything key-shaped before it leaves for traces.
export function redactSecrets(text) {
  return String(text)
    .replace(/[A-Za-z0-9_-]*\*{3,}[A-Za-z0-9_*-]*/g, '[key]')
    .replace(/\b(?:sk|rk|pk|key|gsk|xai|ghp|github_pat)[-_][A-Za-z0-9_-]{6,}/gi, '[key]')
    .replace(/\bAIza[A-Za-z0-9_-]{10,}/g, '[key]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [key]')
    .replace(/(Incorrect API key provided:)[^.]*\./i, '$1 [key].');
}
const clean = (v) => typeof v === 'string' ? redactSecrets(v) : v;

export async function sendTrace(env, event, fetchImpl = fetch) {
  if (!env?.TRACE_KEY) return;
  try {
    event = Object.fromEntries(Object.entries(event || {}).map(([k, v]) => [k, clean(v)]));
    const init = { method: 'POST', headers: { authorization: `Bearer ${env.TRACE_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify(event), signal: AbortSignal.timeout(2000) };
    if (env.TRACES) await env.TRACES.fetch('https://traces.flisk.si/v1/trace', init);
    else await fetchImpl('https://traces.flisk.si/v1/trace', init);
  } catch { /* tracing must never break a request */ }
}

// What a finished task says about itself: a failure is an error, a weak result is unexpected, a long one is slow. Nothing otherwise.
export function runEvents(result, problem, route = '/api/run', lang = '') {
  const out = [];
  // The answer came back in another language than the turn asked for (English asked, Ukrainian answered). Only codes are sent, never text.
  const said = detectLang(result.answer || '');
  const asked = String(lang || '').slice(0, 2).toLowerCase();
  if (asked && said && said !== asked) out.push({ route, kind: 'unexpected', why: `asked in ${asked}, answered in ${said}`, detail: `${result.provider || 'no provider'}`, ms: result.ms || 0 });
  // The person picked a build kind, yet the model reached for a picture: the decision worth seeing next to the reroute rows.
  if (result.refusedImage) out.push({ route, kind: 'unexpected', why: `picked ${result.picked}, model tried to draw a picture (refused ${result.refusedImage}x)`, detail: `${result.provider || 'no provider'}`, ms: result.ms || 0 });
  // Jev read the reply and judged it bad: the code of what is wrong (never the text), and whether it was asked again.
  const g = result.stats?.graded;
  if (g) out.push({ route, kind: 'unexpected', why: `Jev graded the reply ${g.verdict}${g.retried ? ', asked again' : ', words already streamed'}`, detail: `${result.provider || 'no provider'} · ${Math.round((g.confidence || 0) * 100)}%`, ms: result.ms || 0 });
  const ms = result.ms || 0;
  const steps = result.steps?.length || 0;
  const detail = `${steps} steps · ${result.stats?.errors || 0} failed · ${result.provider || 'no provider'}`;
  if (problem) out.push({ route, kind: result.error ? 'error' : 'unexpected', why: String(problem).slice(0, 200), detail, ms });
  // A computer that took long to start, a rule that refused the model once, a reply that only describes the model: each is a problem to see.
  const podMs = result.stats?.podMs || 0;
  if (podMs > 30_000) out.push({ route, kind: 'slow', why: `a computer took ${Math.round(podMs / 1000)} s to start`, detail, ms: podMs });
  // The model's reply was not valid JSON and the words were cut out of it (a person saw the answer, not the braces). Seeing how often tells which model breaks.
  if (result.stats?.salvaged) out.push({ route, kind: 'unexpected', why: `reply was not valid JSON, words salvaged (${result.stats.salvaged}x)`, detail, ms });
  if (result.stats?.bad >= 2) out.push({ route, kind: 'unexpected', why: `model sent ${result.stats.bad} unusable replies in one task`, detail, ms });
  if (result.stats?.refused === 1) out.push({ route, kind: 'unexpected', why: `chat refused the model once: ${result.stats.refusedWhy}`.slice(0, 200), detail, ms });
  if (/^\s*Flisk Wolf, a free model[^.]*\.?\s*$/i.test(result.answer || '')) out.push({ route, kind: 'unexpected', why: 'the answer says nothing useful', detail, ms });
  // One step or none is a plain answer: 30 s is already slow. Only longer tasks (a site, a computer) get the per-step allowance.
  const slow = steps > 1 ? ms / steps > SLOW_STEP_MS : ms > SLOW_ASK_MS;
  if (slow) out.push({ route, kind: 'slow', why: steps ? `a step took ${Math.round(ms / steps / 1000)} s on average` : `answered in ${Math.round(ms / 1000)} s`, detail, ms });
  return out;
}

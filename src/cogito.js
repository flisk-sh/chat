// cogito (github.com/flisk-sh/cogito) for POST /api/run, opt-in. A client that sends
// `Accept: application/vnd.flisk.cogito+ndjson` gets cogito frames; everyone else keeps chat's own events untouched.
//
// Mapping, so nothing chat shows today is lost:
//   delta -> {t}      done -> {d:1, ms, err}      every other event -> {x: <the event as it was>}
//   plus an {s} state frame whenever what chat is doing changes (thinking, searching, reading, writing, working, waiting),
//   which is what a cogito client shows as "thinking...". `x` is an app-defined extension frame: clients that do not know it ignore it.
export const COGITO_TYPE = 'application/vnd.flisk.cogito+ndjson';
export const wantsCogito = (request) => (request.headers.get('accept') || '').includes(COGITO_TYPE);

const STATE = {
  thinking: 'thinking', pod_starting: 'waiting',
  search: 'searching', websources: 'searching', sources: 'searching', lookup: 'searching',
  read: 'reading',
  delta: 'writing', answer: 'writing', say: 'writing', text: 'writing',
  run: 'working', write: 'working', output: 'working', publish: 'working', pod_call: 'working', worker: 'working',
};

const lines = (frames) => frames.map((f) => JSON.stringify(f) + '\n').join('');

export function cogitoStream({ id = 'r_' + crypto.randomUUID().slice(0, 8) } = {}) {
  let state = '';
  return {
    // Chat records every run (recordRun), so the retention promise is "logged", never "none".
    hello: () => lines([{ h: { v: 1, id, lvl: 1, ret: 'logged', fmt: 'ndjson' } }]),
    encode(ev) {
      const out = [];
      const s = STATE[ev?.type];
      if (s && s !== state) { state = s; out.push({ s }); }
      if (ev?.type === 'delta') out.push({ t: String(ev.text ?? '') });
      else if (ev?.type === 'done') out.push({ d: 1, ms: ev.ms, ...(ev.error ? { err: ev.error } : {}) });
      else out.push({ x: ev });
      return lines(out);
    },
  };
}

// The other direction, for the page: one cogito frame back to chat's own event (null for frames chat has no use for).
export function fromFrame(f) {
  if (f && 'x' in f) return f.x;
  if (f && 't' in f) return { type: 'delta', text: f.t };
  if (f && 'd' in f) return { type: 'done', ms: f.ms, error: f.err };
  return null;
}

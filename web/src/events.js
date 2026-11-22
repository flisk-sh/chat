// Turns the NDJSON events of POST /api/run (and of the browser computer) into the state of one chat turn.
// Pure and framework-free, so the tests can run it without a browser. Every event type the current page understands is here.
export const newTurn = (task) => ({
  task, steps: [], text: '', answer: null, status: 'Working', link: '', video: '', outs: [], sources: [], widgets: [], workers: [],
  error: null, needPod: false, browser: null, model: '', podStarted: 0, kept: null,
});

const step = (t, s) => ({ ...t, steps: [...t.steps, { status: 'complete', ...s }] });
const chars = (n) => Number(n || 0).toLocaleString();

export function applyEv(t, ev) {
  switch (ev.type) {
    case 'thinking': return { ...t, status: 'Thinking, step ' + ev.step, text: '' };
    case 'sources': return { ...t, status: 'Read ' + ev.sources.length + (ev.sources.length > 1 ? ' sources' : ' source') + ' on Wikipedia' };
    case 'pod_starting': return { ...step(t, { name: 'computer', target: 'Starting a computer' }), status: 'Starting a computer', podStarted: Date.now() };
    case 'pod_started': return { ...t, podStarted: 0, status: 'Computer ready on ' + ev.provider, node: ev.provider };
    case 'run': return { ...step(t, { name: 'run', target: ev.command, node: t.node }), status: 'Running a command' };
    case 'write': return { ...step(t, { name: 'write', target: ev.path + ' (' + chars(ev.bytes) + ' characters)', node: t.node }), status: 'Writing files' };
    case 'read': return step(t, { name: 'read', target: ev.path, node: t.node });
    case 'publish': return { ...step(t, { name: 'publish', target: ev.path }), status: 'Publishing' };
    case 'worker': return { ...step(t, { name: 'worker', target: 'Running ' + ev.path + ' as a Worker in this tab' }), workers: [...t.workers, ev] };
    case 'site': return { ...step(t, { name: 'site', target: 'Drawing a ' + ev.layout + ' page: ' + ev.title }), status: 'Publishing' };
    case 'image_start': return { ...step(t, { name: 'image', target: 'Drawing the picture' }), status: 'Drawing the picture' };
    case 'photo': return { ...step(t, { name: 'image', target: 'Drawing the photo for the page' }), status: 'Drawing the photo' };
    case 'share': return { ...step(t, { name: 'share', target: 'Giving the running app a public link (port ' + Number(ev.port) + ')' }), status: 'Sharing the app' };
    case 'system_plan': return { ...step(t, { name: 'system', target: 'Building a system of ' + ev.services.length + ' services: ' + ev.services.join(', ') }), status: 'Building a system' };
    case 'system_start': return step(t, { name: 'system', target: 'Starting all services with Flisk' });
    case 'video_start': return { ...step(t, { name: 'video', target: 'Making a video: ' + ev.title + ' (' + ev.scenes + ' scenes)' }), status: 'Making a video' };
    case 'note': {
      const last = t.steps[t.steps.length - 1];
      return last && last.name === 'note' && last.target === ev.text ? t : step(t, { name: 'note', target: ev.text });
    }
    case 'output': {
      if (ev.error) return { ...t, outs: [...t.outs, { text: ev.error, bad: true }] };
      const text = [ev.stdout, ev.stderr, ev.content].filter(Boolean).join('\n').replace(/\n$/, '');
      return { ...t, link: ev.live || ev.published || t.link, video: ev.video || t.video, outs: text || ev.exitCode > 0 ? [...t.outs, { text, bad: ev.exitCode > 0 }] : t.outs };
    }
    case 'search': return { ...step(t, { name: 'search', target: 'Searching the web: ' + ev.query }), status: 'Searching the web' };
    case 'websources': return { ...t, sources: [...t.sources, ...(ev.results || [])] };
    case 'pod_stopped': return step(t, { name: 'computer', target: 'Computer stopped' });
    case 'pod_kept': {
      const until = ev.until ? new Date(ev.until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'the provider stops it';
      const target = ev.days
        ? 'Computer kept running for the live app: it sleeps when idle, wakes on a visit, deleted after ' + Number(ev.days) + ' days'
        : 'Computer kept running for the live app until ' + until;
      return { ...step(t, { name: 'computer', target }), kept: { days: Number(ev.days) || 0, until: ev.until || 0 } };
    }
    case 'widget': return { ...t, widgets: [...t.widgets, ev] };
    case 'delta': return { ...t, text: t.text + ev.text };
    case 'retry': return { ...t, text: '' };
    case 'reroute': return { ...step(t, { name: 'computer', target: ev.text }), status: ev.text };
    case 'model': return { ...step(t, { name: 'model', target: 'Answered by ' + ev.name }), model: ev.name };
    case 'answer': return { ...t, answer: ev.text };
    case 'needcomputer': return { ...t, needPod: true };
    case 'browseranswer': return { ...t, browser: ev };
    case 'error': return { ...t, error: { message: ev.error, kind: ev.kind || 'other' } };
    case 'file': return ev.error ? { ...t, outs: [...t.outs, { text: 'Could not put ' + ev.path + ' on the computer: ' + ev.error, bad: true }] } : t;
    default: return t;
  }
}

// What the card under a failed task offers, by the kind the server gave. Same choices as the current page.
export function nextSteps(kind, onFree) {
  const k = onFree && (kind === 'key' || kind === 'model' || kind === 'limit') ? 'other' : kind;
  if (k === 'key') return ['setup-key', 'wolf'];
  if (k === 'model') return ['choose-model', 'wolf'];
  if (k === 'limit') return ['wolf', 'change-provider'];
  if (k === 'computer') return ['connect-computer', 'retry'];
  if (k === 'busy') return ['retry', 'openrouter', 'discord'];
  return ['retry', 'change-model'];
}

// The text of a past chat's first line, used as its title in the side list.
export const chatTitle = (msgs) => String((msgs[0] && msgs[0].content) || '').split('\n')[0].slice(0, 80);

// The part of a task's streamed text and answer the user reads: the final answer wins over the live text.
export const shownText = (t) => (t.answer !== null ? t.answer : t.text);

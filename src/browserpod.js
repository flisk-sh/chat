// The computer in the visitor's own browser tab (github.com/flisk-sh/linux2wasm, served by fleet at /browserpod/): a small Linux on WebAssembly, no key, no cost.
// The task loop runs here on the Worker as always; each computer call is sent down the task's WebSocket to the page,
// which runs it in its pod and sends the result back. Nothing is stored, and a call to the tab is not a subrequest.
import { cleanMode, searchWeb } from './search.js';
import { MAX_TASK, cleanFiles, runTask } from './loop.js';

export const POD_ID = 'browser';
// How long one call may take: the page gives a command 60 seconds, and the first call also loads about 13 MB.
export const CALL_MS = 120_000;

// What the model must know about this computer, added to its instructions.
export const BROWSER_NOTE = `

IMPORTANT, about this computer: it is a small Linux inside the user's own browser tab. It has busybox sh only (ls, cat, sed, awk, grep, tar, gzip, base64, wc).
It has NO internet, NO python3, NO node, NO flisk, NO git, and nothing can be installed (no apt, apk, pip or npm).
So here: never use curl or wget, and never use the "system", "video" or share steps. For a website, send one "site" action (it needs no computer); only when no layout fits, "write" one complete index.html (inline CSS and JS) and "publish" it.
To show an API or a small backend (not a plain page): "write" ONE Cloudflare Worker as a single ES module (no imports from packages; a global fetch handler written as export default { async fetch(request, env) { ... } }, answering an unknown path with status 404 and a list of the real paths; env.KV, env.BUCKET and env.DB are not available unless it says so below) to worker.js, then send {"worker": "worker.js"}. It runs in the user's own tab and they send requests to it from the chat. Keep data in a variable inside the module, never in files. Durable Objects, Queues and AI do not exist there.
For the internet (news, a web page, a feed, prices, a lookup) use the "web" widget: it reads any public address for you. If the task truly needs Python, Node, an installed package or a running app, do not try: reply with "say" and tell the user this needs a cloud computer, which they connect once: sign in with GitHub, then open Computers in the menu.`;

// send(event) goes to the page. Returns the computer for runTask plus reply(message) and close() for the socket.
export function browserComputer(send, { callMs = CALL_MS, wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let n = 0;
  let closed = false;
  const waiting = new Map();
  const fail = (status, error) => ({ status, data: {}, error });
  const call = (op, args = {}) =>
    new Promise((resolve) => {
      if (closed) return resolve(fail(410, 'the browser tab closed'));
      const id = ++n;
      waiting.set(id, resolve);
      send({ type: 'pod_call', id, op, ...args });
      wait(callMs).then(() => {
        if (waiting.delete(id)) resolve(fail(504, 'the computer in your browser did not answer in time'));
      });
    });
  return {
    computer: {
      start: () => call('start'),
      run: (_id, command) => call('run', { command: String(command) }),
      write: (_id, path, content) => call('write', { path: String(path), content: String(content) }),
      read: (_id, path) => call('read', { path: String(path) }),
      share: async () => fail(400, 'A computer in your browser cannot give an app a public link. Connect a cloud computer for that.'),
      stop: () => call('stop'),
    },
    // One answer from the page: { id, data } or { id, error }. Unknown and repeated ids are ignored.
    reply(msg) {
      const resolve = waiting.get(msg?.id);
      if (!resolve) return;
      waiting.delete(msg.id);
      const data = msg.data && typeof msg.data === 'object' ? msg.data : {};
      resolve(msg.error ? fail(500, String(msg.error).slice(0, 500)) : { status: 200, data, error: null });
    },
    close() {
      closed = true;
      for (const resolve of waiting.values()) resolve(fail(410, 'the browser tab closed'));
      waiting.clear();
    },
    get closed() {
      return closed;
    },
  };
}

// One task over one socket. The first message is the task ({ task, history, files, ai }); after that the page only sends
// pod_reply messages. gate(body) -> { refuse: { status, ... } } or { model, maxSteps, modelName, vision }.
// socket: { send(text), close(), addEventListener('message' | 'close' | 'error', fn) }.
export function runOverSocket(socket, { gate, origin, publish, photo, saveImage = null, saveVideo, fetchImpl = fetch, callMs, wait, run = runTask, lookupFacts = null }) {
  const send = (e) => {
    try {
      socket.send(JSON.stringify(e));
    } catch {}
  };
  const pod = browserComputer(send, { callMs, wait });
  let started = false;
  let finish;
  const done = new Promise((r) => (finish = r));
  const end = () => {
    pod.close();
    try {
      socket.close(1000);
    } catch {}
    finish();
  };
  socket.addEventListener('close', () => {
    pod.close();
    finish();
  });
  socket.addEventListener('error', () => {
    pod.close();
    finish();
  });
  socket.addEventListener('message', async (m) => {
    let msg;
    try {
      msg = JSON.parse(typeof m.data === 'string' ? m.data : '');
    } catch {
      return;
    }
    if (msg?.type === 'pod_reply') return pod.reply(msg);
    if (msg?.type !== 'task' || started) return;
    started = true;
    let ok;
    try {
      const task = String(msg.task || '').trim();
      const refuse = !task ? { status: 400, error: 'type a task' } : task.length > MAX_TASK ? { status: 400, error: `keep the task under ${MAX_TASK} characters` } : null;
      ok = refuse ? { refuse } : await gate(msg);
      if (ok.refuse) {
        send({ type: 'refused', ...ok.refuse });
        return end();
      }
      // A closed tab cannot run anything: stop asking the model too.
      const model = async (messages) => (pod.closed ? { error: 'the browser tab closed', kind: 'other' } : ok.model(messages));
      const r = await run({ mode: cleanMode(msg.mode), search: (q) => searchWeb(q, { fetch: fetchImpl }), lookupFacts, task, history: msg.history, origin, model, maxSteps: ok.maxSteps, computer: pod.computer, fetchImpl, files: cleanFiles(msg.files), vision: ok.vision, modelName: ok.modelName, note: BROWSER_NOTE, publish, photo, saveImage, saveVideo, emit: send });
      send({ type: 'done', ms: r.ms, error: r.error });
    } catch (e) {
      send({ type: 'error', error: String(e?.message || e).slice(0, 200) });
      send({ type: 'done', error: 'failed' });
    }
    // A free task the free AI never answered is given back (gate's settle).
    try {
      await ok?.settle?.();
    } catch {}
    end();
  });
  return done;
}

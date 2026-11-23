// Everything the Astryx UI shares with the server and the browser: the key vault, the task stream, computers, OpenRouter.
// The vault is the SAME one the current page uses (IndexedDB "chat_vault", AES-GCM, non-extractable master key), so keys a visitor
// already saved there keep working here.
export const BOOT = (typeof window !== 'undefined' && window.__BOOT__) || {};

const VAULT = {};
let vdb = null;
let master = null;
let queue = Promise.resolve();
const isSecret = (k) => k.indexOf('chat_key_') === 0;
const idb = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function vaultSave(k, v) {
  if (!vdb || !master) return;
  if (!v) { await idb(vdb.transaction('v', 'readwrite').objectStore('v').delete('k:' + k)); return; }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, master, new TextEncoder().encode(v));
  await idb(vdb.transaction('v', 'readwrite').objectStore('v').put({ iv, ct }, 'k:' + k));
}
export const vaultReady = (async () => {
  try {
    vdb = await new Promise((res, rej) => { const r = indexedDB.open('chat_vault', 1); r.onupgradeneeded = () => r.result.createObjectStore('v'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    master = await idb(vdb.transaction('v').objectStore('v').get('master'));
    if (!master) {
      master = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      await idb(vdb.transaction('v', 'readwrite').objectStore('v').put(master, 'master'));
    }
    const ids = await idb(vdb.transaction('v').objectStore('v').getAllKeys());
    for (const id of ids) {
      if (String(id).indexOf('k:') !== 0) continue;
      const rec = await idb(vdb.transaction('v').objectStore('v').get(id));
      try { VAULT[String(id).slice(2)] = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: rec.iv }, master, rec.ct)); } catch (e) { /* a record that cannot be read is skipped */ }
    }
  } catch (e) { vdb = null; master = null; }
})();

export const lsGet = (k) => { if (isSecret(k)) return VAULT[k] || ''; try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
export const lsSet = (k, v) => {
  if (isSecret(k)) {
    if (v) VAULT[k] = v; else delete VAULT[k];
    queue = queue.then(() => vaultReady).then(() => vaultSave(k, VAULT[k] || '')).catch(() => {});
    return;
  }
  try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { /* storage blocked */ }
};
export const keyFor = (prov) => lsGet('chat_key_' + prov);
export const modelFor = (prov) => lsGet('chat_model_' + prov);

// ---- the task stream -------------------------------------------------------------------------------------------------
// POST /api/run answers with one JSON event per line. Returns {status, body} when the server refuses (401 sign in, 409 needs a
// computer, 429 daily limit, anything else), or {status:200} after the stream ended. onEv gets each event as it arrives.
// On by default; open the page with ?cogito=0 to turn it off. /api/run answers in cogito frames (github.com/flisk-sh/cogito) instead of chat's own
// events. fromFrame turns each frame back into the event the page already understands (same as src/cogito.js), so nothing else changes.
const COGITO = 'application/vnd.flisk.cogito+ndjson';
export const cogitoOn = () => { try { return new URLSearchParams(location.search).get('cogito') !== '0'; } catch (e) { return true; } };
const fromFrame = (f) => ('x' in f ? f.x : 't' in f ? { type: 'delta', text: f.t } : 'd' in f ? { type: 'done', ms: f.ms, error: f.err } : null);
export async function runTask(payload, onEv, signal) {
  const res = await fetch('/api/run', { signal, method: 'POST', headers: { 'content-type': 'application/json', accept: cogitoOn() ? COGITO : 'application/x-ndjson' }, body: JSON.stringify(payload) });
  if (!res.ok || !res.body) return { status: res.status, body: await res.json().catch(() => ({})) };
  // Decode by what came back, not by what was asked for: an older server or a proxy may answer in chat's own events.
  const co = (res.headers.get('content-type') || '').includes(COGITO);
  const rd = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await rd.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      let ev;
      try { ev = JSON.parse(line); } catch (e) { continue; }
      if (co) { ev = fromFrame(ev); if (!ev) continue; }
      onEv(ev);
    }
  }
  return { status: 200 };
}

// ---- the computer in this tab ----------------------------------------------------------------------------------------
// With no cloud computer connected, /api/run answers 409. The task then runs on a small Linux inside this tab (fleet's browser pod,
// a pinned release of github.com/flisk-sh/linux2wasm) over a WebSocket to chat: chat thinks, the tab is the computer. Same as /classic.
export const podOk = () => !!BOOT.pod && typeof WebAssembly === 'object' && typeof WebSocket === 'function';
let podP = null;
export function getPod() {
  if (!podP) podP = import(/* @vite-ignore */ BOOT.pod + 'pod.js').then((m) => m.startBrowserPod({ base: BOOT.pod + 'vendor/' })).catch((e) => { podP = null; throw e; });
  return podP;
}
async function podCall(ev) {
  if (ev.op === 'stop') { const was = podP; podP = null; if (was) { const p = await was.catch(() => null); if (p) await p.stop(); } return {}; }
  const pod = await getPod();
  if (ev.op === 'start') return { id: 'browser', provider: 'your browser' };
  if (ev.op === 'run') return pod.run(String(ev.command), { timeout: 60 });
  if (ev.op === 'write') { await pod.write(String(ev.path), String(ev.content)); return {}; }
  if (ev.op === 'read') return pod.read(String(ev.path));
  throw new Error('unknown computer call');
}
// One task on the computer in this tab. Returns {status:200} when it is done, or chat's refusal as {status, body}
// (429 daily limit, anything else); throws when the line breaks or the user presses Stop (an AbortError).
export function runInBrowser(payload, onEv, signal) {
  return new Promise((resolve, reject) => {
    let over = false;
    const ws = new WebSocket(location.origin.replace(/^http/, 'ws') + '/api/run');
    const fin = (v, e) => { if (over) return; over = true; try { ws.close(); } catch (x) { /* already closed */ } if (e) reject(e); else resolve(v); };
    signal.addEventListener('abort', () => { const e = new Error('stopped'); e.name = 'AbortError'; fin(null, e); podCall({ op: 'stop' }).catch(() => {}); });
    ws.onopen = () => ws.send(JSON.stringify({ type: 'task', ...payload }));
    ws.onmessage = async (m) => {
      let ev;
      try { ev = JSON.parse(m.data); } catch (e) { return; }
      if (ev.type === 'pod_call') {
        let out;
        try { out = { data: await podCall(ev) }; } catch (e) { out = { error: String((e && e.message) || e) }; }
        try { ws.send(JSON.stringify({ type: 'pod_reply', id: ev.id, ...out })); } catch (e) { /* line closed */ }
        return;
      }
      if (ev.type === 'refused') return fin({ status: ev.status || 400, body: ev });
      if (ev.type === 'done') return fin({ status: 200 });
      onEv(ev);
    };
    ws.onerror = () => fin(null, new Error('Chat could not open the line to the computer in your browser. Try again.'));
    ws.onclose = () => fin(null, new Error('The line to chat closed before the task finished. Try again.'));
  });
}

// Connect a computer (Daytona, Upstash, E2B, Isorun) with the visitor's own key. The server keeps it encrypted, per login.
export async function connectComputer(provider, key) {
  const res = await fetch('/api/connect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider, key }) }).catch(() => null);
  const body = res ? await res.json().catch(() => ({})) : {};
  return { ok: !!res && res.ok, error: body.error || (res ? '' : 'Could not reach Chat. Check your connection.') };
}

// ---- OpenRouter: log in with the visitor's own free account (PKCE, no secret of ours) and the model catalogue ----------
const b64u = (u) => btoa(String.fromCharCode(...new Uint8Array(u))).replace(/[+]/g, '-').replace(/[/]/g, '_').replace(/=*$/, '');
export const OR_FREE = ['google/gemma-4-31b-it:free', 'google/gemma-4-26b-a4b-it:free', 'nvidia/nemotron-3.5-lightning:free', 'nvidia/nemotron-3-ultra-550b-a55b:free'];

export async function orStartLogin(task) {
  const v = b64u(crypto.getRandomValues(new Uint8Array(32)));
  const ch = b64u(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)));
  try { sessionStorage.setItem('chat_or_v', v); sessionStorage.setItem('chat_or_task', task || ''); } catch (e) { /* private mode */ }
  location.href = 'https://openrouter.ai/auth?callback_url=' + encodeURIComponent(location.origin + location.pathname) + '&code_challenge=' + ch + '&code_challenge_method=S256';
}
// Back from OpenRouter with ?code=: swap it for the visitor's key and keep it in the vault. Resolves {task} or {error}, or null when this is not a return.
export async function orFinishLogin() {
  const code = new URLSearchParams(location.search).get('code');
  let v = '';
  let task = '';
  try { v = sessionStorage.getItem('chat_or_v') || ''; task = sessionStorage.getItem('chat_or_task') || ''; } catch (e) { /* private mode */ }
  if (!code || !v) return null;
  history.replaceState(null, '', location.pathname);
  try { sessionStorage.removeItem('chat_or_v'); sessionStorage.removeItem('chat_or_task'); } catch (e) { /* private mode */ }
  try {
    const r = await fetch('https://openrouter.ai/api/v1/auth/keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, code_verifier: v, code_challenge_method: 'S256' }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.key) throw new Error((j.error && j.error.message) || 'OpenRouter did not send a key');
    await vaultReady;
    lsSet('chat_key_openrouter', j.key);
    return { task };
  } catch (e) { return { error: String(e.message || e).slice(0, 160), task }; }
}
// One row per OpenRouter model: id, readable name, price tier, whether it takes pictures, whether it is free.
export async function orCatalogue() {
  const r = await fetch('https://openrouter.ai/api/v1/models');
  const j = await r.json();
  return (j.data || []).filter((x) => x && x.id).map((x) => {
    const ppm = (Number(x.pricing && x.pricing.prompt) || 0) * 1e6;
    return { id: x.id, name: String(x.name || x.id.split('/').pop()).replace(/^[^:]*: /, ''), ctx: x.context_length || 0, free: ppm === 0, price: ppm === 0 ? 'free' : ppm < 1 ? '$' : ppm < 5 ? '$$' : '$$$', sees: ((x.architecture && x.architecture.input_modalities) || []).indexOf('image') >= 0 };
  });
}

// ---- past chats: this browser only, same storage and shape as the current page -------------------------------------------
const HKEY = 'chat_history_v1';
export const loadChats = () => { try { return JSON.parse(localStorage.getItem(HKEY) || '[]'); } catch (e) { return []; } };
// Remove one chat from this browser and return the list that is left (#355).
export const deleteChat = (id) => { const left = loadChats().filter((c) => c.id !== id); saveChats(left); return left.slice(0, 30); };
export const saveChats = (all) => { try { localStorage.setItem(HKEY, JSON.stringify(all.slice(0, 30))); } catch (e) { /* storage full or blocked */ } };

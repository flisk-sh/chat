// Try the browser computer locally, in a real browser, with no Cloudflare and no keys:
//   bun scripts/dev-browser-pod.mjs ../fleet/web        then open http://localhost:8853
// It serves chat itself (src/index.js) with a scripted stand-in for the AI model and an empty fleet (no cloud computer),
// and serves fleet's web/ folder (the pod files, after `sh web/browserpod/vendor/get.sh`) on a second port with CORS.
// What it proves: the page, the WebSocket relay, the Linux in the tab and publish. What it does not: the real model and
// Cloudflare's own WebSocket.
import { readFileSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { handle } from '../src/index.js';
import { fakeD1 } from '../test/d1.js';

const web = process.argv[2];
if (!web) throw new Error('give the path to fleet\'s web folder');
const PORT = Number(process.env.PORT || 8853);
const POD_PORT = PORT + 1;
const ORIGIN = `http://localhost:${PORT}`;
const env = { DB: fakeD1(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')), PUBLIC_ORIGIN: ORIGIN, SESSION_SECRET: 'dev-only', FLEET_URL: 'https://fleet.invalid', FLEET_SERVICE_SECRET: 'x'.repeat(40), INFERENCE_KEY: 'dev', INFERENCE_URL: 'https://model.invalid/v1/chat/completions', BROWSER_POD_URL: `http://localhost:${POD_PORT}/browserpod/` };

const SITE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Moon Roast Coffee</title>
<style>body{margin:0;font:18px/1.6 Georgia,serif;background:#f6efe6;color:#2b1d14}header{padding:18vh 8vw;background:#2b1d14;color:#f6efe6}h1{font-size:clamp(40px,8vw,96px);margin:0}main{padding:8vh 8vw;display:grid;gap:24px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}article{border-top:2px solid #2b1d14;padding-top:12px}</style></head>
<body><header><h1>Moon Roast</h1><p>Small-batch coffee, roasted every morning.</p></header>
<main><article><h2>Espresso</h2><p>Dark, short and sweet.</p></article><article><h2>Filter</h2><p>Bright and slow, by the cup.</p></article><article><h2>Beans</h2><p>Take a bag home.</p></article></main></body></html>`;
// The stand-in model: write the page, look at it, publish it, say so. One step per answer it has already given.
const SCRIPT = [JSON.stringify({ write: { path: 'site/index.html', content: SITE } }), '{"run":"uname -sm && ls -la site && wc -c site/index.html"}', '{"publish":"site/index.html"}', '{"say":"Your coffee website is live. It was made on the small Linux inside this browser tab."}'];
const fetchImpl = async (url, init = {}) => {
  const u = new URL(url);
  if (u.host === 'model.invalid') {
    const done = JSON.parse(init.body).messages.filter((m) => m.role === 'assistant').length;
    return Response.json({ choices: [{ message: { content: SCRIPT[Math.min(done, SCRIPT.length - 1)] } }] });
  }
  if (u.host === 'fleet.invalid' && u.pathname === '/v1/connections') return Response.json({ connections: {} });
  return Response.json({ error: 'not in the dev harness' }, { status: 404 });
};

// Chat's end of the socket, in the shape runOverSocket wants, backed by Bun's WebSocket once it opens.
const adapter = () => {
  const on = { message: [], close: [], error: [] };
  const a = { ws: null, queue: [], on, addEventListener: (n, fn) => on[n].push(fn), send: (t) => (a.ws ? a.ws.send(t) : a.queue.push(t)), close: () => a.ws?.close() };
  return a;
};
Bun.serve({
  port: PORT,
  async fetch(req, server) {
    const a = adapter();
    const res = await handle(req, env, { fetchImpl, socketPair: () => [null, a] });
    if ((req.headers.get('upgrade') || '').toLowerCase() === 'websocket' && res.status === 200) return server.upgrade(req, { data: a }) ? undefined : new Response('no upgrade', { status: 500 });
    return res;
  },
  websocket: {
    open(ws) { ws.data.ws = ws; for (const t of ws.data.queue.splice(0)) ws.send(t); },
    message(ws, data) { for (const fn of ws.data.on.message) fn({ data: String(data) }); },
    close(ws) { for (const fn of ws.data.on.close) fn({}); },
  },
});
Bun.serve({
  port: POD_PORT,
  fetch(req) {
    const path = normalize(decodeURIComponent(new URL(req.url).pathname));
    if (path.includes('..')) return new Response('no', { status: 400 });
    return new Response(Bun.file(join(web, path)), { headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' } });
  },
});
console.log(`chat on ${ORIGIN}, pod files on http://localhost:${POD_PORT}/browserpod/`);

// A system of services: the user asks for more than one website or one small app (a back office with orders, stock,
// billing, customers...). The model names the services; chat writes the boring parts on the user's computer in one
// go (a tiny API per service with /health, a dashboard that sits in front of all of them, one service.json each),
// starts everything with `flisk up` as plain local processes, and smoke-tests every service. The model then edits
// the services that matter with "write" and answers with the measured result.
// This is a scaffold with in-memory records, not a finished back office; the answer must say so.
export const MAX_SERVICES = 12;
const NAME = /^[a-z][a-z0-9-]{1,23}$/;
const DIR = '/tmp/flisk-system';

// Keeps only names a folder, a port label and a URL can safely carry.
export function cleanSystem(v) {
  if (!v || typeof v !== 'object' || !Array.isArray(v.services)) return null;
  const s = (x, n) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  const seen = new Set(['web']);
  const services = [];
  for (const sv of v.services) {
    const name = s(typeof sv === 'string' ? sv : sv?.name, 24).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!NAME.test(name) || seen.has(name)) continue;
    seen.add(name);
    services.push({ name, does: s(typeof sv === 'string' ? '' : sv?.does, 80) });
    if (services.length >= MAX_SERVICES) break;
  }
  if (services.length < 2) return null;
  return { title: s(v.title, 60) || 'My system', services };
}

export const SYSTEM_PY = String.raw`import json, os
spec = json.load(open('system.json'))
SVC = r'''const http = require('http');
const NAME = '__NAME__';
const rows = [];
let next = 1;
const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const parts = url.pathname.split('/').filter(Boolean);
  if (url.pathname === '/health') return send(res, 200, { ok: true, service: NAME, records: rows.length });
  if (parts[0] !== 'api' || parts[1] !== NAME) return send(res, 404, { error: 'not found' });
  const id = parts[2] ? Number(parts[2]) : null;
  if (req.method === 'GET' && !id) return send(res, 200, rows);
  if (req.method === 'GET') { const r = rows.find((x) => x.id === id); return r ? send(res, 200, r) : send(res, 404, { error: 'no such record' }); }
  if (req.method === 'DELETE' && id) { const i = rows.findIndex((x) => x.id === id); if (i < 0) return send(res, 404, { error: 'no such record' }); rows.splice(i, 1); return send(res, 200, { ok: true }); }
  if (req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 20000) req.destroy(); });
    req.on('end', () => { let data = {}; try { data = JSON.parse(body || '{}'); } catch { return send(res, 400, { error: 'send JSON' }); } const r = { id: next++, ...data }; rows.push(r); send(res, 201, r); });
    return;
  }
  send(res, 405, { error: 'method not allowed' });
}).listen(Number(process.env.PORT) || __PORT__, () => console.log(NAME + ' ready'));
'''
WEB = r'''const http = require('http');
const SERVICES = __SERVICES__;
const get = (port, path) => fetch('http://127.0.0.1:' + port + path).then((r) => r.json()).catch(() => null);
const page = (rows) => '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>__TITLE__</title><style>body{font:16px system-ui;margin:0;background:#f7f6f2;color:#1b1b18}main{max-width:720px;margin:0 auto;padding:32px 16px}h1{font-size:28px;letter-spacing:-.02em}table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e4e2da}td,th{padding:10px 12px;text-align:left;border-bottom:1px solid #eee}.ok{color:#2d7d4a}.down{color:#b42318}small{color:#6b6a63}</style><main><h1>__TITLE__</h1><p><small>One page in front of every service. Records live in memory until you connect a database.</small></p><table><tr><th>Service</th><th>What it does</th><th>Records</th><th>State</th></tr>' + rows.map((r) => '<tr><td><b>' + r.name + '</b></td><td>' + r.does + '</td><td>' + r.records + '</td><td class="' + (r.up ? 'ok' : 'down') + '">' + (r.up ? 'healthy' : 'down') + '</td></tr>').join('') + '</table></main>';
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true}'); }
  const rows = await Promise.all(SERVICES.map(async (s) => { const h = await get(s.port, '/health'); return { ...s, up: !!h?.ok, records: h?.records ?? 0 }; }));
  if (url.pathname === '/status') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(rows)); }
  const m = url.pathname.match(/^\/api\/([a-z0-9-]+)/);
  const target = m && SERVICES.find((s) => s.name === m[1]);
  if (target) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const r = await fetch('http://127.0.0.1:' + target.port + url.pathname, { method: req.method, headers: { 'content-type': 'application/json' }, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }).catch(() => null);
    if (!r) { res.writeHead(502); return res.end('{"error":"service is down"}'); }
    res.writeHead(r.status, { 'content-type': 'application/json' }); return res.end(await r.text());
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(page(rows));
}).listen(Number(process.env.PORT) || 3000, () => console.log('web ready'));
'''
def put(folder, name, body):
    os.makedirs(folder, exist_ok=True)
    open(os.path.join(folder, name), 'w').write(body)
def conf(name, kind, port, extra):
    c = {'$schema': 'https://flisk.sh/schema.service.json', 'schemaVersion': 1, 'appName': name, 'appType': kind, 'command': 'node server.js', 'port': port, 'healthCheckPath': '/health'}
    c.update(extra)
    return json.dumps(c, indent=2)
svcs = []
for i, s in enumerate(spec['services']):
    port = 4101 + i
    put(s['name'], 'server.js', SVC.replace('__NAME__', s['name']).replace('__PORT__', str(port)))
    put(s['name'], 'service.json', conf(s['name'], 'backend', port, {}))
    svcs.append({'name': s['name'], 'does': s['does'] or 'records', 'port': port})
web = WEB.replace('__SERVICES__', json.dumps(svcs)).replace('__TITLE__', spec['title'].replace("'", ''))
put('web', 'server.js', web)
put('web', 'service.json', conf('web', 'frontend', 3000, {'dependsOn': [s['name'] for s in svcs]}))
print('wrote', len(svcs), 'services and web')
`;

const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const START = `export PATH=$HOME/.local/bin:$PATH; cd ${DIR} && python3 gen.py && (command -v flisk >/dev/null || curl -fsSL https://flisk.sh/install.sh | sh >/dev/null 2>&1); export PATH=$HOME/.local/bin:$PATH; (nohup flisk up > /tmp/up.log 2>&1 &); sleep 3; echo started`;
const SMOKE = (spec) => {
  const lines = spec.services.map((s, i) => {
    const port = 4101 + i;
    return `h=$(curl -s -m 3 http://127.0.0.1:${port}/health); c=$(curl -s -m 3 -X POST -H 'content-type: application/json' -d '{"note":"smoke test"}' -o /dev/null -w '%{http_code}' http://127.0.0.1:${port}/api/${s.name}); echo ${q(s.name)} health=\${h:-DOWN} post=$c`;
  });
  return `${lines.join('; ')}; echo web=$(curl -s -m 3 http://127.0.0.1:3000/health || echo DOWN)`;
};
const WAIT = (n) => `for i in $(seq 1 25); do up=0; for p in $(seq 4101 ${4100 + n}); do curl -fs -m 1 http://127.0.0.1:$p/health >/dev/null && up=$((up+1)); done; [ "$up" = "${n}" ] && curl -fs -m 1 http://127.0.0.1:3000/health >/dev/null && break; sleep 2; done; echo healthy=$up/${n}; tail -5 /tmp/up.log`;

// Writes, starts and smoke-tests the system on the computer. Returns { summary } for the model, or { error }.
export async function makeSystem({ computer, podId, spec, emit = () => {}, polls = 2 }) {
  const mk = await computer.run(podId, `mkdir -p ${DIR}`);
  if (mk.error) return { error: mk.error };
  const w1 = await computer.write(podId, `${DIR}/gen.py`, SYSTEM_PY);
  const w2 = w1.error ? w1 : await computer.write(podId, `${DIR}/system.json`, JSON.stringify(spec));
  if (w2.error) return { error: w2.error };
  const s = await computer.run(podId, START);
  if (s.error) return { error: s.error };
  if (s.data.exitCode !== 0) return { error: `could not start the system: ${(s.data.stderr || s.data.stdout || '').slice(0, 300)}` };
  emit({ type: 'system_start', title: spec.title, services: spec.services.length });
  let waited = '';
  for (let i = 0; i < polls; i++) {
    const r = await computer.run(podId, WAIT(spec.services.length));
    if (r.error) return { error: r.error };
    waited = r.data.stdout || '';
    if (new RegExp(`healthy=${spec.services.length}/${spec.services.length}`).test(waited)) break;
  }
  const t = await computer.run(podId, SMOKE(spec));
  if (t.error) return { error: t.error };
  const out = (t.data.stdout || '').trim();
  const down = (out.match(/DOWN/g) || []).length;
  return { summary: `The system is written in ${DIR} and started with flisk up. ${waited.split('\n')[0]}\nSmoke test (health, then one POST that must answer 201):\n${out}\n${down ? `${down} part(s) did not answer; look at /tmp/up.log with "run" before you say it works.` : 'Every part answered. Each service keeps records in memory only, and the computer stops when you answer.'}`, services: spec.services.map((x) => x.name), ok: !down };
}

// A bigger app: the user asks for more than one small app (a CRM, a back office with orders, stock, billing,
// customers...). The model names the parts; chat makes ONE Flisk project in ~/app on the computer, the same project the
// app recipe makes, with one `flisk resource --type backend` per part plus the website in front:
//   ~/app/web            the website (Vite). It calls /api/<part> on its own address; Vite forwards each to its backend.
//   ~/app/api            the overview API (/api/summary: how many records each part has, and whether it answers).
//   ~/app/<part>         one backend per part: a records API under /api/<part>, saved to ~/app/<part>/data.json.
// Then `flisk up` starts everything as plain processes, and chat adds, reads and deletes one record in every part
// through the website's port, the same way a visitor's clicks go. The model then shares the website's port, so the
// user gets the real website and the real API behind it, never a copy.
export const MAX_SERVICES = 12;
export const FIRST_PORT = 4101;
export const MAX_FIELDS = 6;
const NAME = /^[a-z][a-z0-9-]{1,23}$/;
// Folder and resource names the project already uses.
const TAKEN = ['web', 'api', 'app', 'app-api', 'app-web', 'services', 'node-modules', 'shared-platform-engineering', 'proxy', 'database-management'];
export const APP_DIR = '~/app';

const s = (x, n) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const slug = (x, n) => s(x, n).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');

function cleanFields(list) {
  const out = [];
  const seen = new Set(['id', 'createdat']);
  for (const f of Array.isArray(list) ? list : []) {
    const label = s(typeof f === 'string' ? f : f?.label || f?.name, 30);
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!key || seen.has(key.replace(/_/g, ''))) continue;
    seen.add(key.replace(/_/g, ''));
    out.push({ key, label });
    if (out.length >= MAX_FIELDS) break;
  }
  return out.length ? out : [{ key: 'name', label: 'Name' }, { key: 'notes', label: 'Notes' }];
}

// Keeps only names a folder, a port label, a shell word and a URL can safely carry.
export function cleanSystem(v) {
  if (!v || typeof v !== 'object' || !Array.isArray(v.services)) return null;
  const seen = new Set(TAKEN);
  const services = [];
  for (const sv of v.services) {
    const name = slug(typeof sv === 'string' ? sv : sv?.name, 24);
    if (!NAME.test(name) || seen.has(name)) continue;
    seen.add(name);
    services.push({ name, does: s(typeof sv === 'string' ? '' : sv?.does, 80), fields: cleanFields(sv?.fields) });
    if (services.length >= MAX_SERVICES) break;
  }
  if (services.length < 2) return null;
  return { title: s(v.title, 60) || 'My app', services: services.map((x, i) => ({ ...x, port: FIRST_PORT + i })) };
}

// ---- The files chat writes into the Flisk project.

// One part's backend: plain Node, no packages, so it needs no npm install. `npm run dev` is `node --watch`, so an edit restarts it.
export const serviceJs = (svc) => `import http from 'node:http';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ${svc.name}: ${svc.does || 'records'}. Written by Flisk Chat.
// Records are saved in ../data.json, so they survive a restart and the computer waking up again.
// Routes: GET /health, GET /api/${svc.name}, POST /api/${svc.name}, GET|PATCH|DELETE /api/${svc.name}/<id>
const NAME = ${JSON.stringify(svc.name)};
const PORT = Number(process.env.PORT) || ${svc.port};
const FILE = fileURLToPath(new URL('../data.json', import.meta.url));
const MAX_ROWS = 5000;
let db = { next: 1, rows: [] };
try {
  const saved = JSON.parse(readFileSync(FILE, 'utf8'));
  if (Array.isArray(saved?.rows)) db = saved;
} catch {}
const save = () => {
  writeFileSync(FILE + '.tmp', JSON.stringify(db));
  renameSync(FILE + '.tmp', FILE);
};
const send = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
const readJson = (req) =>
  new Promise((ok, fail) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 50000) req.destroy(new Error('too big'));
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        ok(data && typeof data === 'object' && !Array.isArray(data) ? data : null);
      } catch {
        ok(null);
      }
    });
    req.on('error', fail);
  });
// Only plain values, short keys and short text are kept.
const clean = (data) =>
  Object.fromEntries(
    Object.entries(data)
      .filter(([k, v]) => k !== 'id' && k !== 'createdAt' && ['string', 'number', 'boolean'].includes(typeof v))
      .slice(0, 30)
      .map(([k, v]) => [k.slice(0, 40), typeof v === 'string' ? v.slice(0, 2000) : v]),
  );

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/health') return send(res, 200, { ok: true, service: NAME, records: db.rows.length });
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'api' || parts[1] !== NAME || parts.length > 3) return send(res, 404, { error: 'not found' });
    const id = parts[2] ? Number(parts[2]) : null;
    const at = id ? db.rows.findIndex((r) => r.id === id) : -1;
    if (id !== null && at < 0) return send(res, 404, { error: 'no such record' });
    if (req.method === 'GET') return send(res, 200, id ? db.rows[at] : db.rows);
    if (req.method === 'POST' && !id) {
      const data = await readJson(req).catch(() => null);
      if (!data) return send(res, 400, { error: 'send a JSON object' });
      if (db.rows.length >= MAX_ROWS) return send(res, 507, { error: 'this part is full (' + MAX_ROWS + ' records)' });
      const row = { id: db.next++, ...clean(data), createdAt: new Date().toISOString() };
      db.rows.push(row);
      save();
      return send(res, 201, row);
    }
    if ((req.method === 'PATCH' || req.method === 'PUT') && id) {
      const data = await readJson(req).catch(() => null);
      if (!data) return send(res, 400, { error: 'send a JSON object' });
      db.rows[at] = { ...db.rows[at], ...clean(data) };
      save();
      return send(res, 200, db.rows[at]);
    }
    if (req.method === 'DELETE' && id) {
      db.rows.splice(at, 1);
      save();
      return send(res, 200, { ok: true, id });
    }
    send(res, 405, { error: 'method not allowed' });
  })
  .listen(PORT, () => console.log(NAME + ' ready on ' + PORT));
`;

// The project's own API (made by \`flisk create\`) becomes the overview every page can ask: which parts answer, how many records.
export const overviewJs = (spec, port) => `import http from 'node:http';

// The overview of ${JSON.stringify(spec.title)}. Written by Flisk Chat.
// GET /api/summary: every part, whether it answers and how many records it has.
const PORT = Number(process.env.PORT) || ${port};
const PARTS = ${JSON.stringify(spec.services.map(({ name, port: p }) => ({ name, port: p })))};
const send = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/health') return send(res, 200, { ok: true, service: 'app-api' });
    if (url.pathname === '/api/summary' && req.method === 'GET') {
      const parts = await Promise.all(
        PARTS.map(async (p) => {
          const h = await fetch('http://127.0.0.1:' + p.port + '/health', { signal: AbortSignal.timeout(2000) }).then((r) => r.json()).catch(() => null);
          return { name: p.name, up: !!h?.ok, records: h?.records ?? 0 };
        }),
      );
      return send(res, 200, parts);
    }
    send(res, 404, { error: 'not found' });
  })
  .listen(PORT, () => console.log('app-api ready on ' + PORT));
`;

// Vite forwards /api/<part> to that part's backend and everything else under /api to the overview. Keys that start with ^
// are regular expressions, so /api/order never catches /api/orders.
export const viteConfig = (spec, ports) => `import { defineConfig } from 'vite';

// Written by Flisk Chat: the website answers on any host name (so its public link works) and forwards each part's API.
const to = (port: number) => ({ target: 'http://127.0.0.1:' + port, changeOrigin: true });
export default defineConfig({
  server: {
    host: true,
    allowedHosts: true,
    port: Number(process.env.PORT ?? ${ports.web}),
    strictPort: true,
    proxy: {
${spec.services.map((x) => `      '^/api/${x.name}(/|$)': to(${x.port}),`).join('\n')}
      '/api': to(${ports.api}),
      '/health': to(${ports.api}),
    },
  },
});
`;

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// The website: a tab per part with its records, an add form and a delete button, each a real call to /api/<part>.
export const indexHtml = (spec) => {
  const data = JSON.stringify({ title: spec.title, parts: spec.services.map(({ name, does, fields }) => ({ name, does, fields })) }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(spec.title)}</title>
<style>
:root{--bg:#faf9f6;--card:#fff;--ink:#171714;--dim:#6b6a63;--line:#e6e3da;--ok:#23794a;--bad:#b42318;font:15px/1.5 ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--ink);background:var(--bg)}
*{box-sizing:border-box}body{margin:0}header{border-bottom:1px solid var(--line);background:var(--card)}
.wrap{max-width:1040px;margin:0 auto;padding:0 16px}h1{font-size:22px;letter-spacing:-.02em;margin:0;padding:18px 0 10px}
nav{display:flex;gap:4px;overflow-x:auto;padding-bottom:10px}nav button{border:1px solid transparent;background:none;padding:6px 12px;border-radius:0;font:inherit;color:var(--dim);cursor:pointer;white-space:nowrap}
nav button[aria-current=true]{border-color:var(--line);background:var(--bg);color:var(--ink);font-weight:600}
main{padding:24px 16px 48px}h2{font-size:18px;margin:0 0 2px;text-transform:capitalize}p.does{color:var(--dim);margin:0 0 16px}
form{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;background:var(--card);border:1px solid var(--line);border-radius:0;padding:12px;margin-bottom:16px}
input{font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:0;background:#fff;min-width:0}
button.go{font:inherit;font-weight:600;padding:8px 14px;border:0;border-radius:0;background:var(--ink);color:#fff;cursor:pointer}
.table{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:0}table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--dim)}
tr:last-child td{border-bottom:0}td.x{width:1%;white-space:nowrap}button.del{font:inherit;font-size:13px;border:1px solid var(--line);background:none;border-radius:0;padding:4px 10px;cursor:pointer;color:var(--bad)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}.card{background:var(--card);border:1px solid var(--line);border-radius:0;padding:14px;cursor:pointer}
.card b{text-transform:capitalize}.n{font-size:28px;font-weight:650;letter-spacing:-.02em}.up{color:var(--ok)}.down{color:var(--bad)}
.msg{color:var(--bad);margin:8px 0}.empty{color:var(--dim);padding:18px 12px}
</style>
</head>
<body>
<header><div class="wrap"><h1 id="title"></h1><nav id="tabs"></nav></div></header>
<main class="wrap" id="view"></main>
<script type="module">
const APP = ${data};
const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Every read and change is a real call to this site's own /api, which Flisk forwards to the part's backend.
async function api(path, init = {}) {
  const r = await fetch('/api/' + path, { ...init, headers: { 'content-type': 'application/json' } });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error((body && body.error) || 'HTTP ' + r.status);
  return body;
}
document.title = APP.title;
$('#title').textContent = APP.title;
const tabs = [{ name: 'overview' }, ...APP.parts];
function nav(current) {
  $('#tabs').innerHTML = tabs.map((t) => '<button data-tab="' + t.name + '" aria-current="' + (t.name === current) + '">' + esc(t.name === 'overview' ? 'Overview' : t.name.replace(/-/g, ' ')) + '</button>').join('');
}
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) location.hash = b.dataset.tab; });
async function overview() {
  const view = $('#view');
  view.innerHTML = '<h2>Overview</h2><p class="does">Every part of ' + esc(APP.title) + ', how many records it holds and whether it answers.</p><div class="cards" id="cards">Loading...</div>';
  try {
    const rows = await api('summary');
    $('#cards').innerHTML = rows.map((r) => '<div class="card" data-go="' + esc(r.name) + '"><b>' + esc(r.name.replace(/-/g, ' ')) + '</b><div class="n">' + Number(r.records) + '</div><span class="' + (r.up ? 'up' : 'down') + '">' + (r.up ? 'answering' : 'not answering') + '</span></div>').join('');
  } catch (e) {
    $('#cards').innerHTML = '<p class="msg">Could not load the overview: ' + esc(e.message) + '</p>';
  }
}
$('#view').addEventListener('click', (e) => { const c = e.target.closest('[data-go]'); if (c) location.hash = c.dataset.go; });
async function part(p) {
  const view = $('#view');
  view.innerHTML = '<h2>' + esc(p.name.replace(/-/g, ' ')) + '</h2><p class="does">' + esc(p.does) + '</p>' +
    '<form id="add">' + p.fields.map((f) => '<input name="' + f.key + '" placeholder="' + esc(f.label) + '" aria-label="' + esc(f.label) + '">').join('') + '<button class="go" type="submit">Add</button></form>' +
    '<p class="msg" id="msg" hidden></p><div class="table" id="rows">Loading...</div>';
  const say = (t) => { $('#msg').hidden = !t; $('#msg').textContent = t || ''; };
  const load = async () => {
    try {
      const rows = await api(p.name);
      $('#rows').innerHTML = rows.length
        ? '<table><thead><tr>' + p.fields.map((f) => '<th>' + esc(f.label) + '</th>').join('') + '<th>Added</th><th></th></tr></thead><tbody>' +
          rows.slice().reverse().map((r) => '<tr>' + p.fields.map((f) => '<td>' + esc(r[f.key]) + '</td>').join('') + '<td>' + esc(String(r.createdAt || '').slice(0, 10)) + '</td><td class="x"><button class="del" data-id="' + Number(r.id) + '">Delete</button></td></tr>').join('') + '</tbody></table>'
        : '<div class="empty">No records yet. Add the first one above.</div>';
    } catch (e) {
      $('#rows').innerHTML = '<div class="empty">Could not load: ' + esc(e.message) + '</div>';
    }
  };
  $('#add').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    if (!Object.values(data).some((v) => String(v).trim())) return say('Fill in at least one field.');
    try { await api(p.name, { method: 'POST', body: JSON.stringify(data) }); e.target.reset(); say(''); await load(); } catch (err) { say('Could not add: ' + err.message); }
  });
  $('#rows').addEventListener('click', async (e) => {
    const b = e.target.closest('button.del');
    if (!b) return;
    try { await api(p.name + '/' + b.dataset.id, { method: 'DELETE' }); say(''); await load(); } catch (err) { say('Could not delete: ' + err.message); }
  });
  await load();
}
function route() {
  const name = decodeURIComponent(location.hash.slice(1)) || 'overview';
  const p = APP.parts.find((x) => x.name === name);
  nav(p ? p.name : 'overview');
  return p ? part(p) : overview();
}
addEventListener('hashchange', route);
route();
</script>
</body>
</html>
`;
};

// ---- The commands chat runs on the computer.

const PATHS = 'export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH';
// `flisk create` checks for Bun 1.2+ even for a Node project, and many computers have none: install it when it is missing.
export const BUN_INSTALL = 'command -v bun >/dev/null || curl -fsSL https://bun.sh/install | bash >/dev/null 2>&1 || npm install -g bun >/dev/null 2>&1';
const portOf = (f) => `$(sed -n 's/.*"port": *\\([0-9]*\\).*/\\1/p' ${f} | head -1)`;

// Installs Flisk if needed, makes the project and one backend resource per part, and prints the website's and API's ports.
export const scaffoldCommand = (spec) =>
  `${PATHS}; command -v flisk >/dev/null || curl -fsSL https://flisk.sh/install.sh | sh >/dev/null 2>&1; ${BUN_INSTALL}; ${PATHS}; ` +
  `command -v flisk >/dev/null || { echo 'Flisk did not install'; exit 2; }; ` +
  `cd ~ && { [ ! -e app ] || { echo '~/app already exists: the bigger app needs a fresh ~/app (run "rm -rf ~/app" first to replace it)'; exit 2; }; }; ` +
  `flisk create app --frontend vanilla --language node --yes > /tmp/create.log 2>&1 || { tail -20 /tmp/create.log; exit 2; }; cd ~/app && ` +
  spec.services.map((x) => `{ flisk resource ${x.name} --type backend --language node --local --stack app --path ${x.name} --port ${x.port} --yes >> /tmp/create.log 2>&1 || { echo 'flisk resource ${x.name} failed:'; tail -10 /tmp/create.log; exit 2; }; }`).join(' && ') +
  ` && echo "ports api=${portOf('api/service.json')} web=${portOf('web/service.json')}"`;

// npm install (only the website has packages) and `flisk up` keep running after this command answers.
export const START_COMMAND = `${PATHS}; cd ~/app && (nohup sh -c 'cd web && npm install --no-audit --no-fund > /tmp/npm.log 2>&1; cd .. && exec flisk up' > /tmp/up.log 2>&1 &) && echo started`;

export const waitCommand = (spec, web) => {
  const ports = spec.services.map((x) => x.port).join(' ');
  const n = spec.services.length;
  return `for i in $(seq 1 18); do up=0; for p in ${ports}; do curl -fs -m 1 http://127.0.0.1:$p/health >/dev/null && up=$((up+1)); done; w=$(curl -s -o /dev/null -m 2 -w '%{http_code}' http://127.0.0.1:${web}/); [ "$up" = "${n}" ] && [ "$w" = 200 ] && break; sleep 2; done; echo "healthy=$up/${n} web=$w"; tail -4 /tmp/up.log; tail -2 /tmp/npm.log`;
};

// The check goes the way a visitor's clicks go: through the website's port. Each part: add one record, read it back, delete it.
export const smokeCommand = (spec, web) =>
  spec.services
    .map((x) => {
      const u = `http://127.0.0.1:${web}/api/${x.name}`;
      return `r=$(curl -s -m 5 -X POST -H 'content-type: application/json' -d '{"${x.fields[0].key}":"Flisk check"}' ${u}); id=$(echo "$r" | sed -n 's/.*"id":\\([0-9]*\\).*/\\1/p'); n=$(curl -s -m 5 ${u} | grep -o 'Flisk check' | wc -l | tr -d ' '); d=$(curl -s -m 5 -X DELETE -o /dev/null -w '%{http_code}' ${u}/\${id:-0}); echo "${x.name} add=\${id:+201} read=$n delete=$d"`;
    })
    .join('; ') + `; echo "summary=$(curl -s -m 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:${web}/api/summary)"`;

export const partPassed = (line) => /add=201 read=[1-9]\d* delete=200/.test(line);

// Makes, starts and checks the app on the computer. Returns { summary, web, ok } for the model, or { error }.
export async function makeSystem({ computer, podId, spec, emit = () => {}, polls = 3 }) {
  const made = await computer.run(podId, scaffoldCommand(spec));
  if (made.error) return { error: made.error };
  const out = String(made.data?.stdout || '');
  const m = /ports api=(\d+) web=(\d+)/.exec(out);
  if (made.data?.exitCode !== 0 || !m) return { error: `could not make the Flisk project: ${(out || made.data?.stderr || '').slice(-600)}` };
  const ports = { api: Number(m[1]), web: Number(m[2]) };
  const files = [
    ...spec.services.map((x) => [`~/app/${x.name}/src/index.js`, serviceJs(x)]),
    ['~/app/api/src/index.js', overviewJs(spec, ports.api)],
    ['~/app/web/vite.config.ts', viteConfig(spec, ports)],
    ['~/app/web/index.html', indexHtml(spec)],
  ];
  for (const [path, content] of files) {
    const w = await computer.write(podId, path, content);
    if (w.error) return { error: `could not write ${path}: ${w.error}` };
  }
  const s = await computer.run(podId, START_COMMAND);
  if (s.error) return { error: s.error };
  if (s.data.exitCode !== 0) return { error: `could not start the app: ${(s.data.stderr || s.data.stdout || '').slice(0, 300)}` };
  emit({ type: 'system_start', title: spec.title, services: spec.services.length });
  let waited = '';
  const n = spec.services.length;
  for (let i = 0; i < polls; i++) {
    const r = await computer.run(podId, waitCommand(spec, ports.web));
    if (r.error) return { error: r.error };
    waited = r.data.stdout || '';
    if (waited.includes(`healthy=${n}/${n} web=200`)) break;
  }
  const t = await computer.run(podId, smokeCommand(spec, ports.web));
  if (t.error) return { error: t.error };
  const lines = String(t.data.stdout || '').trim().split('\n');
  const parts = lines.filter((l) => / add=/.test(l));
  const failed = spec.services.filter((x) => !partPassed(parts.find((l) => l.startsWith(`${x.name} `)) || ''));
  const table = parts.map((l) => `| ${l.split(' ')[0]} | ${partPassed(l) ? 'add, read and delete work' : l.split(' ').slice(1).join(' ')} |`).join('\n');
  const summary = [
    `The app is one Flisk project in ~/app, started with flisk up. ${waited.split('\n')[0]}`,
    `The website is on port ${ports.web}. It calls /api/<part> on its own address; each part is its own backend (~/app/<part>/src/index.js, records saved in ~/app/<part>/data.json, so they survive a restart). /api/summary counts them.`,
    `Checked through the website's port, as a visitor's clicks go (one record added, read back and deleted in every part):`,
    `| Part | Result |\n|---|---|\n${table}`,
    failed.length
      ? `${failed.length} part(s) failed: ${failed.map((x) => x.name).join(', ')}. Look at /tmp/up.log with "run" and fix it before you share.`
      : `Every part works.`,
    `To change the page, "write" ~/app/web/index.html (keep its fetch('/api/<part>') calls; the website reloads by itself). To change a part, "write" its ~/app/<part>/src/index.js (keep PORT and /health; it restarts by itself).`,
    `Then send {"share": ${ports.web}} so the user gets the live link to this website and its API.`,
  ].join('\n');
  return { summary, web: ports.web, services: spec.services.map((x) => x.name), ok: !failed.length };
}

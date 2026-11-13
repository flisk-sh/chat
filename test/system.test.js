import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanSystem, FIRST_PORT, indexHtml, makeSystem, MAX_SERVICES, overviewJs, partPassed, scaffoldCommand, serviceJs, smokeCommand, START_COMMAND, viteConfig, waitCommand } from '../src/system.js';
import { parseAction, runTask, SYSTEM } from '../src/loop.js';
import { appPage } from '../src/page.js';

const spec2 = () => cleanSystem({ title: 'Sales CRM', services: [{ name: 'contacts', does: 'people', fields: ['Name', 'Email'] }, { name: 'deals', fields: ['Title', 'Value'] }] });

// A computer that answers the way a real one does for each step of makeSystem.
function systemComputer({ smoke } = {}) {
  const calls = [];
  return {
    calls,
    start: async () => ({ data: { id: 'p1', provider: 'upstash' } }),
    stop: async () => ({ status: 200 }),
    read: async () => ({ data: { encoding: 'utf8', content: '<html></html>' } }),
    share: async () => ({ status: 501, error: 'hopx cannot give a pod a public URL through fleet yet' }),
    write: async (id, path, content) => (calls.push(['write', path, content]), { data: {} }),
    run: async (id, cmd) => {
      calls.push(['run', cmd]);
      if (cmd.includes('flisk create app')) return { data: { exitCode: 0, stdout: 'ports api=4001 web=3002\n' } };
      if (cmd.includes('exec flisk up')) return { data: { exitCode: 0, stdout: 'started' } };
      if (cmd.includes('healthy=')) return { data: { exitCode: 0, stdout: 'healthy=2/2 web=200\n' } };
      if (cmd.includes("-name 'vite.config.*'")) return { data: { exitCode: 0, stdout: 'port=200' } };
      if (cmd.includes('Flisk check')) return { data: { exitCode: 0, stdout: smoke ?? 'contacts add=201 read=1 delete=200\ndeals add=201 read=1 delete=200\nsummary=200' } };
      return { data: { exitCode: 0, stdout: 'ok' } };
    },
  };
}

describe('a bigger app is one Flisk project in ~/app', () => {
  test('names are cleaned, deduplicated and capped, never a folder the project already uses; each part gets fields and a port', () => {
    const s = cleanSystem({ title: 'Back office', services: ['Orders', { name: 'stock', does: 'what we have', fields: ['SKU', 'Count', 'sku', 'id', ''] }, 'orders', 'web', 'api', '../etc', { name: 'Billing & Tax' }] });
    expect(s.services.map((x) => x.name)).toEqual(['orders', 'stock', 'etc', 'billing-tax']);
    expect(s.services.map((x) => x.port)).toEqual([FIRST_PORT, FIRST_PORT + 1, FIRST_PORT + 2, FIRST_PORT + 3]);
    expect(s.services[1].fields).toEqual([{ key: 'sku', label: 'SKU' }, { key: 'count', label: 'Count' }]);
    expect(s.services[0].fields).toEqual([{ key: 'name', label: 'Name' }, { key: 'notes', label: 'Notes' }]);
    expect(cleanSystem({ services: ['one'] })).toBeNull();
    expect(cleanSystem({ services: Array.from({ length: 40 }, (_, i) => `svc-${i}`) }).services).toHaveLength(MAX_SERVICES);
  });

  test('the model asks for one with fields, and is told to share the live app, never to make a copy', () => {
    const a = parseAction('{"system": {"title": "Shop", "services": [{"name": "orders", "fields": ["Item"]}, "stock"]}}');
    expect(a.type).toBe('system');
    expect(a.spec.services[0].fields).toEqual([{ key: 'item', label: 'Item' }]);
    expect(SYSTEM).toContain('"fields"');
    expect(SYSTEM).toContain('ONE Flisk project in ~/app');
    expect(SYSTEM).toContain('{"share": <the website port it gives you>}');
    expect(SYSTEM).not.toContain('/tmp/flisk-system');
    expect(SYSTEM).not.toContain('ALWAYS finish with a page the user can click');
  });

  test('the page offers it: a System idea tab and a "system of services" answer', () => {
    const page = appPage({ login: 'ann', models: [] });
    expect(page).toContain('data-cat="system"');
    expect(page).toContain('A system of services');
  });

  test('the scaffold uses flisk create and one flisk resource per part, and every command is valid shell', () => {
    const s = spec2();
    const cmd = scaffoldCommand(s);
    expect(cmd).toContain('flisk create app --frontend vanilla --language node --yes');
    expect(cmd).toContain('flisk resource contacts --type backend --language node --local --stack app --path contacts --port 4101 --yes');
    expect(cmd).toContain('flisk resource deals --type backend --language node --local --stack app --path deals --port 4102 --yes');
    expect(START_COMMAND).toContain('npm install');
    expect(START_COMMAND).toContain('exec flisk up');
    for (const c of [cmd, START_COMMAND, waitCommand(s, 3002), smokeCommand(s, 3002)]) {
      expect(Bun.spawnSync(['sh', '-n', '-c', c]).exitCode).toBe(0);
    }
  });

  test('Vite forwards each part to its own backend (exact names, so /api/deal never catches /api/deals) and answers any host', () => {
    const v = viteConfig(spec2(), { api: 4001, web: 3002 });
    expect(v).toContain("'^/api/contacts(/|$)': to(4101)");
    expect(v).toContain("'^/api/deals(/|$)': to(4102)");
    expect(v).toContain("'/api': to(4001)");
    expect(v).toContain('host: true');
    expect(v).toContain('allowedHosts: true');
    expect(v).toContain('process.env.PORT ?? 3002');
  });

  test('the website calls the real API for every read, add and delete, keeps nothing in the browser, and its script parses', () => {
    const html = indexHtml(cleanSystem({ title: 'CRM </script><b>', services: ['contacts', 'deals'] }));
    expect(html).not.toContain('localStorage');
    expect(html).toContain("fetch('/api/' + path");
    expect(html).toContain("method: 'POST'");
    expect(html).toContain("method: 'DELETE'");
    expect(html).toContain('<title>CRM &lt;/script&gt;&lt;b&gt;</title>');
    const script = html.slice(html.indexOf('<script type="module">') + 22, html.lastIndexOf('</script>'));
    expect(script).not.toContain('</script>');
    expect(() => new Function(script)).not.toThrow();
  });

  test('the generated backends really run: add, read, change and delete through a front like Vite, records survive a restart, and the shell check passes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sys-'));
    const base = 24100 + Math.floor(Math.random() * 500);
    const s = cleanSystem({ title: 'CRM', services: [{ name: 'contacts', fields: ['Name'] }, { name: 'deals', fields: ['Title'] }] });
    s.services.forEach((x, i) => (x.port = base + i));
    const apiPort = base + 10;
    const webPort = base + 11;
    const put = (name, body) => {
      mkdirSync(join(dir, name, 'src'), { recursive: true });
      writeFileSync(join(dir, name, 'package.json'), '{"type":"module"}');
      writeFileSync(join(dir, name, 'src', 'index.js'), body);
    };
    for (const x of s.services) put(x.name, serviceJs(x));
    put('api', overviewJs(s, apiPort));
    const spawn = (name) => Bun.spawn(['node', 'src/index.js'], { cwd: join(dir, name), env: { ...process.env, PORT: '' }, stdout: 'ignore', stderr: 'ignore' });
    const procs = { contacts: spawn('contacts'), deals: spawn('deals'), api: spawn('api') };
    // The website's forwarding, as viteConfig sets it up: /api/<part> to the part, the rest of /api to the overview.
    const web = Bun.serve({
      port: webPort,
      fetch: (req) => {
        const u = new URL(req.url);
        const part = s.services.find((x) => new RegExp(`^/api/${x.name}(/|$)`).test(u.pathname));
        const port = part ? part.port : apiPort;
        return fetch(`http://127.0.0.1:${port}${u.pathname}`, { method: req.method, headers: req.headers, body: req.body });
      },
    });
    const up = async (ports) => {
      for (let t = 0; t < 60; t++) {
        const ok = await Promise.all(ports.map((p) => fetch(`http://127.0.0.1:${p}/health`).then((r) => r.ok, () => false)));
        if (ok.every(Boolean)) return;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error('services did not start');
    };
    const at = (path, init) => fetch(`http://127.0.0.1:${webPort}${path}`, init);
    try {
      await up([base, base + 1, apiPort]);
      const add = await at('/api/contacts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Ada', id: 99, nested: { x: 1 } }) });
      expect(add.status).toBe(201);
      const row = await add.json();
      expect(row).toMatchObject({ id: 1, name: 'Ada' });
      expect(row.nested).toBeUndefined();
      expect((await at('/api/contacts/1', { method: 'PATCH', body: '{"name":"Ada L."}' })).status).toBe(200);
      expect((await at('/api/contacts', { method: 'POST', body: '[1]' })).status).toBe(400);
      expect((await at('/api/contacts/7', { method: 'DELETE' })).status).toBe(404);
      expect((await at('/api/deals')).status).toBe(200);
      expect(await (await at('/api/deals')).json()).toEqual([]);
      expect(await (await at('/api/summary')).json()).toEqual([{ name: 'contacts', up: true, records: 1 }, { name: 'deals', up: true, records: 0 }]);
      // A restart (the computer waking up) keeps the records: they are in contacts/data.json.
      procs.contacts.kill();
      await procs.contacts.exited;
      expect(JSON.parse(readFileSync(join(dir, 'contacts', 'data.json'), 'utf8')).rows[0].name).toBe('Ada L.');
      procs.contacts = spawn('contacts');
      await up([base]);
      expect((await (await at('/api/contacts')).json())[0]).toMatchObject({ id: 1, name: 'Ada L.' });
      // The same shell check chat runs on the computer, against these servers.
      // Async: the front above runs in this process, so a blocking spawn would starve it.
      const sh = Bun.spawn(['sh', '-c', smokeCommand(s, webPort)], { stdout: 'pipe' });
      const out = await new Response(sh.stdout).text();
      const lines = out.trim().split('\n');
      expect(lines.filter((l) => / add=/.test(l)).every(partPassed)).toBe(true);
      expect(lines.at(-1)).toBe('summary=200');
      // The check deletes what it added, so the user starts with only their own records.
      expect((await (await at('/api/deals')).json()).length).toBe(0);
      expect((await (await at('/api/contacts')).json()).length).toBe(1);
    } finally {
      web.stop(true);
      for (const p of Object.values(procs)) p.kill();
    }
  }, 30_000);

  test('makeSystem makes the project, writes every part, the overview, Vite and the page into ~/app, starts flisk, checks and says which port to share', async () => {
    const c = systemComputer();
    const events = [];
    const r = await makeSystem({ computer: c, podId: 'p', spec: spec2(), emit: (e) => events.push(e) });
    expect(r.ok).toBe(true);
    expect(r.web).toBe(3002);
    expect(c.calls.filter((x) => x[0] === 'write').map((x) => x[1])).toEqual(['~/app/contacts/src/index.js', '~/app/deals/src/index.js', '~/app/api/src/index.js', '~/app/web/vite.config.ts', '~/app/web/index.html']);
    expect(c.calls.find((x) => x[1] === '~/app/web/vite.config.ts')[2]).toContain("'/api': to(4001)");
    expect(r.summary).toContain('| contacts | add, read and delete work |');
    expect(r.summary).toContain('Every part works.');
    expect(r.summary).toContain('{"share": 3002}');
    expect(r.summary).not.toMatch(/memory only|one-file|localStorage/);
    expect(events.some((e) => e.type === 'system_start')).toBe(true);
  });

  test('a part that fails the check is named, so the model reads the log before it shares', async () => {
    const r = await makeSystem({ computer: systemComputer({ smoke: 'contacts add=201 read=1 delete=200\ndeals add= read=0 delete=404\nsummary=200' }), podId: 'p', spec: spec2(), polls: 1 });
    expect(r.ok).toBe(false);
    expect(r.summary).toContain('1 part(s) failed: deals');
    expect(r.summary).toContain('| deals | add= read=0 delete=404 |');
  });

  test('a project that cannot be made is an error with the log, not a half-made app', async () => {
    const c = systemComputer();
    c.run = async () => ({ data: { exitCode: 2, stdout: 'flisk resource deals failed:\nport 4102 is taken' } });
    const r = await makeSystem({ computer: c, podId: 'p', spec: spec2() });
    expect(r.error).toContain('port 4102 is taken');
  });

  test('in a task: a built app that is described without a link is sent back to share its website port, and a copy is refused', async () => {
    const seen = [];
    const replies = ['{"system":{"title":"CRM","services":["contacts","deals"]}}', '{"say":"2 of 2 answered"}', '{"publish":"/tmp/s/index.html"}', '{"share": 3002}', '{"say":"Built, but no live link on this provider"}'];
    const published = [];
    const r = await runTask({ task: 'build a bigger crm with flisk', model: async (m) => (seen.push(m[m.length - 1].content), { text: replies.shift() }), computer: systemComputer(), publish: async (h) => (published.push(h), { url: 'https://chat.flisk.si/s/x' }), fetchImpl: async () => new Response('ok'), emit: () => {}, maxSteps: 8 });
    expect(seen.find((m) => m.startsWith('No public link yet'))).toContain('{"share": 3002}');
    expect(seen.find((m) => m.includes('do not publish a copy'))).toContain('{"share": 3002}');
    expect(seen.find((m) => m.includes('cannot give this computer a public link'))).toContain('Do NOT make a copy');
    expect(published).toEqual([]);
    expect(r.links).toEqual([]);
    expect(r.answer).toContain('no live link');
  });
});

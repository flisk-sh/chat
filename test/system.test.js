import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanSystem, makeSystem, MAX_SERVICES, SYSTEM_PY } from '../src/system.js';
import { parseAction, SYSTEM } from '../src/loop.js';
import { appPage } from '../src/page.js';

describe('system of services', () => {
  test('names are cleaned, deduplicated and capped; fewer than two services is not a system', () => {
    const s = cleanSystem({ title: 'Back office', services: ['Orders', { name: 'stock', does: 'what we have' }, 'orders', 'web', '../etc', { name: 'Billing & Tax' }] });
    expect(s.services.map((x) => x.name)).toEqual(['orders', 'stock', 'etc', 'billing-tax']);
    expect(cleanSystem({ services: ['one'] })).toBeNull();
    expect(cleanSystem({ services: Array.from({ length: 40 }, (_, i) => `svc-${i}`) }).services).toHaveLength(MAX_SERVICES);
  });

  test('the model can ask for a system and is told how', () => {
    const a = parseAction('{"system": {"title": "Shop", "services": ["orders", "stock"]}}');
    expect(a.type).toBe('system');
    expect(a.spec.services).toHaveLength(2);
    expect(SYSTEM).toContain('"system"');
    expect(SYSTEM).toContain('ERP-style');
  });

  test('the page offers it: a System idea tab and a "system of services" answer', () => {
    const page = appPage({ login: 'ann', models: [] });
    expect(page).toContain('data-cat="system"');
    expect(page).toContain('A system of services');
  });

  test('the generated services really start, answer /health and take a POST, and the web page sees them all', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sys-'));
    const spec = cleanSystem({ title: 'Back office', services: ['orders', 'stock', 'billing'] });
    writeFileSync(join(dir, 'system.json'), JSON.stringify(spec));
    writeFileSync(join(dir, 'gen.py'), SYSTEM_PY);
    const gen = Bun.spawnSync(['python3', '-I', 'gen.py'], { cwd: dir });
    expect(gen.exitCode).toBe(0);
    const cfg = JSON.parse(readFileSync(join(dir, 'web', 'service.json'), 'utf8'));
    expect(cfg.dependsOn).toEqual(['orders', 'stock', 'billing']);
    expect(JSON.parse(readFileSync(join(dir, 'orders', 'service.json'), 'utf8')).port).toBe(4101);
    // Different ports from the real ones so a developer's machine does not clash.
    const base = 24100 + Math.floor(Math.random() * 500);
    const procs = ['orders', 'stock', 'billing'].map((n, i) => Bun.spawn(['node', 'server.js'], { cwd: join(dir, n), env: { ...process.env, PORT: String(base + i) }, stdout: 'ignore', stderr: 'ignore' }));
    try {
      for (let t = 0; t < 40; t++) {
        const up = await Promise.all([0, 1, 2].map((i) => fetch(`http://127.0.0.1:${base + i}/health`).then((r) => r.ok, () => false)));
        if (up.every(Boolean)) break;
        await new Promise((r) => setTimeout(r, 150));
      }
      for (let i = 0; i < 3; i++) {
        const h = await (await fetch(`http://127.0.0.1:${base + i}/health`)).json();
        expect(h.ok).toBe(true);
      }
      const name = 'orders';
      const post = await fetch(`http://127.0.0.1:${base}/api/${name}`, { method: 'POST', body: JSON.stringify({ item: 'tea' }) });
      expect(post.status).toBe(201);
      const list = await (await fetch(`http://127.0.0.1:${base}/api/${name}`)).json();
      expect(list).toEqual([{ id: 1, item: 'tea' }]);
      expect((await fetch(`http://127.0.0.1:${base}/api/stock`)).status).toBe(404);
    } finally {
      for (const p of procs) p.kill();
    }
  });

  test('makeSystem writes the generator, starts flisk, waits, smoke-tests and reports what answered', async () => {
    const calls = [];
    const computer = {
      write: async (id, path, content) => (calls.push(['write', path]), { data: {} }),
      run: async (id, cmd) => {
        calls.push(['run', cmd.slice(0, 24)]);
        if (cmd.includes('nohup')) return { data: { exitCode: 0, stdout: 'started' } };
        if (cmd.includes('healthy=')) return { data: { exitCode: 0, stdout: 'healthy=2/2\nweb ready' } };
        if (cmd.includes('smoke test')) return { data: { exitCode: 0, stdout: "'orders' health={\"ok\":true} post=201\n'stock' health={\"ok\":true} post=201\nweb={\"ok\":true}" } };
        return { data: { exitCode: 0, stdout: '' } };
      },
    };
    const r = await makeSystem({ computer, podId: 'p', spec: cleanSystem({ services: ['orders', 'stock'] }) });
    expect(r.ok).toBe(true);
    expect(r.summary).toContain('healthy=2/2');
    expect(r.summary).toContain('post=201');
    expect(r.summary).toContain('in memory only');
    expect(calls.filter((c) => c[0] === 'write').map((c) => c[1])).toEqual(['/tmp/flisk-system/gen.py', '/tmp/flisk-system/system.json']);
  });

  test('a part that does not answer is reported so the model checks the log before it says it works', async () => {
    const computer = {
      write: async () => ({ data: {} }),
      run: async (id, cmd) => ({ data: { exitCode: 0, stdout: cmd.includes('smoke test') ? "'orders' health=DOWN post=000\nweb=DOWN" : cmd.includes('healthy=') ? 'healthy=0/2' : 'started' } }),
    };
    const r = await makeSystem({ computer, podId: 'p', spec: cleanSystem({ services: ['orders', 'stock'] }), polls: 1 });
    expect(r.ok).toBe(false);
    expect(r.summary).toContain('/tmp/up.log');
  });
});

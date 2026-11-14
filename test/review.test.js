import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { handle } from '../src/index.js';
import { loadSettings, saveSettings } from '../src/keys.js';
import { alertReview, reportLostReviews, cleanComments, diffLines, parseReview, verifySignature } from '../src/review.js';
import { makeSession } from '../src/session.js';
import { fakeD1 } from './d1.js';

const SCHEMA = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const DIFF = 'diff --git a/src/a.js b/src/a.js\n--- a/src/a.js\n+++ b/src/a.js\n@@ -1,3 +1,4 @@\n const a = 1;\n-const b = 2;\n+const b = 3;\n+const c = eval(x);\n end\n';

const pem = async () => {
  const k = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign']);
  return `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('pkcs8', k.privateKey))))}\n-----END PRIVATE KEY-----`;
};
const sign = async (secret, body) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return 'sha256=' + [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))].map((b) => b.toString(16).padStart(2, '0')).join('');
};
const event = (over = {}) => ({ action: 'created', installation: { id: 7 }, repository: { full_name: 'o/r' }, issue: { number: 5, state: 'open', pull_request: {} }, comment: { id: 99, body: '@flisk-chat review pr', user: { login: 'odykyi', type: 'User' } }, ...over });

async function setup({ permission = 'write', model = { summary: 'Adds eval.', verdict: 'request_changes', comments: [{ path: 'src/a.js', line: 3, body: 'eval is unsafe', suggestion: 'const c = parse(x);' }, { path: 'src/a.js', line: 99, body: 'not in the diff' }] }, reject = [], diff = DIFF, ...extra } = {}) {
  const env = { DB: fakeD1(SCHEMA), PUBLIC_ORIGIN: 'https://chat.test', SESSION_SECRET: 's', KEY_SECRET: 'k'.repeat(32), INFERENCE_KEY: 'ik', INFERENCE_URL: 'https://inf.test/v1/chat/completions', GITHUB_WEBHOOK_SECRET: 'whs', GITHUB_APP_ID: '123', GITHUB_APP_KEY: await pem(), FLEET_URL: 'https://fleet.test', FLEET_SERVICE_SECRET: 'x'.repeat(40), ...extra };
  const calls = [];
  const stopped = [];
  const fleetDown = extra.fleetDown;
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ host: u.host, path: u.pathname, method: init.method || 'GET', body, auth: init.headers?.authorization });
    if (u.host === 'fleet.test') {
      if (u.pathname === '/v1/pods' && init.method === 'POST') return fleetDown ? Response.json({ error: 'connect a computer first' }, { status: 409 }) : Response.json({ id: 'pod_x', provider: 'daytona' }, { status: 201 });
      if (init.method === 'DELETE') return stopped.length ? Response.json({ error: 'gone' }, { status: 410 }) : (stopped.push(u.pathname), Response.json({ ok: true }));
      return Response.json({ ok: true, stdout: '', exitCode: 0 });
    }
    if (u.host !== 'api.github.com') return Response.json({ choices: [{ message: { content: JSON.stringify(model) } }] });
    if (u.pathname === '/app/installations/7/access_tokens') return Response.json({ token: 'inst-token' }, { status: 201 });
    if (u.pathname.endsWith('/permission')) return Response.json({ permission });
    if (u.pathname === '/repos/o/r/pulls/5' && init.method === 'GET') return new Response(diff);
    if (u.pathname.endsWith('/reviews') && reject.includes(body.event)) return Response.json({ message: 'nope' }, { status: 422 });
    return Response.json({ ok: true }, { status: 201 });
  };
  const send = (ev, { secret = 'whs', kind = 'issue_comment' } = {}) => {
    const body = JSON.stringify(ev);
    return sign(secret, body).then((sig) => handle(new Request('https://chat.test/github/webhook', { method: 'POST', body, headers: { 'x-hub-signature-256': sig, 'x-github-event': kind } }), env, { fetchImpl }));
  };
  return { env, calls, send, stopped, fetchImpl };
}
const reviewOf = (calls) => calls.find((c) => c.path.endsWith('/reviews'))?.body;

describe('diff and answer parsing', () => {
  test('only lines of the new file shown in the diff can carry a comment', () => {
    const f = diffLines(DIFF);
    expect([...f['src/a.js']]).toEqual([1, 2, 3, 4]);
    const c = cleanComments([{ path: 'src/a.js', line: 3, body: 'x', suggestion: 'y' }, { path: 'src/a.js', line: 50, body: 'z' }, { path: 'nope.js', line: 1, body: 'z' }], f);
    expect(c).toHaveLength(1);
    expect(c[0].body).toContain('```suggestion\ny\n```');
  });
  test('a fenced or chatty answer still parses, and nonsense does not', () => {
    expect(parseReview('```json\n{"summary":"ok","verdict":"approve"}\n```').verdict).toBe('approve');
    expect(parseReview('Here: {"summary":"ok","verdict":"weird"}').verdict).toBe('comment');
    expect(parseReview('no json')).toBeNull();
  });
});

describe('@flisk-chat review webhook', () => {
  test('a write-access comment gets one review with a summary, a valid inline comment and the verdict', async () => {
    const w = await setup();
    const res = await w.send(event());
    expect(res.status).toBe(202);
    const r = reviewOf(w.calls);
    expect(r.event).toBe('REQUEST_CHANGES');
    expect(r.body).toContain('Adds eval.');
    expect(r.body).toContain('Flisk Wolf (free)');
    expect(r.comments).toHaveLength(1);
    expect(r.comments[0]).toMatchObject({ path: 'src/a.js', line: 3, side: 'RIGHT' });
    expect(w.calls.filter((c) => c.host === 'inf.test')[0].auth).toBe('Bearer ik');
    expect(w.calls.some((c) => c.path.endsWith('/reactions'))).toBe(true);
    expect(w.calls.length).toBeLessThanOrEqual(8);
  });
  test('a bad signature, a bot, a non-PR, another event and a comment without the word review do nothing', async () => {
    const w = await setup();
    expect((await w.send(event(), { secret: 'wrong' })).status).toBe(401);
    for (const ev of [event({ comment: { id: 1, body: '@flisk-chat review', user: { login: 'x[bot]', type: 'Bot' } } }), event({ issue: { number: 5, state: 'open' } }), event({ comment: { id: 1, body: 'thanks @flisk-chat', user: { login: 'a', type: 'User' } } })]) await w.send(ev);
    await w.send(event(), { kind: 'push' });
    expect(w.calls).toHaveLength(0);
  });
  test('no write access: ignored, the model is never called', async () => {
    const w = await setup({ permission: 'read' });
    await w.send(event());
    expect(w.calls.some((c) => c.host === 'inf.test')).toBe(false);
    expect(reviewOf(w.calls)).toBeUndefined();
  });
  test('a big diff is cut for the free model and the review says so', async () => {
    const w = await setup({ diff: DIFF + '+' + 'x'.repeat(30_000) + '\n', model: { summary: 'cut ok', verdict: 'comment', comments: [] } });
    await w.send(event());
    const sent = w.calls.find((c) => c.host === 'inf.test').body.messages[1].content;
    expect(sent.length).toBeLessThan(15_000);
    expect(sent).toContain('cut here');
    expect(reviewOf(w.calls).body).toContain('first 14 KB');
  });
  test('an approval or inline comment GitHub refuses falls back to a plain comment review', async () => {
    const w = await setup({ model: { summary: 'fine', verdict: 'approve', comments: [] }, reject: ['APPROVE'] });
    await w.send(event());
    const reviews = w.calls.filter((c) => c.path.endsWith('/reviews'));
    expect(reviews.map((r) => r.body.event)).toEqual(['APPROVE', 'COMMENT']);
  });
  test('a person who saved their own key gets reviewed with that model and that key', async () => {
    const w = await setup();
    await saveSettings(w.env, 'odykyi', { ai: 'openrouter', model: 'anthropic/claude-sonnet-5.5', key: 'sk-or-secret-123' });
    await w.send(event());
    const m = w.calls.find((c) => c.host === 'openrouter.ai');
    expect(m.auth).toBe('Bearer sk-or-secret-123');
    expect(m.body.model).toBe('anthropic/claude-sonnet-5.5');
    expect(reviewOf(w.calls).body).toContain('anthropic/claude-sonnet-5.5');
  });
  test('over the free daily limit: one polite comment, no model call', async () => {
    const w = await setup();
    const store = new Map();
    const LIMIT_CACHE = { match: async (u) => (store.has(u) ? new Response(store.get(u)) : undefined), put: async (u, r) => store.set(u, await r.text()) };
    w.env.LIMIT_CACHE = LIMIT_CACHE;
    for (let i = 0; i < 10; i++) await w.send(event());
    w.calls.length = 0;
    await w.send(event());
    expect(w.calls.some((c) => c.host === 'inf.test')).toBe(false);
    expect(w.calls.find((c) => c.path.endsWith('/comments')).body.body).toContain('free reviews');
  });
});

describe('review run (sandbox)', () => {
  test('starts a computer for the commenter, writes the script with a signed callback, and does not wait for the tests', async () => {
    const w = await setup();
    await w.send(event({ comment: { id: 99, body: '@flisk-chat review run', user: { login: 'odykyi', type: 'User' } } }));
    const fleet = w.calls.filter((c) => c.host === 'fleet.test');
    expect(fleet.map((c) => `${c.method} ${c.path}`)).toEqual(['POST /v1/pods', 'PUT /v1/pods/pod_x/files', 'POST /v1/pods/pod_x/run']);
    const script = fleet[1].body.content;
    expect(script).toContain("git clone -q --depth 1 'https://github.com/o/r.git'");
    expect(script).toContain("'pull/5/head'");
    expect(script).toMatch(/run-result\?inst=7&repo=o%2Fr&pr=5&pod=pod_x&login=odykyi&sig=[0-9a-f]{64}/);
    expect(reviewOf(w.calls).body).toContain('Adds eval.');
  });
  test('a private repo gets a clone token scoped to that repo, read-only', async () => {
    const w = await setup();
    await w.send(event({ repository: { full_name: 'o/r', private: true }, comment: { id: 99, body: '@flisk-chat review run', user: { login: 'odykyi', type: 'User' } } }));
    const scoped = w.calls.filter((c) => c.path === '/app/installations/7/access_tokens' && c.body);
    expect(scoped[0].body).toEqual({ repositories: ['r'], permissions: { contents: 'read' } });
  });
  test('no computer connected: one clear comment, the diff review is still posted', async () => {
    const w = await setup({ fleetDown: true });
    await w.send(event({ comment: { id: 99, body: '@flisk-chat review run', user: { login: 'odykyi', type: 'User' } } }));
    expect(w.calls.find((c) => c.path.endsWith('/comments')).body.body).toContain('could not start a computer');
    expect(reviewOf(w.calls)).toBeDefined();
  });
  test('plain review does not start a computer', async () => {
    const w = await setup();
    await w.send(event());
    expect(w.calls.some((c) => c.host === 'fleet.test')).toBe(false);
  });
  test('the callback posts the output once, stops the computer, and rejects a bad signature', async () => {
    const w = await setup();
    const { runSig } = await import('../src/run.js');
    const sig = await runSig(w.env.GITHUB_WEBHOOK_SECRET, ['7', 'o/r', '5', 'pod_x', 'odykyi']);
    const url = (sg) => `https://chat.test/github/run-result?inst=7&repo=o%2Fr&pr=5&pod=pod_x&login=odykyi&sig=${sg}`;
    const call = (sg, text) => handle(new Request(url(sg), { method: 'POST', body: text }), w.env, { fetchImpl: w.fetchImpl });
    expect((await call('0'.repeat(64), 'x')).status).toBe(401);
    expect((await call(sig, '$ npm test\n3 pass\n[exit 0]')).status).toBe(200);
    const posted = w.calls.find((c) => c.path === '/repos/o/r/issues/5/comments');
    expect(posted.body.body).toContain('3 pass');
    expect(w.stopped).toHaveLength(1);
    const again = await call(sig, 'replay');
    expect(await again.text()).toBe('already done');
    expect(w.calls.filter((c) => c.path === '/repos/o/r/issues/5/comments')).toHaveLength(1);
  });
});

describe('automatic reviews', () => {
  const prEvent = (over = {}) => ({ action: 'opened', installation: { id: 7 }, repository: { full_name: 'o/r' }, pull_request: { number: 5, draft: false }, sender: { login: 'someone', type: 'User' }, ...over });
  test('auto on stores the repo, a new PR is then reviewed for that person, auto off stops it', async () => {
    const w = await setup();
    await w.send(event({ comment: { id: 99, body: '@flisk-chat auto on', user: { login: 'odykyi', type: 'User' } } }));
    expect(w.env.DB.raw.query('SELECT repo, login FROM auto_repos').all()).toEqual([{ repo: 'o/r', login: 'odykyi' }]);
    expect(w.calls.find((c) => c.path.endsWith('/comments')).body.body).toContain('Automatic reviews are on');
    w.calls.length = 0;
    await w.send(prEvent(), { kind: 'pull_request' });
    expect(reviewOf(w.calls).body).toContain('Adds eval.');
    expect(w.calls.some((c) => c.path.endsWith('/permission') || c.path.endsWith('/reactions'))).toBe(false);
    await w.send(event({ comment: { id: 100, body: '@flisk-chat auto off', user: { login: 'odykyi', type: 'User' } } }));
    w.calls.length = 0;
    await w.send(prEvent(), { kind: 'pull_request' });
    expect(w.calls).toHaveLength(0);
  });
  test('without auto on, drafts, bots, closed and edited PRs do nothing, and a stranger cannot switch it on', async () => {
    const w = await setup({ permission: 'read' });
    await w.send(prEvent(), { kind: 'pull_request' });
    await w.send(event({ comment: { id: 1, body: '@flisk-chat auto on', user: { login: 'stranger', type: 'User' } } }));
    expect(w.env.DB.raw.query('SELECT * FROM auto_repos').all()).toEqual([]);
    const w2 = await setup();
    w2.env.DB.raw.query("INSERT INTO auto_repos VALUES ('o/r', 'odykyi', 'x')").run();
    w2.calls.length = 0;
    for (const e of [prEvent({ pull_request: { number: 5, draft: true } }), prEvent({ sender: { login: 'dependabot[bot]', type: 'Bot' } }), prEvent({ action: 'edited' })]) await w2.send(e, { kind: 'pull_request' });
    expect(w2.calls).toHaveLength(0);
  });
});

describe('saved key', () => {
  test('it is encrypted in D1, the page never shows it, and delete removes it', async () => {
    const { env } = await setup();
    await saveSettings(env, 'odykyi', { ai: 'openai', model: 'gpt-x', key: 'sk-plain-secret-9' });
    const raw = env.DB.raw.query('SELECT * FROM ai_settings').all();
    expect(JSON.stringify(raw)).not.toContain('sk-plain-secret-9');
    expect((await loadSettings(env, 'odykyi', { withKey: true })).key).toBe('sk-plain-secret-9');
    expect(await loadSettings({ ...env, KEY_SECRET: 'z'.repeat(32) }, 'odykyi', { withKey: true })).toBeNull();
    const cookie = (await makeSession(env, 'odykyi')).split(';')[0];
    const page = await handle(new Request('https://chat.test/reviews', { headers: { cookie } }), env);
    const text = await page.text();
    expect(text).toContain('gpt-x');
    for (const href of ['https://github.com/apps/flisk-chat/installations/new', 'https://openrouter.ai/keys', 'https://console.anthropic.com/settings/keys', 'https://platform.openai.com/api-keys', 'href="/"', 'class="steps"', 'data-copy="@flisk-chat review run"', '@flisk-chat auto on']) expect(text).toContain(href);
    expect(text).not.toContain('sk-plain-secret-9');
    const del = await handle(new Request('https://chat.test/reviews/delete', { method: 'POST', headers: { cookie, origin: 'https://chat.test' } }), env);
    expect(del.status).toBe(303);
    expect(await loadSettings(env, 'odykyi')).toBeNull();
  });
  test('a task that stops at the connect-a-computer step is still saved in the chat history', async () => {
    const { env } = await setup();
    const cookie = (await makeSession(env, 'odykyi')).split(';')[0];
    const html = await (await handle(new Request('https://chat.test/', { headers: { cookie } }), env)).text();
    expect(html).toContain('Connect one of your sandbox accounts below, once.\');saveChat();');
  });
  test('HEAD gets the same status as GET, without a body', async () => {
    const { env } = await setup();
    const get = await handle(new Request('https://chat.test/'), env);
    const head = await handle(new Request('https://chat.test/', { method: 'HEAD' }), env);
    expect(head.status).toBe(get.status);
    expect(await head.text()).toBe('');
    expect((await handle(new Request('https://chat.test/nope', { method: 'HEAD' }), env)).status).toBe(404);
  });
  test('a bad model name shows the error on the settings page and keeps what was typed; unknown flash text is ignored', async () => {
    const { env } = await setup();
    const cookie = (await makeSession(env, 'odykyi')).split(';')[0];
    const f = new FormData();
    f.set('ai', 'anthropic'); f.set('model', 'bad model!'); f.set('key', 'sk-12345678');
    const res = await handle(new Request('https://chat.test/reviews/save', { method: 'POST', body: f, headers: { cookie, origin: 'https://chat.test' } }), env);
    const text = await res.text();
    expect(res.status).toBe(400);
    expect(text).toContain('Not saved: the model name may only use');
    expect(text).toContain('value="bad model!"');
    expect(text).toContain('<option value="anthropic" selected>');
    const spoof = await (await handle(new Request('https://chat.test/reviews?ok=%3Cb%3Ex%3C%2Fb%3E', { headers: { cookie } }), env)).text();
    expect(spoof).not.toContain('Deleted.');
    expect(spoof).not.toContain('<b>x</b>');
  });
  test('the chat key box can save the AI for PR reviews: JSON, same origin only, validated', async () => {
    const { env } = await setup();
    const cookie = (await makeSession(env, 'odykyi')).split(';')[0];
    const post = (body, origin = 'https://chat.test') => handle(new Request('https://chat.test/api/review-ai', { method: 'POST', body: JSON.stringify(body), headers: { cookie, origin } }), env);
    expect((await post({ ai: 'openrouter', model: 'x/y', key: 'sk-or-12345678' }, 'https://evil.test')).status).toBe(403);
    expect((await post({ ai: 'wolf', model: 'x', key: 'sk-12345678' })).status).toBe(400);
    expect((await post({ ai: 'openrouter', model: 'bad model', key: 'sk-12345678' })).status).toBe(400);
    expect((await post({ ai: 'openrouter', model: 'x/y', key: 'sk-or-12345678' })).status).toBe(200);
    expect((await loadSettings(env, 'odykyi', { withKey: true })).key).toBe('sk-or-12345678');
  });
  test('saving from another site is refused, and signing in is required', async () => {
    const { env } = await setup();
    const cookie = (await makeSession(env, 'odykyi')).split(';')[0];
    const form = () => { const f = new FormData(); f.set('ai', 'openai'); f.set('model', 'gpt-x'); f.set('key', 'sk-12345678'); return f; };
    expect((await handle(new Request('https://chat.test/reviews/save', { method: 'POST', body: form(), headers: { cookie, origin: 'https://evil.test' } }), env)).status).toBe(403);
    expect((await handle(new Request('https://chat.test/reviews/save', { method: 'POST', body: form(), headers: { origin: 'https://chat.test' } }), env)).status).toBe(303);
    const ok = await handle(new Request('https://chat.test/reviews/save', { method: 'POST', body: form(), headers: { cookie, origin: 'https://chat.test' } }), env);
    expect(ok.headers.get('location')).toBe('/reviews?ok=saved');
  });
  test('signature check rejects a wrong or missing header', async () => {
    expect(await verifySignature('s', 'b', '')).toBe(false);
    expect(await verifySignature('s', 'b', await sign('s', 'b'))).toBe(true);
    expect(await verifySignature('s', 'b2', await sign('s', 'b'))).toBe(false);
  });
});

describe('review failure alerts', () => {
  test('a failed review posts to the Discord channel with the pull request link', async () => {
    const sent = [];
    const f = async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return new Response('', { status: 204 }); };
    await alertReview({ DISCORD_ERRORS_WEBHOOK: 'https://discord.test/hook' }, { repo: 'o/r', pr: 5, sender: 'odykyi', why: 'crashed: boom' }, f);
    expect(sent).toHaveLength(1);
    expect(sent[0].body.content).toContain('crashed: boom');
    expect(sent[0].body.content).toContain('https://github.com/o/r/pull/5');
    expect(sent[0].body.allowed_mentions).toEqual({ parse: [] });
  });
  test('no webhook or no problem sends nothing and never throws', async () => {
    const f = async () => { throw new Error('should not be called'); };
    await alertReview({}, { why: 'x' }, f);
    await alertReview({ DISCORD_ERRORS_WEBHOOK: 'https://d.test' }, {}, f);
    await alertReview({ DISCORD_ERRORS_WEBHOOK: 'https://d.test' }, { why: 'x' }, async () => { throw new Error('down'); });
  });
});

describe('review analytics', () => {
  test('a posted review is one finished row with the model and verdict', async () => {
    const w = await setup();
    await w.send(event());
    const row = w.env.DB.raw.query('SELECT * FROM review_runs').get();
    expect(row).toMatchObject({ repo: 'o/r', pr: 5, sender: 'odykyi', auto: 0, status: 'posted', ai: 'Flisk Wolf (free)', verdict: 'request_changes', error: null });
    expect(row.finished).toBeTruthy();
  });

  test('a diff GitHub will not give is a failed row, a comment on the PR and a Discord alert', async () => {
    const w = await setup({ DISCORD_ERRORS_WEBHOOK: 'https://discord.test/hook' });
    const orig = w.env.DB; // keep
    const f = w.fetchImpl;
    const fetchImpl = async (url, init = {}) => (new URL(url).pathname === '/repos/o/r/pulls/5' && (init.method || 'GET') === 'GET' ? new Response('gone', { status: 502 }) : f(url, init));
    const body = JSON.stringify(event());
    const sig = await sign('whs', body);
    await handle(new Request('https://chat.test/github/webhook', { method: 'POST', body, headers: { 'x-hub-signature-256': sig, 'x-github-event': 'issue_comment' } }), w.env, { fetchImpl });
    expect(orig.raw.query('SELECT status, error FROM review_runs').get()).toEqual({ status: 'failed', error: 'diff 502' });
    expect(w.calls.some((c) => c.path === '/repos/o/r/issues/5/comments' && c.body.body.includes('did not give the diff'))).toBe(true);
    expect(w.calls.some((c) => c.host === 'discord.test' && c.body.content.includes('diff 502'))).toBe(true);
  });

  test('a review the Worker stopped is reported once by the hourly check', async () => {
    const DB = fakeD1(SCHEMA);
    const old = new Date(Date.now() - 30 * 60_000).toISOString();
    DB.raw.query("INSERT INTO review_runs (created, repo, pr, sender, auto, status) VALUES (?, 'flisk-sh/flisk', 4182, 'odykyi', 0, 'started')").run(old);
    DB.raw.query("INSERT INTO review_runs (created, repo, pr, sender, auto, status) VALUES (?, 'o/r', 1, 'x', 0, 'started')").run(new Date().toISOString());
    const sent = [];
    const f = async (url, init) => { sent.push(JSON.parse(init.body).content); return new Response('', { status: 204 }); };
    const env = { DB, DISCORD_ERRORS_WEBHOOK: 'https://discord.test/hook' };
    expect(await reportLostReviews(env, f)).toEqual({ lost: 1 });
    expect(await reportLostReviews(env, f)).toEqual({ lost: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('https://github.com/flisk-sh/flisk/pull/4182');
    expect(sent[0]).toContain('never finished');
  });
});

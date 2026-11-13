import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { handle } from '../src/index.js';
import { loadSettings, saveSettings } from '../src/keys.js';
import { cleanComments, diffLines, parseReview, verifySignature } from '../src/review.js';
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
  const env = { DB: fakeD1(SCHEMA), PUBLIC_ORIGIN: 'https://chat.test', SESSION_SECRET: 's', KEY_SECRET: 'k'.repeat(32), INFERENCE_KEY: 'ik', INFERENCE_URL: 'https://inf.test/v1/chat/completions', GITHUB_WEBHOOK_SECRET: 'whs', GITHUB_APP_ID: '123', GITHUB_APP_KEY: await pem(), ...extra };
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ host: u.host, path: u.pathname, method: init.method || 'GET', body, auth: init.headers?.authorization });
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
  return { env, calls, send };
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
    for (const href of ['https://github.com/apps/flisk-chat/installations/new', 'https://openrouter.ai/keys', 'https://console.anthropic.com/settings/keys', 'https://platform.openai.com/api-keys', 'href="/"', 'class="howto"']) expect(text).toContain(href);
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

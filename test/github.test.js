import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { handle } from '../src/index.js';
import { runTask } from '../src/loop.js';
import { canPush, githubNote, loadGithubToken, scrub } from '../src/github.js';
import { fakeD1 } from './d1.js';

const SCHEMA = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const ORIGIN = 'https://chat.test';
const TOKEN = 'gho_secretsecretsecret123';

test('sign-in asks GitHub for public_repo and keeps the token sealed, sign-out forgets it', async () => {
  const env = { DB: fakeD1(SCHEMA), PUBLIC_ORIGIN: ORIGIN, SESSION_SECRET: 's', KEY_SECRET: 'k', GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'sec' };
  const start = await handle(new Request(`${ORIGIN}/auth/start`), env, {});
  expect(new URL(start.headers.get('location')).searchParams.get('scope')).toBe('public_repo');
  const gh = async (u) => (String(u).includes('access_token') ? Response.json({ access_token: TOKEN, scope: 'public_repo' }) : Response.json({ login: 'ann' }));
  const cb = await handle(new Request(`${ORIGIN}/auth/callback?code=c&state=st`, { headers: { cookie: 'chat_state=st' } }), env, { fetchImpl: gh });
  expect(cb.status).toBe(303);
  const row = await env.DB.prepare('SELECT token_enc FROM github_tokens WHERE login = ?').bind('ann').first();
  expect(row.token_enc).not.toContain(TOKEN);
  expect(await loadGithubToken(env, 'ann')).toEqual({ token: TOKEN, scope: 'public_repo' });
  const sess = cb.headers.getSetCookie().find((c) => c.startsWith('chat_sess=')).split(';')[0];
  // Signed in already: /auth/start goes home, unless ?again=1 asks GitHub once more.
  expect((await handle(new Request(`${ORIGIN}/auth/start`, { headers: { cookie: sess } }), env, {})).headers.get('location')).toBe('/');
  expect((await handle(new Request(`${ORIGIN}/auth/start?again=1`, { headers: { cookie: sess } }), env, {})).headers.get('location')).toContain('github.com/login/oauth/authorize');
  await handle(new Request(`${ORIGIN}/auth/signout`, { headers: { cookie: sess } }), env, {});
  expect(await loadGithubToken(env, 'ann')).toBeNull();
});

test('the model is told what GitHub can do in each case', () => {
  expect(githubNote({ login: 'ann', token: 't', scope: 'public_repo' }, ORIGIN)).toMatch(/gh pr create/);
  expect(githubNote({ login: 'ann' }, ORIGIN)).toContain(`${ORIGIN}/auth/start?again=1`);
  expect(githubNote(null, ORIGIN)).toMatch(/not signed in with GitHub/);
  expect(canPush('read:user')).toBe(false);
  expect(canPush('public_repo,read:user')).toBe(true);
  expect(scrub(`x ${TOKEN} y`, TOKEN)).toBe('x *** y');
});

test('a task signs gh in on the computer with a file, never in a command, and scrubs the token from outputs', async () => {
  const calls = [];
  const computer = {
    start: async () => ({ data: { id: 'p1', provider: 'daytona' } }),
    write: async (id, path, content) => (calls.push({ write: path, content }), { data: {} }),
    run: async (id, command) => (calls.push({ run: command }), { data: { exitCode: 0, stdout: command.includes('gh api user') ? 'GH_OK\n' : `leak ${TOKEN}\n`, stderr: '' } }),
    read: async () => ({ data: { encoding: 'utf8', content: '' } }),
    stop: async () => ({ status: 200 }),
  };
  const seen = [];
  const replies = ['{"run": "gh auth token"}', '{"say": "done"}'];
  const model = async (messages) => (seen.push(messages), { text: replies.shift() });
  const events = [];
  await runTask({ task: 'open a PR', model, computer, github: { login: 'ann', token: TOKEN, scope: 'public_repo' }, emit: (e) => events.push(e), wait: async () => {} });
  expect(seen[0][0].content).toMatch(/@ann is signed in on the computer/);
  expect(calls[0]).toEqual({ write: '/tmp/.flisk-gh-token', content: TOKEN });
  expect(calls.filter((c) => c.run).every((c) => !c.run.includes(TOKEN))).toBe(true);
  expect(events.find((e) => e.type === 'github')?.ok).toBe(true);
  expect(JSON.stringify(events)).not.toContain(TOKEN);
  expect(JSON.stringify(seen)).not.toContain(TOKEN);
});

test('without a token the computer gets no GitHub setup', async () => {
  const calls = [];
  const computer = { start: async () => ({ data: { id: 'p1', provider: 'x' } }), write: async (i, p) => (calls.push(p), { data: {} }), run: async () => ({ data: { exitCode: 0, stdout: '', stderr: '' } }), stop: async () => ({ status: 200 }) };
  const replies = ['{"run": "ls"}', '{"say": "ok"}'];
  await runTask({ task: 'x', model: async () => ({ text: replies.shift() }), computer, github: { login: 'ann' }, wait: async () => {} });
  expect(calls).toEqual([]);
});

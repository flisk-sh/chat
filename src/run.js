// "@flisk-chat review run": a computer of the person who asked checks out the PR and runs its install, lint, typecheck and
// tests in the background, then sends the output to /github/run-result, which posts it and stops the computer.
import { fleetClient } from './fleet.js';
import { gh, installToken } from './review.js';

const enc = new TextEncoder();
const hexOf = (u) => [...new Uint8Array(u)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sq = (v) => `'${String(v).replace(/'/g, "'\\''")}'`;

export const runSig = async (secret, parts) => {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hexOf(await crypto.subtle.sign('HMAC', key, enc.encode(parts.join('|'))));
};

export function runScript({ pr, cloneUrl, callback }) {
  return `#!/bin/sh
cd /tmp && rm -rf w out.txt
note() { printf '\\n$ %s\\n' "$*" >> /tmp/out.txt; }
step() { note "$*"; timeout 600 sh -c "$*" >> /tmp/out.txt 2>&1; echo "[exit $?]" >> /tmp/out.txt; }
if git clone -q --depth 1 ${sq(cloneUrl)} w >> /tmp/out.txt 2>&1 && cd w && git fetch -q --depth 1 origin ${sq(`pull/${pr}/head`)} >> /tmp/out.txt 2>&1 && git checkout -q FETCH_HEAD >> /tmp/out.txt 2>&1; then
  if [ -f package.json ]; then
    if [ -f bun.lock ] || [ -f bun.lockb ]; then R=bun; step "bun install"; else R=npm; if [ -f package-lock.json ]; then step "npm ci"; else step "npm install"; fi; fi
    for s in lint typecheck test; do grep -q "\\"$s\\"" package.json && step "$R run $s"; done
  elif [ -f pyproject.toml ] || [ -f requirements.txt ]; then
    [ -f requirements.txt ] && step "pip install -q -r requirements.txt"
    step "python -m pytest -q"
  elif [ -f go.mod ]; then step "go test ./..."
  elif [ -f Cargo.toml ]; then step "cargo test"
  else echo "no package.json, pyproject, go.mod or Cargo.toml: nothing to run" >> /tmp/out.txt; fi
else echo "could not check out the pull request" >> /tmp/out.txt; fi
tail -c 6000 /tmp/out.txt | curl -s -X POST --data-binary @- ${sq(callback)} >/dev/null
`;
}

export async function startRun(env, { repo, pr, installationId, sender, isPrivate, fetchImpl, say }) {
  const fleet = fleetClient(env, sender, fetchImpl);
  const pod = await fleet.start([]);
  if (pod.error || !pod.data?.id) {
    await say(`@${sender} I could not start a computer for the test run: ${pod.error || 'no answer'}. Connect one in chat (${env.PUBLIC_ORIGIN}) and comment \`@flisk-chat review run\` again.`);
    return { error: 'no pod' };
  }
  const id = pod.data.id;
  const scoped = isPrivate ? await installToken(env, installationId, { repositories: [repo.split('/')[1]], permissions: { contents: 'read' } }, fetchImpl) : null;
  if (isPrivate && !scoped) {
    await fleet.stop(id);
    return { error: 'no clone token' };
  }
  const sig = await runSig(env.GITHUB_WEBHOOK_SECRET, [installationId, repo, pr, id, sender]);
  const q = new URLSearchParams({ inst: String(installationId), repo, pr: String(pr), pod: id, login: sender, sig });
  const cloneUrl = scoped ? `https://x-access-token:${scoped}@github.com/${repo}.git` : `https://github.com/${repo}.git`;
  const script = runScript({ pr, cloneUrl, callback: `${env.PUBLIC_ORIGIN}/github/run-result?${q}` });
  const w = await fleet.write(id, '/tmp/run.sh', script);
  const r = w.error ? w : await fleet.run(id, 'nohup sh /tmp/run.sh >/dev/null 2>&1 &');
  if (r.error) {
    await fleet.stop(id);
    await say(`@${sender} the test run could not start: ${r.error}`);
    return { error: r.error };
  }
  return { started: id };
}

// The computer calls this when it is done. The signature proves chat started that run; stopping the pod makes it one-shot.
export async function runResult(request, env, { fetchImpl = fetch } = {}) {
  const u = new URL(request.url);
  const [inst, repo, pr, pod, login, sig] = ['inst', 'repo', 'pr', 'pod', 'login', 'sig'].map((k) => u.searchParams.get(k) || '');
  if (!/^\d+$/.test(inst) || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !/^\d+$/.test(pr) || !pod || !login) return new Response('bad request', { status: 400 });
  const want = await runSig(env.GITHUB_WEBHOOK_SECRET, [inst, repo, pr, pod, login]);
  let diff = want.length ^ sig.length;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ (sig.charCodeAt(i) || 0);
  if (diff !== 0) return new Response('bad signature', { status: 401 });
  const out = (await request.text()).slice(-6000).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/```/g, "'''");
  const stopped = await fleetClient(env, login, fetchImpl).stop(pod);
  if (stopped.error) return new Response('already done', { status: 200 });
  const token = await installToken(env, Number(inst), undefined, fetchImpl);
  if (!token) return new Response('no token', { status: 502 });
  const fence = '```';
  await gh(token, fetchImpl)(`/repos/${repo}/issues/${pr}/comments`, { method: 'POST', body: { body: `@${login} the test run finished on your computer (a checkout of this PR, the last 6 KB of output):\n\n${fence}\n${out}\n${fence}\n<sub>The computer was stopped. Output can be cut; read it before you merge.</sub>` } });
  return new Response('posted', { status: 200 });
}

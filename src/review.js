// "@flisk-chat review" in a pull request comment: a GitHub App webhook, the model reads the diff, one review is posted.
// Compact on purpose (Workers Free: 10 ms CPU, 50 subrequests): about 8 calls per review, the diff is cut to a size cap.
import { loadSettings } from './keys.js';
import { modelFrom, resolveModel } from './loop.js';

const API = 'https://api.github.com';
export const WOLF_DIFF = 14_000; // the free model answers at most 1024 tokens, so it only reads this much
export const OWN_KEY_DIFF = 120_000;
export const REVIEWS_PER_DAY = 10; // on the free model, per login
const TRIGGER = /(?:^|[\s(])@(?:flisk-chat|chat)\b[^\n]*?\breview\b/i;
const WRITE = new Set(['write', 'maintain', 'admin']);
const enc = new TextEncoder();
const b64url = (u) => btoa(String.fromCharCode(...new Uint8Array(u))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hexOf = (u) => [...new Uint8Array(u)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function verifySignature(secret, body, header) {
  if (!secret || !/^sha256=[0-9a-f]{64}$/.test(header || '')) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const want = hexOf(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
  const got = header.slice(7);
  let diff = want.length ^ got.length;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ (got.charCodeAt(i) || 0);
  return diff === 0;
}

// The App's private key must be PKCS#8 PEM (openssl pkcs8 -topk8 -nocrypt -in app.pem), the one GitHub hands out is PKCS#1.
async function appJwt(env, now = Date.now()) {
  const der = Uint8Array.from(atob(String(env.GITHUB_APP_KEY).replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const iat = Math.floor(now / 1000) - 30;
  const head = b64url(enc.encode('{"alg":"RS256","typ":"JWT"}'));
  const body = b64url(enc.encode(JSON.stringify({ iat, exp: iat + 540, iss: env.GITHUB_APP_ID })));
  return `${head}.${body}.${b64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(`${head}.${body}`)))}`;
}

function gh(token, fetchImpl) {
  return async (path, { method = 'GET', body, accept = 'application/vnd.github+json' } = {}) => {
    const res = await fetchImpl(`${API}${path}`, { method, headers: { authorization: `Bearer ${token}`, accept, 'user-agent': 'flisk-chat-review', 'x-github-api-version': '2022-11-28', ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, ok: res.ok, text: res.ok || res.status === 422 ? await res.text() : '' };
  };
}

// The lines of the new file the diff shows, per path: only these can carry an inline comment.
export function diffLines(diff) {
  const files = {};
  let cur = null;
  let n = 0;
  for (const line of diff.split('\n')) {
    const f = /^\+\+\+ b\/(.+)$/.exec(line);
    if (f) { cur = files[f[1]] = new Set(); continue; }
    if (line.startsWith('--- ')) continue;
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(line);
    if (h) { n = Number(h[1]); continue; }
    if (!cur || !n || line === '') continue;
    if (line.startsWith('-') || line.startsWith('\\')) continue;
    cur.add(n++);
  }
  return files;
}

function prompt(diff, cut) {
  return [
    { role: 'system', content: 'You review a GitHub pull request diff. Find real bugs, security problems and missing tests; skip style nits. Answer with ONE JSON object only: {"summary": "3-6 plain sentences: what changed, the risks, what to test", "verdict": "approve" | "request_changes" | "comment", "comments": [{"path": "file path from the diff", "line": <line number in the NEW file, a line shown in the diff>, "body": "the problem and why", "suggestion": "optional replacement for that one line"}]}. At most 8 comments. Use "request_changes" only for a real bug, "approve" only if you found nothing that matters.' },
    { role: 'user', content: `${diff}${cut ? '\n\n(The diff was cut here because it is too long; say so in the summary.)' : ''}` },
  ];
}

export function parseReview(text) {
  const t = String(text).replace(/^```(?:json)?\s*|\s*```$/g, '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  try {
    const v = JSON.parse(t.slice(a, b + 1));
    if (typeof v?.summary !== 'string' || !v.summary.trim()) return null;
    return { summary: v.summary.trim().slice(0, 3000), verdict: ['approve', 'request_changes'].includes(v.verdict) ? v.verdict : 'comment', comments: Array.isArray(v.comments) ? v.comments : [] };
  } catch {
    return null;
  }
}

// Keep only comments GitHub will accept, and turn a suggestion into a suggestion block.
export function cleanComments(comments, files) {
  return comments
    .map((c) => ({ path: String(c?.path || '').replace(/^b\//, ''), line: Number(c?.line), body: String(c?.body || '').trim().slice(0, 1500), suggestion: typeof c?.suggestion === 'string' ? c.suggestion.slice(0, 1500) : '' }))
    .filter((c) => c.body && files[c.path]?.has(c.line))
    .slice(0, 8)
    .map((c) => ({ path: c.path, line: c.line, side: 'RIGHT', body: c.suggestion ? `${c.body}\n\n\`\`\`suggestion\n${c.suggestion.replace(/\n+$/, '')}\n\`\`\`` : c.body }));
}

export async function reviewPullRequest(env, event, { fetchImpl = fetch, overLimit = async () => false, now = Date.now() } = {}) {
  const { repository, issue, comment, installation } = event;
  const repo = repository.full_name;
  const sender = comment.user.login;
  const token = await (async () => {
    const res = await fetchImpl(`${API}/app/installations/${installation.id}/access_tokens`, { method: 'POST', headers: { authorization: `Bearer ${await appJwt(env, now)}`, accept: 'application/vnd.github+json', 'user-agent': 'flisk-chat-review' } });
    return res.ok ? (await res.json()).token : null;
  })();
  if (!token) return { error: 'no installation token' };
  const api = gh(token, fetchImpl);
  const say = (text) => api(`/repos/${repo}/issues/${issue.number}/comments`, { method: 'POST', body: { body: text } });

  // Only people who can push may spend the budget.
  const perm = await api(`/repos/${repo}/collaborators/${encodeURIComponent(sender)}/permission`);
  if (!perm.ok || !WRITE.has(JSON.parse(perm.text || '{}').permission)) return { ignored: 'no write access' };
  await api(`/repos/${repo}/issues/comments/${comment.id}/reactions`, { method: 'POST', body: { content: 'eyes' } });

  // Their own AI from chat.flisk.si, or the free one.
  const saved = await loadSettings(env, sender, { withKey: true }).catch(() => null);
  const chosen = saved ? resolveModel(saved) : { ai: 'wolf', free: true };
  if (chosen.error) return { error: chosen.error };
  if (chosen.free && (await overLimit(sender))) {
    await say(`@${sender} you used today's ${REVIEWS_PER_DAY} free reviews. Save your own AI key at ${env.PUBLIC_ORIGIN}/reviews and reviews will use it with no daily limit.`);
    return { limited: true };
  }

  const dres = await api(`/repos/${repo}/pulls/${issue.number}`, { accept: 'application/vnd.github.v3.diff' });
  if (!dres.ok) return { error: `diff ${dres.status}` };
  const cap = chosen.free ? WOLF_DIFF : OWN_KEY_DIFF;
  const cut = dres.text.length > cap;
  const diff = cut ? dres.text.slice(0, cap) : dres.text;
  const files = diffLines(diff);

  const ask = modelFrom(env, fetchImpl, chosen);
  let review = null;
  let err = '';
  for (let i = 0; i < 2 && !review; i++) {
    const r = await ask(prompt(diff, cut));
    if (r.error) { err = r.error; break; }
    review = parseReview(r.text);
  }
  if (!review) {
    await say(`@${sender} the review failed: ${err || 'the model did not answer in the expected shape'}. ${chosen.free ? '' : 'Check your key at ' + env.PUBLIC_ORIGIN + '/reviews.'}`);
    return { error: err || 'bad model answer' };
  }

  const who = chosen.free ? 'Flisk Wolf (free)' : `${chosen.model}`;
  const foot = `\n\n<sub>Reviewed by ${who} on request of @${sender}${cut ? `, first ${Math.round(cap / 1000)} KB of the diff only` : ''}. ${saved ? '' : `Use your own model: ${env.PUBLIC_ORIGIN}/reviews. `}A model can be wrong: read before you merge.</sub>`;
  const comments = cleanComments(review.comments, files);
  const event_ = { approve: 'APPROVE', request_changes: 'REQUEST_CHANGES', comment: 'COMMENT' }[review.verdict];
  const post = (e, c) => api(`/repos/${repo}/pulls/${issue.number}/reviews`, { method: 'POST', body: { event: e, body: review.summary + foot, ...(c.length ? { comments: c } : {}) } });
  let res = await post(event_, comments);
  // A bot cannot approve its own author's PR, and one bad inline comment fails the whole review: fall back step by step.
  if (!res.ok && comments.length) res = await post(event_, []);
  if (!res.ok && event_ !== 'COMMENT') res = await post('COMMENT', []);
  if (!res.ok) await say(`@${sender} ${review.summary}${foot}`);
  return { posted: true, verdict: review.verdict, comments: comments.length };
}

// The webhook: checked, answered at once, and the review runs after the answer.
export async function githubWebhook(request, env, { fetchImpl = fetch, waitUntil = null, overLimit } = {}) {
  const body = await request.text();
  if (!(await verifySignature(env.GITHUB_WEBHOOK_SECRET, body, request.headers.get('x-hub-signature-256')))) return new Response('bad signature', { status: 401 });
  if (request.headers.get('x-github-event') !== 'issue_comment') return new Response('ignored', { status: 202 });
  let ev;
  try { ev = JSON.parse(body); } catch { return new Response('bad json', { status: 400 }); }
  if (ev.action !== 'created' || !ev.issue?.pull_request || ev.issue.state !== 'open' || ev.comment?.user?.type === 'Bot' || !TRIGGER.test(ev.comment?.body || '') || !ev.installation?.id) return new Response('ignored', { status: 202 });
  if (!env.GITHUB_APP_KEY || !env.GITHUB_APP_ID) return new Response('not set up', { status: 503 });
  const job = reviewPullRequest(env, ev, { fetchImpl, overLimit }).then((r) => console.log('review', JSON.stringify(r))).catch((e) => console.log('review failed', String(e?.message || e).slice(0, 300)));
  if (waitUntil) waitUntil(job);
  else await job;
  return new Response('reviewing', { status: 202 });
}

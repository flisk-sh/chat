// The visitor's own GitHub on the computer. Sign-in asks GitHub for "public_repo" (write to public repos, nothing private),
// the token is sealed with KEY_SECRET in D1, and each task's computer gets it as git's credential and gh's login, so
// "fork this repo, fix the issue, open a PR" runs as the visitor. The token is never shown to the model or the page:
// every output is scrubbed before either sees it.
import { open, seal } from './keys.js';

export const GITHUB_SCOPE = 'public_repo';
const GH_VERSION = '2.63.2';

export async function saveGithubToken(env, login, token, scope = '') {
  if (!env.KEY_SECRET || !env.DB || !token) return;
  await env.DB.prepare('INSERT INTO github_tokens (login, token_enc, scope, updated) VALUES (?, ?, ?, ?) ON CONFLICT(login) DO UPDATE SET token_enc = excluded.token_enc, scope = excluded.scope, updated = excluded.updated')
    .bind(login, await seal(env.KEY_SECRET, token), String(scope).slice(0, 200), new Date().toISOString()).run();
}

// { token, scope } or null when this login never allowed chat to use GitHub (signed in before it asked, or anonymous).
export async function loadGithubToken(env, login) {
  if (!env.KEY_SECRET || !env.DB) return null;
  const row = await env.DB.prepare('SELECT token_enc, scope FROM github_tokens WHERE login = ?').bind(login).first().catch(() => null);
  if (!row) return null;
  const token = await open(env.KEY_SECRET, row.token_enc);
  return token ? { token, scope: row.scope || '' } : null;
}

export const forgetGithubToken = (env, login) => env.DB?.prepare('DELETE FROM github_tokens WHERE login = ?').bind(login).run();

export const canPush = (scope) => /(^|[ ,])(public_repo|repo)($|[ ,])/.test(String(scope || ''));

// Replace the token wherever it shows up in text the model or the page would see.
export function scrub(text, token) {
  if (!token || typeof text !== 'string') return text;
  return text.split(token).join('***');
}

// What the model is told about GitHub for this task.
export function githubNote(github, origin) {
  if (github?.token && canPush(github.scope)) {
    return `\n\nGITHUB: the user's GitHub account @${github.login} is signed in on the computer. git clone/push to github.com and gh (gh issue view, gh repo fork --clone, gh pr create) work as them, for public repos (start each such command with export PATH=$HOME/.local/bin:$PATH;). For "fix this issue / open a PR": gh issue view <url>, then gh repo fork <owner/repo> --clone --default-branch-only (skip the fork when @${github.login} can push to the repo), then in the clone gh repo sync --force (an older fork of the same repo is stale) and git pull, git checkout -b <branch>, change the files with "write", git commit -am, git push -u origin <branch>, gh pr create --repo <owner/repo> --head ${github.login}:<branch> --title ... --body ...; then "say" the PR link first. Never print the token or ~/.config/flisk-gh. ONE command per action, and read each output before the next: do not chain fork, commit, push and PR into one command, and never echo a link you have not seen; the PR link is the last line gh pr create prints. The computer is a small sandbox without Docker: say plainly what you could not run there.`;
  }
  if (github?.login) {
    return `\n\nGITHUB: @${github.login} signed in before chat could act on GitHub, so pushing and opening PRs do not work yet. Reading public repos and issues with curl https://api.github.com/... works. If the task needs a push or a PR, do the rest, then tell the user in one sentence to allow it once at ${origin}/auth/start?again=1 and ask again.`;
  }
  return `\n\nGITHUB: the user is not signed in with GitHub, so pushing and opening PRs do not work. Reading public repos and issues with curl https://api.github.com/... works. If the task needs a push or a PR, tell the user to sign in with GitHub at ${origin}/auth/start and ask again.`;
}

// One command that signs git and gh in on a fresh computer. The token arrives in a file written through fleet, so it is
// not part of any command text, and the file is removed once gh has stored it.
export async function setupGithub({ computer, podId, github }) {
  if (!github?.token || !canPush(github.scope)) return { skipped: true };
  const tokenFile = '/tmp/.flisk-gh-token';
  const w = await computer.write(podId, tokenFile, github.token);
  if (w.error) return { error: w.error };
  const login = String(github.login).replace(/[^A-Za-z0-9-]/g, '');
  // gh refuses `auth login --with-token` for a token without the repo, read:org scopes (public_repo is narrower), so gh gets
  // the token through GH_TOKEN, which it accepts as is: a wrapper script reads it from a 600 file in the home folder.
  // Plain git gets it from ~/.git-credentials.
  const cmd = [
    'set +e; mkdir -p "$HOME/.local/bin" "$HOME/.config/flisk-gh"; export PATH="$HOME/.local/bin:$PATH"',
    `REAL=$(command -v gh); if [ -z "$REAL" ]; then a=$(uname -m); case "$a" in aarch64|arm64) a=arm64;; *) a=amd64;; esac; curl -fsSL "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_$a.tar.gz" | tar xz -C /tmp && cp /tmp/gh_${GH_VERSION}_linux_$a/bin/gh "$HOME/.local/bin/gh-real" && REAL="$HOME/.local/bin/gh-real"; fi`,
    `mv ${tokenFile} "$HOME/.config/flisk-gh/token"; chmod 600 "$HOME/.config/flisk-gh/token"`,
    `printf '#!/bin/sh\nGH_TOKEN="$(cat "$HOME/.config/flisk-gh/token")" exec %s "$@"\n' "$REAL" > "$HOME/.local/bin/gh"; chmod +x "$HOME/.local/bin/gh"`,
    `printf 'https://%s:%s@github.com\n' "${login}" "$(cat "$HOME/.config/flisk-gh/token")" > "$HOME/.git-credentials"; chmod 600 "$HOME/.git-credentials"; git config --global credential.helper store`,
    `git config --global user.name "${login}"; git config --global user.email "${login}@users.noreply.github.com"`,
    `[ "$(gh api user -q .login 2>/dev/null)" = "${login}" ] && echo GH_OK || echo GH_FAIL`,
  ].join('\n');
  const r = await computer.run(podId, cmd);
  if (r.error) return { error: r.error };
  return /GH_OK/.test(r.data?.stdout || '') ? { ok: true } : { error: 'gh could not reach GitHub as the user on this computer' };
}

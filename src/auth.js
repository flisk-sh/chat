import { GITHUB_SCOPE } from './github.js';
// GitHub sign-in: the only login chat has.
export function githubAuthorizeUrl(env, state) {
  const u = new URL('https://github.com/login/oauth/authorize');
  u.searchParams.set('client_id', env.GITHUB_CLIENT_ID || '');
  u.searchParams.set('redirect_uri', `${env.PUBLIC_ORIGIN}/auth/callback`);
  u.searchParams.set('state', state);
  u.searchParams.set('scope', GITHUB_SCOPE);
  return u.toString();
}

// { login, token, scope } of the person who signed in, or null.
export async function githubLogin(env, code, fetchImpl = fetch) {
  const tokenRes = await fetchImpl('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code }),
  });
  const got = await tokenRes.json().catch(() => ({}));
  const token = got.access_token;
  if (!token) return null;
  const userRes = await fetchImpl('https://api.github.com/user', { headers: { authorization: `Bearer ${token}`, 'user-agent': 'flisk-chat', accept: 'application/vnd.github+json' } });
  const login = (await userRes.json().catch(() => ({}))).login;
  return typeof login === 'string' && /^[A-Za-z0-9-]{1,39}$/.test(login) ? { login, token, scope: String(got.scope || '') } : null;
}

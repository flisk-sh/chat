// A live link to the app Flisk runs on the computer: the real website and the real API behind it, not a one-file copy.
// The model sends {"share": <website port>} after `flisk up`. Chat then:
//   1. lets Vite answer on the public host (Flisk's web config listens on localhost and Vite refuses unknown hosts),
//   2. asks fleet for a public URL of that port and sets the command that starts the app again when the computer wakes up,
//   3. opens the URL itself and only then calls it live.
// The computer is kept instead of stopped: it pauses itself when idle (no compute is billed while paused), a visit wakes it,
// and chat deletes it after KEEP_DAYS (see index.js keptPods). Only providers that can give a port a public URL do this
// For a provider whose computers cannot sleep and wake, the link lasts only as long as the computer (about an hour), and the
// answer says so. A provider without public URLs answers 501: the answer says plainly that there is no live link, and
// never ships a copy of the app instead.
export const KEEP_DAYS = 7;
export const KEPT_PER_LOGIN = 3;

// The folder is only ever one the model names under home; nothing that could break out of the quoted shell word.
const DIR = /^~(\/[A-Za-z0-9._-]+){0,4}$/;

export function cleanShare(v) {
  const o = typeof v === 'number' || typeof v === 'string' ? { port: v } : v && typeof v === 'object' ? v : null;
  if (!o) return null;
  const port = Number(o.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  const dir = typeof o.dir === 'string' && DIR.test(o.dir.trim()) ? o.dir.trim() : '~/app';
  return { port, dir };
}

const home = (dir) => dir.replace(/^~/, '$HOME');

// What the computer runs every time it starts again after a pause: the same `flisk up` as the build.
export const startupCommand = (dir) => `export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH; cd "${home(dir)}" && (nohup flisk up > /tmp/up.log 2>&1 &)`;

// Every Vite config of the app (not in node_modules) answers on all interfaces and any host name. Then wait until the port
// answers again, because Vite restarts itself when its config changes.
export const openViteCommand = (dir, port) =>
  `cd "${home(dir)}" 2>/dev/null || exit 3; for f in $(find . -maxdepth 3 -name 'vite.config.*' -not -path '*/node_modules/*'); do sed -i "s/host: 'localhost'/host: true, allowedHosts: true/" "$f"; done; ` +
  `for i in 1 2 3 4 5 6 7 8 9 10; do c=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${port}/); [ "$c" != 000 ] && echo "port=$c" && exit 0; sleep 1; done; echo port=000; tail -5 /tmp/up.log`;

// Is the public URL really the app? Vite's own refusal ("Blocked request. This host ... is not allowed") also answers 403.
async function check(url, fetchImpl, wait) {
  let last = '';
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetchImpl(url, { headers: { 'user-agent': 'flisk-chat-share-check' }, redirect: 'follow' });
      const body = (await r.text()).slice(0, 4000);
      if (r.status < 400 && !/Blocked request/i.test(body)) return { ok: true, status: r.status };
      last = `HTTP ${r.status}: ${body.replace(/\s+/g, ' ').slice(0, 160)}`;
    } catch (e) {
      last = String(e?.message || e).slice(0, 160);
    }
    await wait(2000);
  }
  return { ok: false, last };
}

// What the model is told when the provider cannot give a public link: say so, never fake it with a copy.
export const noLinkError = (provider, why) =>
  `${provider || 'this provider'} cannot give this computer a public link (${why}). Do NOT make a copy of the app. "say" plainly that the app was built and checked on the computer, but ${provider || 'this provider'} cannot share it, so it stops when you answer; connecting a provider that can share (for example Upstash Box) gives a live link next time.`;

// computer: fleet.js client. Returns { url, wakesOnVisit, expiresAt }, or { error } the model can act on ({ refused: true }
// when the provider cannot share at all).
export async function shareApp({ computer, podId, spec, provider = '', fetchImpl = fetch, wait = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const opened = await computer.run(podId, openViteCommand(spec.dir, spec.port));
  if (opened.error) return { error: opened.error };
  const out = String(opened.data?.stdout || '');
  if (opened.data?.exitCode === 3) return { error: `there is no folder ${spec.dir} on the computer. Send {"share": {"port": ${spec.port}, "dir": "~/<the app folder>"}}` };
  if (!/port=[1-5]\d\d/.test(out)) return { error: `nothing answers on port ${spec.port}. Is flisk up running? Last lines of /tmp/up.log:\n${out.slice(-600)}` };
  const made = await computer.share(podId, spec.port, startupCommand(spec.dir));
  if (made.error) return made.status === 501 ? { error: noLinkError(provider, made.error), refused: true } : { error: made.error };
  const url = made.data?.url;
  if (!/^https:\/\//.test(String(url || ''))) return { error: 'fleet gave no public link' };
  const seen = await check(url, fetchImpl, wait);
  if (!seen.ok) return { error: `the public link does not open the app yet (${seen.last}). Check that the website answers on port ${spec.port} and that the Vite config has host: true and allowedHosts: true` };
  // expiresAt: the provider ends the computer then, whatever happens, so the link lasts until then. With no end, a computer
  // that sleeps when idle and wakes on a visit (wakesOnVisit) is kept KEEP_DAYS; any other lasts about an hour (fleet's
  // default pod lifetime).
  const wakesOnVisit = made.data.wakesOnVisit === true;
  const end = Date.parse(made.data.expiresAt || '');
  const expiresAt = end ? new Date(end).toISOString() : wakesOnVisit ? null : new Date(Date.now() + 3600_000).toISOString();
  return { url, wakesOnVisit, expiresAt };
}

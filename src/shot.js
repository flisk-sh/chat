// A picture of a page chat built, for the @askflisk reply (a post with a link is dropped by X, so the post carries the picture
// and the link goes by DM). Cloudflare Browser Rendering's screenshot endpoint renders the HTML we hand it; no browser binding needed.
// Needs CF_ACCOUNT_ID and CF_BROWSER_TOKEN (a token with Browser Rendering: Edit). Without them, or on any failure: '' (the caller falls back).
export async function pageShot(env, html, { fetchImpl = fetch, ms = 20000 } = {}) {
  if (!env?.CF_ACCOUNT_ID || !env?.CF_BROWSER_TOKEN || !html) return '';
  const res = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CF_ACCOUNT_ID)}/browser-rendering/screenshot`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.CF_BROWSER_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ html, viewport: { width: 1200, height: 675 }, screenshotOptions: { type: 'jpeg', quality: 80 }, gotoOptions: { waitUntil: 'load', timeout: 10000 } }),
    signal: AbortSignal.timeout(ms),
  }).catch(() => null);
  if (!res || res.status !== 200 || !/^image\/jpeg/.test(res.headers.get('content-type') || '')) return '';
  const bytes = new Uint8Array(await res.arrayBuffer());
  // X takes 5 MB; a screenshot this size means something went wrong.
  if (!bytes.length || bytes.length > 4_000_000) return '';
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/jpeg;base64,${btoa(bin)}`;
}

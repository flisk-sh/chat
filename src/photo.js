// The hero photo of a layout page, drawn by Workers AI (FLUX.1 schnell, about 4 seconds and some 55 of the account's free
// 10,000 daily neurons). The free neurons are shared with inference.flisk.si, so photos have a daily cap per login and
// one for everybody, counted in D1. Anything that goes wrong (cap reached, a slow or failed model, no table yet) gives
// no photo, and the page is drawn with its dark glow instead: a photo never stops a page from being published.

export const PHOTO_MODEL = '@cf/black-forest-labs/flux-1-schnell';
export const PHOTOS_PER_LOGIN = 6; // a day
export const PHOTOS_PER_DAY = 40; // a day, for everybody: 40 x 55 = 2,200 neurons, so the text model keeps its share of the 10,000
const PHOTO_MS = 25_000;

// Pictures this login has drawn today, read only; the cap is PHOTOS_PER_LOGIN. 0 when the table cannot be read.
export async function photosUsed(env, login, day = new Date().toISOString().slice(0, 10)) {
  try {
    const row = await env.DB.prepare('SELECT n FROM site_photos WHERE day = ? AND login = ?').bind(day, login).first();
    return Math.max(0, Number(row?.n) || 0);
  } catch { return 0; }
}

// The last `days` days of this login's pictures, oldest first, zero-filled, for the usage chart. [] when the table cannot be read.
export async function photoHistory(env, login, days = 7, now = Date.now()) {
  const list = Array.from({ length: days }, (_, i) => new Date(now - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10));
  try {
    const rows = await env.DB.prepare('SELECT day, n FROM site_photos WHERE login = ? AND day >= ?').bind(login, list[0]).all();
    const n = Object.fromEntries((rows.results || []).map((r) => [r.day, Number(r.n) || 0]));
    return list.map((day) => ({ day, n: n[day] || 0 }));
  } catch { return []; }
}

// Counts one photo for the login and for everybody today; false when either count is already at its cap.
export async function takePhotoSlot(env, login, day = new Date().toISOString().slice(0, 10)) {
  const rows = await env.DB.prepare('SELECT login, n FROM site_photos WHERE day = ? AND login IN (?, ?)').bind(day, login, '*').all();
  const n = Object.fromEntries((rows.results || []).map((r) => [r.login, r.n]));
  if ((n[login] || 0) >= PHOTOS_PER_LOGIN || (n['*'] || 0) >= PHOTOS_PER_DAY) return false;
  const up = 'INSERT INTO site_photos (day, login, n) VALUES (?, ?, 1) ON CONFLICT (day, login) DO UPDATE SET n = n + 1';
  await env.DB.batch([env.DB.prepare(up).bind(day, login), env.DB.prepare(up).bind(day, '*')]);
  return true;
}

// When FLUX cannot draw (the account's daily neurons are used up), the picture comes from Pollinations, which needs no key.
export const POLLINATIONS_IMAGE_URL = 'https://image.pollinations.ai/prompt/';
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

export async function pollinationsPhoto(prompt, { fetchImpl = fetch, ms = PHOTO_MS, base = POLLINATIONS_IMAGE_URL, retryMs = 1500 } = {}) {
  try {
    const url = `${base}${encodeURIComponent(String(prompt).slice(0, 800))}?width=1024&height=1024&nologo=true&private=true`;
    // Pollinations limits free requests per address and Workers share addresses, so a 402, 429 or 503 is often gone a moment later: one retry.
    let res = await fetchImpl(url, { signal: AbortSignal.timeout(ms) });
    if ([402, 429, 503].includes(res.status)) {
      await new Promise((r) => setTimeout(r, retryMs));
      res = await fetchImpl(url, { signal: AbortSignal.timeout(ms) });
    }
    const type = (res.headers.get('content-type') || '').split(';')[0].trim();
    if (!res.ok || !/^image\/(jpeg|png|webp)$/.test(type)) { console.warn('pollinations: no picture', res.status, type); return ''; }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length < 1000 || bytes.length > MAX_PHOTO_BYTES) return '';
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:${type};base64,${btoa(bin)}`;
  } catch (e) {
    console.warn('pollinations failed:', String(e?.message || e).slice(0, 200));
    return '';
  }
}

// A data: URL of the photo, or '' when there is none.
export async function sitePhoto(env, login, prompt, { ms = PHOTO_MS, fetchImpl = fetch } = {}) {
  if (!prompt) return '';
  // The daily cap protects the account's FLUX neurons only. Pollinations costs none, so a spent cap (or no table yet)
  // skips FLUX but still tries Pollinations: a picture must not end on "limit used up" while a free source works.
  let slot = false;
  try {
    slot = !!env.DB && (await takePhotoSlot(env, login));
  } catch { /* no slot: no FLUX */ }
  const flux = slot && env.AI ? await fluxPhoto(env, prompt, ms) : '';
  return flux || (env.NO_POLLINATIONS === '1' ? '' : pollinationsPhoto(prompt, { fetchImpl, ms }));
}

async function fluxPhoto(env, prompt, ms) {
  try {
    let timer;
    const out = await Promise.race([
      env.AI.run(PHOTO_MODEL, { prompt: String(prompt).slice(0, 2000), steps: 4 }),
      new Promise((_, no) => { timer = setTimeout(() => no(new Error('photo took too long')), ms); }),
    ]).finally(() => clearTimeout(timer));
    const b64 = typeof out?.image === 'string' ? out.image : '';
    return /^[A-Za-z0-9+/=]{1000,}$/.test(b64) ? `data:image/jpeg;base64,${b64}` : '';
  } catch (e) {
    console.warn('flux failed:', String(e?.message || e).slice(0, 200));
    return '';
  }
}

// Live end-to-end check: chat's own build code makes a small two-part app on a real Upstash Box through fleet, shares it,
// and a real browser adds and deletes a record on the live link. It passes only when Add sends POST /api/<part> (201),
// Delete sends DELETE /api/<part>/<id> (200), and each change is still there (or gone) after a reload.
// The computer is always deleted at the end.
//
// Needs: FLEET_SERVICE_SECRET (chat's secret for fleet) and UPSTASH_BOX_KEY (a test account's Upstash Box key, sent per
// call in X-Upstash-Key and never stored). Optional: FLEET_URL, E2E_LOGIN. Run: node scripts/e2e-live.mjs
import { fleetClient } from '../src/fleet.js';
import { shareApp } from '../src/share.js';
import { cleanSystem, makeSystem } from '../src/system.js';

const { FLEET_SERVICE_SECRET, UPSTASH_BOX_KEY } = process.env;
if (!FLEET_SERVICE_SECRET || !UPSTASH_BOX_KEY) {
  console.log('Skipped: set FLEET_SERVICE_SECRET and UPSTASH_BOX_KEY to run the live check.');
  process.exit(0);
}
const { chromium } = await import('playwright');
const env = { FLEET_URL: process.env.FLEET_URL || 'https://fleet.flisk.si', FLEET_SERVICE_SECRET };
const login = process.env.E2E_LOGIN || 'flisk-chat-e2e';
const withKey = (url, init = {}) => fetch(url, { ...init, headers: { ...init.headers, 'x-upstash-key': UPSTASH_BOX_KEY } });
const computer = fleetClient(env, login, withKey);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const fail = (why) => {
  throw new Error(why);
};

let podId = null;
let browser = null;
try {
  const made = await computer.start(['upstash']);
  if (made.error) fail(`fleet could not start an Upstash Box: ${made.error}`);
  podId = made.data.id;
  log('computer', podId, made.data.provider);

  const spec = cleanSystem({ title: 'E2E CRM', services: [{ name: 'contacts', does: 'people', fields: ['Name', 'Email'] }, { name: 'deals', fields: ['Title'] }] });
  const sys = await makeSystem({ computer, podId, spec, emit: (e) => log(e.type) });
  if (sys.error) fail(`build failed: ${sys.error}`);
  log(sys.summary);
  if (!sys.ok) fail('a part failed the check on the computer');

  const shared = await shareApp({ computer, podId, spec: { port: sys.web, dir: '~/app' }, provider: 'upstash' });
  if (shared.error) fail(`share failed: ${shared.error}`);
  log('live link', shared.url, shared.wakesOnVisit ? '(wakes on visit)' : `(until ${shared.expiresAt})`);

  browser = await chromium.launch();
  const page = await browser.newPage();
  const name = `E2E ${Date.now()}`;
  await page.goto(`${shared.url}/#contacts`, { waitUntil: 'networkidle', timeout: 90_000 });
  await page.waitForSelector('#add input[name="name"]');

  await page.fill('#add input[name="name"]', name);
  await page.fill('#add input[name="email"]', 'e2e@example.com');
  const [added] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/contacts'),
    page.click('#add button[type="submit"]'),
  ]);
  if (added.status() !== 201) fail(`Add sent POST /api/contacts but it answered ${added.status()}`);
  const id = (await added.json()).id;
  log('POST /api/contacts', added.status(), 'id', id);

  await page.reload({ waitUntil: 'networkidle' });
  const row = page.locator('tbody tr', { hasText: name });
  await row.waitFor({ timeout: 15_000 }).catch(() => fail('the added record is not there after a reload'));
  log('after reload: the record is there');

  const [deleted] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'DELETE' && new URL(r.url()).pathname === `/api/contacts/${id}`),
    row.locator('button.del').click(),
  ]);
  if (deleted.status() !== 200) fail(`Delete sent DELETE /api/contacts/${id} but it answered ${deleted.status()}`);
  log('DELETE', `/api/contacts/${id}`, deleted.status());

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#rows table, #rows .empty');
  if (await page.locator('tbody tr', { hasText: name }).count()) fail('the deleted record is back after a reload');
  log('after reload: the record is gone');

  const list = await (await fetch(`${shared.url}/api/contacts`)).json();
  if (list.some((r) => r.name === name)) fail('the API still lists the deleted record');
  log('PASS: the live link adds and deletes through the real API, and both last after a reload');
} catch (e) {
  console.error('FAIL:', e.message);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  if (podId) {
    const s = await computer.stop(podId).catch((e) => ({ error: e.message }));
    log('computer deleted', s.error ? `NOT deleted: ${s.error}` : 'ok');
  }
}

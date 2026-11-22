import { describe, expect, test } from 'bun:test';
import worker from '../src/index.js';
import { withSecurityHeaders } from '../src/security-headers.js';

const ORIGIN = 'https://chat.test';
const memCache = () => { const m = new Map(); return { match: async (k) => m.get(String(k.url || k))?.clone(), put: async (k, r) => { m.set(String(k.url || k), r); } }; };
const INFERENCE = { fetch: async () => Response.json({ choices: [{ message: { content: 'Hello.' } }] }) };
const env = () => ({ PUBLIC_ORIGIN: ORIGIN, SESSION_SECRET: 's', FLEET_URL: 'https://fleet.test', FLEET_SERVICE_SECRET: 'x'.repeat(40), LIMIT_CACHE: memCache(), INFERENCE });
const get = (p) => worker.fetch(new Request(`${ORIGIN}${p}`), env());

// Chat's own pages already send stricter values (DENY, same-origin, frame-ancestors 'none'); those stay.
const baseline = (res) => {
  expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  // Safari honours X-Frame-Options next to frame-ancestors, so only frame-ancestors may decide who frames us (the analytics heatmap).
  expect(res.headers.get('x-frame-options')).toBeNull();
  expect(res.headers.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains');
  expect(res.headers.get('referrer-policy')).toMatch(/^(same-origin|strict-origin-when-cross-origin|no-referrer)$/);
  expect(res.headers.get('permissions-policy')).toBe('camera=(), microphone=(self), geolocation=()');
  expect(res.headers.get('content-security-policy')).toMatch(/frame-ancestors ('self'|'none'|https:\/\/analytics\.flisk\.si)/);
};

describe('security headers', () => {
  test('the home page carries them and keeps the microphone for voice', async () => {
    const res = await get('/classic');
    expect(res.status).toBe(200);
    baseline(res);
  });
  test('a 404 carries them', async () => {
    const res = await get('/nope');
    expect(res.status).toBe(404);
    baseline(res);
  });
  test('a JSON API response carries them', async () => {
    const res = await get('/api/nope');
    baseline(res);
  });
  test('existing values are kept, gaps are filled, none is duplicated', () => {
    const res = withSecurityHeaders(new Response('x', { headers: { 'x-frame-options': 'DENY', 'strict-transport-security': 'max-age=31536000', 'content-security-policy': "default-src 'none'" } }));
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains');
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; frame-ancestors 'self' https://analytics.flisk.si");
    expect(res.headers.get('permissions-policy')).toBe('camera=(), microphone=(), geolocation=()');
  });
  test('a CSP that already has frame-ancestors is left alone', () => {
    const csp = "default-src 'none'; frame-ancestors 'none'";
    expect(withSecurityHeaders(new Response('x', { headers: { 'content-security-policy': csp } })).headers.get('content-security-policy')).toBe(csp);
  });
  test('redirects with immutable headers still work', () => {
    const res = withSecurityHeaders(Response.redirect(`${ORIGIN}/`, 302), { permissionsPolicy: 'camera=(), microphone=(self), geolocation=()' });
    expect(res.status).toBe(302);
    baseline(res);
  });
});

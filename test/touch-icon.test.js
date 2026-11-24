import { expect, test } from 'bun:test';
import worker from '../src/index.js';
import { chatPage } from '../src/app-page.js';

const origin = 'https://chat.flisk.si';
const get = (path) => worker.fetch(new Request(`${origin}${path}`), {}, { waitUntil() {} });

const dims = (bytes) => {
  expect(bytes.slice(0, 8)).toEqual(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
  return [new DataView(bytes.buffer, bytes.byteOffset).getUint32(16), new DataView(bytes.buffer, bytes.byteOffset).getUint32(20)];
};

test('the home page declares an apple-touch-icon', async () => {
  // Built from chatPage directly: GET / would fill the shared fleet-names cache and break test/fleet-names.test.js.
  const html = chatPage();
  expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png">');
});

test('the touch icon is a cached 180x180 PNG', async () => {
  const res = await get('/apple-touch-icon.png');
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toMatch(/^image\/png/);
  expect(res.headers.get('cache-control')).toContain('max-age=86400');
  expect(dims(new Uint8Array(await res.arrayBuffer()))).toEqual([180, 180]);
});

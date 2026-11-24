// The new home page runs a task on the computer in the tab when no cloud computer is connected (/api/run answers 409),
// as /classic does. Before, "Start a computer and run it" only sent the task again and got the same 409.
import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';

const sent = [];
class FakeWS {
  constructor(url) { this.url = url; FakeWS.last = this; setTimeout(() => this.onopen(), 0); }
  send(m) { sent.push(JSON.parse(m)); }
  close() {}
  emit(ev) { return this.onmessage({ data: JSON.stringify(ev) }); }
}
globalThis.window = { __BOOT__: { pod: 'http://localhost:8854/browserpod/' } };
globalThis.location = { origin: 'http://localhost:8853' };
globalThis.WebSocket = FakeWS;
const api = await import('../web/src/api.js');

test('the tab computer is offered when the page has a pod address', () => {
  expect(api.podOk()).toBe(true);
});

test('a task runs over the WebSocket: events reach the page, done ends it', async () => {
  const evs = [];
  const p = api.runInBrowser({ mode: 'build', task: 'coffee site' }, (ev) => evs.push(ev), new AbortController().signal);
  await new Promise((r) => setTimeout(r, 5));
  expect(FakeWS.last.url).toBe('ws://localhost:8853/api/run');
  expect(sent.at(-1)).toMatchObject({ type: 'task', task: 'coffee site', mode: 'build' });
  FakeWS.last.emit({ type: 'text', text: 'hi' });
  FakeWS.last.emit({ type: 'done' });
  expect(await p).toEqual({ status: 200 });
  expect(evs).toEqual([{ type: 'text', text: 'hi' }]);
});

test('a refusal comes back with its status, so 429 shows the limit card', async () => {
  const p = api.runInBrowser({ task: 'x' }, () => {}, new AbortController().signal);
  await new Promise((r) => setTimeout(r, 5));
  FakeWS.last.emit({ type: 'refused', status: 429, error: 'limit' });
  expect(await p).toMatchObject({ status: 429, body: { error: 'limit' } });
});

test('Stop ends the task as an AbortError', async () => {
  const ac = new AbortController();
  const p = api.runInBrowser({ task: 'x' }, () => {}, ac.signal);
  ac.abort();
  await expect(p).rejects.toMatchObject({ name: 'AbortError' });
});

test('the page falls back to the tab computer on 409 before showing the connect card', () => {
  const src = readFileSync(new URL('../web/src/App.jsx', import.meta.url), 'utf8');
  const tab = src.indexOf('if (res.status === 409 && podOk())');
  const card = src.indexOf('if (res.status === 409) { put({...t, needPod: true}); return; }');
  expect(tab).toBeGreaterThan(0);
  expect(card).toBeGreaterThan(tab);
  expect(src).toContain('runInBrowser(payload,');
});

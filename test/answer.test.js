import { expect, test } from 'bun:test';
import { ANSWER_PER_ASKER_PER_DAY, MAX_ANSWER, answer, cleanQuestion, postable } from '../src/answer.js';

const KEY = 'k'.repeat(32);
const req = (body, auth = `Bearer ${KEY}`) => new Request('https://chat.flisk.si/api/answer', { method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const deps = (over = {}) => ({ weather: async () => '', search: async () => ({ error: 'none' }), format: () => '', over: async () => false, ask: async () => ({ text: 'Rainy, 9°C.' }), ...over });

test('no key or a wrong key answers 404 and never reaches the model', async () => {
  let asked = 0;
  const d = deps({ ask: async () => { asked++; return { text: 'x' }; } });
  expect((await answer(req({ question: 'hi' }), {}, d)).status).toBe(404);
  expect((await answer(req({ question: 'hi' }, 'Bearer nope'), { X_BOT_KEY: KEY }, d)).status).toBe(404);
  expect((await answer(req({ question: 'hi' }, 'Bearer short'), { X_BOT_KEY: 'short' }, d)).status).toBe(404);
  expect(asked).toBe(0);
});

test('the mention is removed and the weather note goes to the model', async () => {
  let seen;
  const d = deps({ weather: async () => 'London: rain, 9°C', ask: async (m) => { seen = m; return { text: 'London: rain, 9°C.' }; } });
  const res = await answer(req({ question: '@askflisk weather in london ', asker: '123' }), { X_BOT_KEY: KEY }, d);
  expect(res.status).toBe(200);
  expect((await res.json()).text).toBe('London: rain, 9°C.');
  expect(seen[1].content).toBe('weather in london');
  expect(seen[0].content).toContain('London: rain, 9°C');
});

test('search results are used when it is not a weather question', async () => {
  let seen;
  const d = deps({ search: async () => ({ results: [{ title: 'T', url: 'https://a.b', snippet: 's' }] }), format: () => '[1] T', ask: async (m) => { seen = m; return { text: 'ok' }; } });
  await answer(req({ question: 'who won the match' }), { X_BOT_KEY: KEY }, d);
  expect(seen[0].content).toContain('[1] T');
});

test('limits answer 429, an empty question 400, a model error 502', async () => {
  expect((await answer(req({ question: 'hi', asker: '1' }), { X_BOT_KEY: KEY }, deps({ over: async (s) => s === 'x-asker' }))).status).toBe(429);
  expect((await answer(req({ question: 'hi' }), { X_BOT_KEY: KEY }, deps({ over: async (s) => s === 'x-bot' }))).status).toBe(429);
  expect((await answer(req({ question: '@askflisk' }), { X_BOT_KEY: KEY }, deps())).status).toBe(400);
  expect((await answer(req({ question: 'hi' }), { X_BOT_KEY: KEY }, deps({ ask: async () => ({ error: 'busy', kind: 'busy' }) }))).status).toBe(502);
  expect(ANSWER_PER_ASKER_PER_DAY).toBeGreaterThan(0);
});

test('postable makes one safe line that fits a post', () => {
  expect(postable('**Rain** at [BBC](https://bbc.co.uk) see https://x.com/a\n\nok')).toBe('Rain at BBC see ok');
  expect(postable('{"say":"hello"}')).toBe('hello');
  expect(postable('hi @elonmusk')).not.toContain('@e');
  const long = postable('word '.repeat(200));
  expect(long.length).toBeLessThanOrEqual(MAX_ANSWER);
  expect(cleanQuestion('@AskFlisk  hey   @askflisk')).toBe('hey');
});

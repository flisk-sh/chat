import { expect, test } from 'bun:test';
import { guardAnswer, runTask } from '../src/loop.js';
import { runEvents } from '../src/trace.js';

// The class of bug behind chat.flisk.si showing {"say": ...} to people (2026-11-22): whatever shape the model's text takes, plumbing
// must not reach the answer. One row per shape seen or likely; add a row each time production shows a new one.
const shapes = {
  'two say objects': ['{"say": "one"}\n{"say": "two"}', 'one\n\ntwo'],
  'say nested in say': ['{"say": "{\\"say\\": \\"hi there\\"}"}', 'hi there'],
  'fenced say': ['```json\n{"say": "ok"}\n```', 'ok'],
  'tool tags around words': ['<invoke name="x">Hello</invoke>', 'Hello'],
  'dsml block then words': ['<|DSML|>junk<|/DSML|>All good.', 'All good.'],
};
for (const [name, [input, want]] of Object.entries(shapes)) {
  test(`guard: ${name}`, () => {
    const g = guardAnswer(input);
    expect(g.text).toBe(want);
    expect(g.text).not.toMatch(/\{\s*"say"|<invoke|DSML/);
    expect(g.changed).toBe(true);
  });
}

test('guard: another action has no words, so the answer is empty', () => {
  expect(guardAnswer('{"run": "ls -la"}').empty).toBe(true);
  expect(guardAnswer('{"write": {"path": "a", "content": "b"}}').empty).toBe(true);
});

test('guard: a normal answer is untouched, including braces in the middle', () => {
  const t = 'Use {"say": ...} like this: it is the format.';
  expect(guardAnswer('Hello, world.')).toEqual({ text: 'Hello, world.', changed: false, empty: false });
  expect(guardAnswer(t).changed).toBe(false);
});

test('the answer a visitor gets from runTask has no plumbing even when the parser lets two says through', async () => {
  const events = [];
  const model = async () => ({ text: '{"say": "It is cold."}\n{"say": "Wear a coat."}' });
  const r = await runTask({ task: 'weather in London', model, emit: (e) => events.push(e) });
  expect(r.answer).toContain('It is cold.');
  expect(r.answer).not.toContain('{"say"');
  expect(events.find((e) => e.type === 'answer').text).not.toContain('{"say"');
  expect(r.stats.guarded).toBe(1);
});

test('a guarded answer is traced', () => {
  const ev = runEvents({ answer: 'x', ms: 1000, stats: { guarded: 1 }, steps: [] }, null);
  expect(ev.some((e) => /last guard cut model plumbing/.test(e.why))).toBe(true);
});

// chat#396: the model wrote {"name": "<action>", ...} (a function call) and the page showed it as the answer.
import { parseAction, cleanHistory, webKey } from '../src/loop.js';

test('396: a name-wrapped widget is an action, not an answer', () => {
  for (const t of ['{"name":"widget","kind":"web","url":"https://flisk.sh"}', '{"name":"widget":{"kind":"web","url":"https://flisk.sh"}}']) {
    const a = parseAction(t);
    expect(a.type).toBe('widget');
    expect(a.raw).toEqual({ kind: 'web', url: 'https://flisk.sh' });
  }
});

test('396: a name-wrapped say shows only its words, with real line breaks', () => {
  for (const t of ['{"name":"say":"One\\n\\n- a\\n- b"}', '{"name":"say","text":"One\\n\\n- a\\n- b"}', '{"name":"say","arguments":{"text":"x"}}'.replace('{"text":"x"}', '"One\\n\\n- a\\n- b"')]) {
    const a = parseAction(t);
    expect(a.type).toBe('say');
    expect(a.text).toBe('One\n\n- a\n- b');
    expect(guardAnswer(a.text).changed).toBe(false);
  }
});

test('396: a broken name-wrapped say (bare newline, cut off) loses its braces, keys and trailing quote', () => {
  const a = parseAction('{"name":"say":"Hello\nthere, **friend**"}');
  expect(a.type).toBe('say');
  expect(a.text).toBe('Hello\nthere, **friend**');
  expect(a.text).not.toMatch(/name|"\}|\\n/);
});

test('396: the guard cuts a name wrapper that reaches it', () => {
  expect(guardAnswer('{"name":"say","text":"Hi"}')).toEqual({ text: 'Hi', changed: true, empty: false });
  expect(guardAnswer('{"name":"run","command":"ls"}').empty).toBe(true);
  expect(guardAnswer('My name is {"name": "Bo"}.').changed).toBe(false);
});

test('396: runTask runs a name-wrapped web widget, then answers with clean words', async () => {
  const replies = ['{"name":"widget":{"kind":"web","url":"https://flisk.sh"}}', '{"name":"say":"Rivals:\\n- Compose"}'];
  const events = [];
  const fetchImpl = async () => new Response('<html><body>Flisk page text</body></html>', { headers: { 'content-type': 'text/html' } });
  const r = await runTask({ task: 'who is flisk.sh competitors', model: async () => ({ text: replies.shift() }), fetchImpl, emit: (e) => events.push(e) });
  expect(events.some((e) => e.type === 'widget' && e.kind === 'web')).toBe(true);
  expect(r.answer).toContain('Rivals:\n- Compose');
  expect(r.answer).not.toMatch(/"name"|\\n/);
});

test('396: the same page is read once per task', async () => {
  const replies = ['{"widget":{"kind":"web","url":"https://flisk.sh/"}}', '{"widget":{"kind":"web","url":"https://FLISK.sh"}}', '{"say":"done"}'];
  const events = []; let fetched = 0;
  const fetchImpl = async () => { fetched++; return new Response('<html><body>text</body></html>', { headers: { 'content-type': 'text/html' } }); };
  await runTask({ task: 'read it', model: async () => ({ text: replies.shift() }), fetchImpl, emit: (e) => events.push(e) });
  expect(fetched).toBe(1);
  expect(events.filter((e) => e.type === 'widget').length).toBe(1);
  expect(webKey('https://Flisk.sh/a/#x')).toBe(webKey('https://flisk.sh/a'));
});

test('396: history sent to the model holds no plumbing from earlier answers', () => {
  const h = cleanHistory([{ role: 'user', content: 'hi' }, { role: 'assistant', content: '{"name":"say":"Hello there"}' }]);
  expect(h[1].content).toBe('Hello there');
});

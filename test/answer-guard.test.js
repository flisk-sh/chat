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

import { expect, test } from 'bun:test';
import { parseAction, salvageSay } from '../src/loop.js';
import { runEvents } from '../src/trace.js';

// 2026-11-22: people saw {"say": "...\n\n- ..."} and a bare {"say on chat.flisk.si. The model wrote nearly-JSON (raw newline,
// bare quote, cut off) and parseAction showed the raw text as the answer. A reply starting {"say must never reach a person.
const raw = '{"say": "London is cold.\n\n- **Today**: cloudy\n- **Tomorrow**: dry"}';

test('a say with raw newlines inside the string shows only its words', () => {
  const a = parseAction(raw);
  expect(a.type).toBe('say');
  expect(a.text).toBe('London is cold.\n\n- **Today**: cloudy\n- **Tomorrow**: dry');
  expect(a.text).not.toContain('{"say');
});

test('a say with bare quotes, escaped newlines, or a code fence is cleaned', () => {
  expect(parseAction('{"say": "He said "hi" today"}').text).toBe('He said "hi" today');
  expect(parseAction('{"say": "line one.\\n\\n- a\\n- b", oops}').text).toContain('line one.\n\n- a');
  expect(parseAction('```json\n{"say": "ok"}\n```').text).toBe('ok');
});

test('a say cut off mid-word keeps the words it has; one cut before any words is retried', () => {
  expect(parseAction('{"say": "London is cold and').text).toBe('London is cold and');
  expect(parseAction('{"say').type).toBe('bad');
  expect(parseAction('{"say": ""}').type).toBe('say'); // valid JSON, empty: handled by the normal path
  expect(salvageSay('{"say": "').type).toBe('bad');
});

test('plain answers and other text are untouched', () => {
  expect(parseAction('The page is live.')).toEqual({ type: 'say', text: 'The page is live.' });
  expect(salvageSay('Use {"say": ...} to answer')).toBeNull();
});

test('a salvaged reply is traced, and so are repeated unusable replies', () => {
  const ev = runEvents({ answer: 'x', ms: 1000, stats: { salvaged: 1, bad: 2 }, steps: [] }, null);
  expect(ev.some((e) => /words salvaged/.test(e.why))).toBe(true);
  expect(ev.some((e) => /2 unusable replies/.test(e.why))).toBe(true);
  expect(runEvents({ answer: 'x', ms: 1000, stats: {}, steps: [] }, null)).toEqual([]);
});

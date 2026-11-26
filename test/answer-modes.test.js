// The three answer modes above the composer (docs/adr/0002).
import {test, expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {frame, readSlash, ASK_QUESTIONS} from '../web/src/modes-logic.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('quick answer sends the words as typed', () => {
  expect(frame('  plan a launch ', 'fast')).toBe('plan a launch');
});

test('take your time adds one line and keeps the words', () => {
  const t = frame('plan a launch', 'long');
  expect(t.startsWith('plan a launch')).toBe(true);
  expect(t).toContain('Take your time');
});

test('ask me first adds only the answers that were filled in', () => {
  const t = frame('plan a launch', 'ask', ['mums', '', 'ten students']);
  expect(t).toContain('- ' + ASK_QUESTIONS[0] + ' mums');
  expect(t).toContain('- ' + ASK_QUESTIONS[2] + ' ten students');
  expect(t).not.toContain(ASK_QUESTIONS[1]);
  expect(frame('plan a launch', 'ask', [])).toBe('plan a launch');
});

test('/fast, /ask and /long at the start pick the mode and are removed', () => {
  expect(readSlash('/long plan a launch')).toEqual({answer: 'long', rest: 'plan a launch'});
  expect(readSlash('/ASK')).toEqual({answer: 'ask', rest: ''});
  expect(readSlash('plan /long later')).toBe(null);
  expect(readSlash('/longer')).toBe(null);
});

test('the page still sends mode ask to the server and shows the control above the composer', () => {
  const app = read('web/src/App.jsx');
  expect(app).toContain("const mode = 'ask';");
  expect(app).toContain('<AnswerBar value={answer}');
  expect(app).toContain('send: frame(');
  expect(read('src/app.generated.js')).toContain('Hold');
});

test('shortcuts: command 1 to 3, command K, hold command to show them, and a skip key for the questions', () => {
  const m = read('web/src/Modes.jsx');
  expect(m).toContain("['1', '2', '3'].indexOf(e.key)");
  expect(m).toContain("e.key.toLowerCase() === 'k'");
  expect(m).toContain('Hold ⌘ for shortcuts');
  expect(m).toContain("e.key === 'Escape'");
});

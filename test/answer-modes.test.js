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
  expect(read('src/app.generated.js')).toContain('Questions first');
});

test('shortcuts: command 1 to 3, command K, hold command to show them, and a skip key for the questions', () => {
  const m = read('web/src/Modes.jsx');
  expect(m).toContain("['1', '2', '3'].indexOf(e.key)");
  expect(m).toContain("e.key.toLowerCase() === 'k'");
  expect(m).toContain("e.key === 'Escape'");
});

test('take your time sends the plain words as the quick answer and a second request with the long line', () => {
  const app = read('web/src/App.jsx');
  expect(app).toContain("send: picked1 === 'long' ? undefined : frame(words, picked1), long: picked1 === 'long'");
  expect(read('web/src/App.jsx')).toContain("runTask({...payload, task: frame(payload.task, 'long')}");
  expect(app).toContain('<LongPill long={x.long}');
  const m = read('web/src/Modes.jsx');
  expect(m).toContain("e.altKey && e.key === 'Enter'");
  expect(m).toContain('Switch to this answer');
});

test('the command menu also runs the chat actions: new chat, plugins, model, computers, attach, dictate, talk, settings', () => {
  const app = read('web/src/App.jsx');
  for (const id of ['new', 'plugins', 'model', 'computers', 'attach', 'dictate', 'talk', 'settings']) expect(app).toContain("{id: '" + id + "', label:");
  expect(read('web/src/Modes.jsx')).toContain("'do:' + x.id");
});

test('dogfood fixes: each long run keeps its own controller, the chip follows a typed slash, short names on a phone, no cue on touch, card in the flow', () => {
  const app = read('web/src/App.jsx'), m = read('web/src/Modes.jsx');
  expect(app).toContain('longCtl.current.push(ac)');
  expect(app).not.toContain('longCtl.current.abort()');
  expect(app).toContain('const sl = readSlash(value)');
  expect(app).toContain('placeholder={PLACEHOLDER[answer]');
  expect(m).toContain("const SHORT = {fast: 'Quick', ask: 'Ask me', long: 'Take time'}");
  expect(m).toContain('aria-label={m.name}');
  expect(m).not.toContain("position: 'absolute', bottom: 'calc(100% + 8px)'");
});

test('Studio wears the chat look: the address and a message carry light or dark, and the address never changes', async () => {
    const st = await Bun.file(new URL('../web/src/Studio.jsx', import.meta.url)).text();
    expect(st).toContain("scheme === 'earth' ? 'dark'");
    expect(st).toContain("'?embed=1&mode='");
    expect(st).toContain("type: 'mode'");
    expect(st).toContain('src={first.current}');
    const app = await Bun.file(new URL('../web/src/App.jsx', import.meta.url)).text();
    expect(app).toContain('<StudioPanel scheme={scheme}');
});

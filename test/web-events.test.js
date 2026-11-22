import { test, expect } from 'bun:test';
import { applyEv, newTurn, nextSteps, shownText } from '../web/src/events.js';

const feed = (...evs) => evs.reduce(applyEv, newTurn('make a shop'));

test('a build stream becomes ordered steps, a live link and a final answer', () => {
  const t = feed(
    { type: 'pod_starting' }, { type: 'pod_started', provider: 'upstash' },
    { type: 'run', command: 'flisk up' }, { type: 'write', path: 'api/server.js', bytes: 1234 },
    { type: 'share', port: 3000 }, { type: 'output', stdout: 'ok\n', exitCode: 0, live: 'https://x-3000.preview.box.upstash.com' },
    { type: 'pod_kept', days: 7 }, { type: 'delta', text: 'Both ' }, { type: 'delta', text: 'URLs answer' }, { type: 'answer', text: 'Done.' },
  );
  expect(t.steps.map((s) => s.name)).toEqual(['computer', 'run', 'write', 'share', 'computer']);
  expect(t.steps[1].node).toBe('upstash');
  expect(t.steps[2].target).toBe('api/server.js (1,234 characters)');
  expect(t.link).toBe('https://x-3000.preview.box.upstash.com');
  expect(t.kept.days).toBe(7);
  expect(t.steps[4].target).toContain('deleted after 7 days');
  expect(shownText(t)).toBe('Done.');
});

test('a retry drops the half-written text, and a repeated note shows once', () => {
  const t = feed({ type: 'delta', text: 'half' }, { type: 'retry' }, { type: 'note', text: 'a' }, { type: 'note', text: 'a' });
  expect(t.text).toBe('');
  expect(t.steps.length).toBe(1);
});

test('errors keep their kind, and a failed output is flagged', () => {
  const t = feed({ type: 'output', stderr: 'boom', exitCode: 1 }, { type: 'error', error: 'bad key', kind: 'key' });
  expect(t.outs[0]).toEqual({ text: 'boom', bad: true });
  expect(t.error).toEqual({ message: 'bad key', kind: 'key' });
  expect(feed({ type: 'unknown-future-event' }).steps.length).toBe(0);
});

test('the recovery choices match the live page, and the free model never offers its own key', () => {
  expect(nextSteps('key', false)).toEqual(['setup-key', 'wolf']);
  expect(nextSteps('limit', false)).toEqual(['wolf', 'change-provider']);
  expect(nextSteps('busy', false)).toEqual(['retry', 'openrouter', 'discord']);
  expect(nextSteps('key', true)).toEqual(['retry', 'change-model']);
});

test('needcomputer and browser answers are remembered for the caller', () => {
  const t = feed({ type: 'needcomputer' }, { type: 'browseranswer', text: 'x' });
  expect(t.needPod).toBe(true);
  expect(t.browser.text).toBe('x');
});

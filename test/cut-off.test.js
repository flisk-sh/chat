import { expect, test } from 'bun:test';
import { parseAction, runTask } from '../src/loop.js';

// The bakery run of 2026-11-14 (OpenRouter, 4096 tokens): the model's write of a long index.html stopped at the length
// limit. The HTML had no } in it, so the reply was shown as the answer, raw JSON, after 0 steps.
const cut = '{"write": {"path": "~/site/index.html", "content": "<!DOCTYPE html>\\n<html>\\n<body>\\n<section>Fresh bread';

test('an action that never closes is a bad reply, not an answer', () => {
  expect(parseAction(cut).type).toBe('bad');
  expect(parseAction('Here you go: {"run": "ls -la').type).toBe('bad');
  expect(parseAction('The page is live.').type).toBe('say');
});

test('a reply cut at the length limit is retried with "write a smaller file", then the site is published', async () => {
  const files = {};
  const computer = {
    start: async () => ({ status: 201, data: { id: 'p1', provider: 'upstash' } }),
    stop: async () => ({ status: 200, data: {} }),
    run: async () => ({ status: 200, data: { exitCode: 0, stdout: '', stderr: '' } }),
    write: async (id, path, content) => ((files[path] = content), { status: 200, data: {} }),
    read: async (id, path) => (path in files ? { status: 200, data: { encoding: 'utf8', content: files[path] } } : { error: 'No such file' }),
  };
  const page = '<html><body>' + '<section>Fresh bread every morning.</section>'.repeat(40) + '</body></html>';
  const replies = [{ text: cut, cut: true }, { text: JSON.stringify({ write: { path: '~/site/index.html', content: page } }) }, { text: '{"publish": "~/site/index.html"}' }, { text: '{"say": "https://chat.flisk.si/s/x"}' }];
  const seen = [];
  let i = 0;
  const model = async (messages) => (seen.push(messages.at(-1).content), replies[Math.min(i++, replies.length - 1)]);
  const r = await runTask({ task: 'bakery website', model, computer, publish: async () => ({ url: 'https://chat.flisk.si/s/x' }) });
  expect(seen[1]).toContain('cut off');
  expect(seen[1]).toContain('smaller file');
  expect(r.stats.bad).toBe(1);
  expect(Object.keys(files)).toEqual(['~/site/index.html']);
  expect(r.answer).not.toContain('"write"');
});

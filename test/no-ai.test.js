import { describe, expect, test } from 'bun:test';
import { runTask } from '../src/loop.js';
import { explainModelError, FREE_BUSY } from '../src/model.js';
import { answerFromWeb } from '../src/search.js';

const RESULTS = [
  { title: 'JSON', url: 'https://en.wikipedia.org/wiki/JSON', snippet: 'JSON is an open standard file format and data interchange format.', source: 'wikipedia' },
  { title: 'JSON-RPC', url: 'https://en.wikipedia.org/wiki/JSON-RPC', snippet: 'A remote procedure call protocol encoded in JSON.', source: 'wikipedia' },
];
const busy = async () => ({ error: FREE_BUSY, kind: 'busy' });
const computer = () => ({ calls: [], start: async function () { this.calls.push('start'); return { data: { id: 'p', provider: 'x' } }; }, run: async () => ({ data: { stdout: '', stderr: '', exitCode: 0 } }), stop: async () => ({ status: 200 }) });

describe('no AI available: the web answers', () => {
  test('Search mode: every model busy, so the answer is the best results with sources, not an error', async () => {
    const ev = [];
    const c = computer();
    const r = await runTask({ task: 'who is json?', mode: 'search', wait: async () => { throw new Error('must not wait when the web has an answer'); }, model: busy, computer: c, search: async () => ({ results: RESULTS }), emit: (e) => ev.push(e) });
    expect(r.error).toBeNull();
    expect(r.answer).toContain('JSON is an open standard file format');
    expect(r.answer).toContain('[1] [JSON](https://en.wikipedia.org/wiki/JSON)');
    expect(r.answer).toContain('free AI is busy');
    expect(ev.some((e) => e.type === 'error')).toBe(false);
    expect(ev.find((e) => e.type === 'answer').text).toBe(r.answer);
    expect(c.calls).toEqual([]);
  });

  test('a plain question in Chat mode searches the web when no AI is available', async () => {
    let asked = 0;
    const r = await runTask({ task: 'who invented the JSON format?', mode: 'chat', wait: async () => {}, model: busy, computer: computer(), search: async () => { asked++; return { results: RESULTS }; } });
    expect(asked).toBe(1);
    expect(r.answer).toContain('**Sources**');
  });

  test('it does not pretend: nothing found, a build task, or a non-busy error all keep the real error', async () => {
    const none = await runTask({ task: 'who invented the JSON format?', mode: 'chat', wait: async () => {}, model: busy, computer: computer(), search: async () => ({ error: 'no web results' }) });
    expect(none.answer).toBeNull();
    expect(none.error).toBe(FREE_BUSY);
    let n = 0;
    const build = await runTask({ task: 'build me a coffee shop website', mode: 'chat', wait: async () => {}, model: busy, computer: computer(), search: async () => { n++; return { results: RESULTS }; } });
    expect(build.error).toBe(FREE_BUSY);
    expect(n).toBe(0);
    const badKey = await runTask({ task: 'who is json?', mode: 'search', model: async () => ({ error: 'key refused', kind: 'key' }), computer: computer(), search: async () => ({ results: RESULTS }) });
    expect(badKey.error).toBe('key refused');
  });

  test('answerFromWeb cites every source and keeps to the top three snippets', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ title: `T${i}`, url: `https://x.test/${i}`, snippet: `snippet ${i}` }));
    const t = answerFromWeb(many);
    expect(t).toContain('snippet 2');
    expect(t).not.toContain('snippet 3');
    expect(t).toContain('[6] [T5](https://x.test/5)');
  });
});

describe('a region block is not a bad key', () => {
  test('"This model is not available in your region" (403) is a model problem, so the chain tries the next model', () => {
    const r = explainModelError({ error: { code: 403, message: 'This model is not available in your region.' } }, 403, { ai: 'openrouter', model: 'openrouter/free' });
    expect(r.kind).toBe('model');
    expect(r.error).not.toContain('API key was refused');
  });
  test('a real bad key is still a key problem', () => {
    expect(explainModelError({ error: { code: 401, message: 'Invalid API key' } }, 401, { ai: 'openrouter' }).kind).toBe('key');
  });
});

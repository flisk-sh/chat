import { describe, expect, test } from 'bun:test';
import { readAiStream } from '../src/say-stream.js';

// A stream of "data: ..." lines, split into awkward chunks.
const streamOf = (lines) => {
  const bytes = new TextEncoder().encode(lines.map((l) => `data: ${l}\n\n`).join(''));
  return new ReadableStream({ start(c) { for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7)); c.close(); } });
};

describe('readAiStream keeps numbers', () => {
  test('Workers AI sends a digit-only token as a JSON number: it must not be dropped', async () => {
    const got = [];
    const text = await readAiStream(streamOf(['{"response":"Argentina won the "}', '{"response":2022}', '{"response":" final on "}', '{"response":18}', '{"response":" December [", "p":"x"}', '{"response":1}', '{"response":"]."}', '[DONE]']), (d) => got.push(d));
    expect(text).toBe('Argentina won the 2022 final on 18 December [1].');
    expect(got.join('')).toBe(text);
  });

  test('OpenAI-style deltas still work, and a zero or empty token is handled', async () => {
    const text = await readAiStream(streamOf(['{"choices":[{"delta":{"content":"margin: "}}]}', '{"response":0}', '{"choices":[{"delta":{"content":" auto"}}]}', '{"response":""}', '{"response":null}', '[DONE]']));
    expect(text).toBe('margin: 0 auto');
  });
});

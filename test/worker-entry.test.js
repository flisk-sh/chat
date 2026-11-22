import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';
import * as entry from '../src/worker.js';
import app from '../src/index.js';

test('the Worker entry exports only the handler, so wrangler dev can start', () => {
  expect(Object.keys(entry)).toEqual(['default']);
  expect(entry.default).toBe(app);
  expect(readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8')).toMatch(/^main = "src\/worker\.js"$/m);
});

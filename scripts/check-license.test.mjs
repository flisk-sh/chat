import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const license = readFileSync(new URL('../LICENSE', import.meta.url), 'utf8');

test('package.json declares the SPDX identifier in LICENSE', () => {
  const spdx = /^([A-Za-z0-9.+-]+) License/.exec(license)?.[1];
  assert.equal(spdx, 'MIT');
  assert.equal(pkg.license, spdx);
});

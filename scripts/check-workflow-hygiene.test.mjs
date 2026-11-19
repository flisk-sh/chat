import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findWorkflowProblems } from './check-workflow-hygiene.mjs';

test('the real workflow has a timeout on every job and SHA-pinned actions', () => {
  const source = readFileSync(new URL('../.github/workflows/check.yml', import.meta.url), 'utf8');
  assert.deepEqual(findWorkflowProblems(source), []);
});

test('flags jobs without a timeout', () => {
  const source = `jobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n`;
  const problems = findWorkflowProblems(source, 'x.yml');
  assert.deepEqual(problems, ['x.yml:2 job "check" has no timeout-minutes']);
});

test('flags mutable tags and missing version comments', () => {
  const source = `jobs:\n  check:\n    timeout-minutes: 10\n    steps:\n      - uses: actions/checkout@v4\n      - uses: oven-sh/setup-bun@0123456789abcdef0123456789abcdef01234567\n`;
  const problems = findWorkflowProblems(source, 'x.yml');
  assert.equal(problems.length, 3);
  assert.match(problems[0], /not pinned to a 40-character SHA/);
  assert.match(problems[1], /no version comment/);
  assert.match(problems[2], /no version comment/);
});

test('accepts SHA pins with a tag comment', () => {
  const source = `jobs:\n  check:\n    timeout-minutes: 10\n    steps:\n      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4\n`;
  assert.deepEqual(findWorkflowProblems(source, 'x.yml'), []);
});

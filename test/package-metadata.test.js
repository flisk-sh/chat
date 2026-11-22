import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

describe('package metadata', () => {
  test('declares a supported Node.js version', () => {
    expect(packageJson.engines?.node).toBe('>=20');
  });

  test('declares a description and repository', () => {
    expect(packageJson.description?.trim()).not.toBe('');
    expect(packageJson.repository).toEqual({
      type: 'git',
      url: 'git+https://github.com/flisk-sh/chat.git',
    });
  });
});

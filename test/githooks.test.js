import { describe, expect, it } from 'bun:test';
import { readFileSync, statSync } from 'node:fs';

describe('committed git hooks', () => {
  it('ships pre-commit and pre-push and wires them on install', () => {
    for (const h of ['pre-commit', 'pre-push']) expect(statSync(`.githooks/${h}`).mode & 0o111).toBeTruthy();
    expect(readFileSync('.githooks/pre-commit', 'utf8')).toContain('check-radius');
    expect(readFileSync('.githooks/pre-push', 'utf8')).toContain('bun test');
    expect(JSON.parse(readFileSync('package.json', 'utf8')).scripts.prepare).toContain('core.hooksPath .githooks');
  });
});

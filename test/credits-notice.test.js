import { test, expect } from 'bun:test';
import { creditsNotice } from '../src/credits-notice.js';

test('no notice without a balance or with credits to spare', () => {
  expect(creditsNotice(null)).toBe('');
  expect(creditsNotice({ total: 100, left: 50 })).toBe('');
});

test('low credits shows the BYOK path and the beta top-up', () => {
  const html = creditsNotice({ total: 100, left: 10 });
  expect(html).toContain('Running low on credits');
  expect(html).toContain('Use my own key (BYOK)');
  expect(html).toContain('Top up credits');
  expect(html).toContain('(beta)');
  expect(html).not.toContain('Out of credits');
});

test('empty credits says out of credits', () => {
  expect(creditsNotice({ total: 100, left: 0 })).toContain('Out of credits');
});

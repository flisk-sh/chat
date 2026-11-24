import { describe, expect, test } from 'bun:test';
import { embedCsp, chatPage } from '../src/app-page.js';

describe('the chat as a window inside Grow (/embed)', () => {
  test('only grow.flisk.si and analytics may frame it', () => {
    const csp = embedCsp("default-src 'none'; frame-ancestors https://analytics.flisk.si; base-uri 'none'");
    expect(csp).toContain('frame-ancestors https://grow.flisk.si https://analytics.flisk.si');
    expect(csp).not.toMatch(/frame-ancestors[^;]*\*/);
    expect(csp).toContain("base-uri 'none'");
  });

  test('the embedded page has no bar and no Earth, and says it is embedded', () => {
    const t = chatPage({ embed: true, theme: 'system' });
    expect(t).toContain('"embed":true');
    expect(t).not.toContain('assets/bar.js');
    expect(t).not.toContain('id="earth"');
  });

  test('the normal page keeps its bar and Earth', () => {
    const t = chatPage({});
    expect(t).toContain('assets/bar.js');
    expect(t).toContain('id="earth"');
    expect(t).toContain('"embed":false');
  });
});

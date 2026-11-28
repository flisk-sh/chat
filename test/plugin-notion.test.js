import { describe, expect, it } from 'bun:test';
import { parseNotionCommand } from '../src/plugin-notion.js';

describe('parseNotionCommand', () => {
  it('parses notion search and page creation', () => {
    expect(parseNotionCommand('search notion for onboarding')).toEqual({ cmd: 'search-notion', query: 'onboarding' });
    expect(parseNotionCommand('create a notion page titled Q4 Goals')).toEqual({ cmd: 'create-page', title: 'q4 goals' });
  });

  it('ignores questions and code requests', () => {
    expect(parseNotionCommand('how do I use notion')).toBeNull();
    expect(parseNotionCommand('write a script for notion api')).toBeNull();
  });
});

import { describe, expect, it } from 'bun:test';
import { parseSlackCommand } from '../src/plugin-slack.js';

describe('parseSlackCommand', () => {
  it('parses post and search commands', () => {
    expect(parseSlackCommand('post deploy done to slack #general')).toEqual({ cmd: 'post-message', channel: 'general', message: 'deploy done' });
    expect(parseSlackCommand('search slack for release notes')).toEqual({ cmd: 'search-slack', query: 'release notes' });
  });

  it('ignores questions and code requests', () => {
    expect(parseSlackCommand('how do I post to slack')).toBeNull();
    expect(parseSlackCommand('write a script for slack webhook')).toBeNull();
  });
});

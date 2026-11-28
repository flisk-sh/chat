import { describe, expect, it } from 'bun:test';
import { parseGithubPluginCommand } from '../src/plugin-github.js';

describe('parseGithubPluginCommand', () => {
  it('parses PR and issue lookups', () => {
    expect(parseGithubPluginCommand('check github pr #42')).toEqual({ cmd: 'get-pr', number: 42 });
    expect(parseGithubPluginCommand('open issue 12')).toEqual({ cmd: 'get-issue', number: 12 });
  });

  it('ignores questions and code requests', () => {
    expect(parseGithubPluginCommand('how do I open a github pr')).toBeNull();
    expect(parseGithubPluginCommand('write a script for github api')).toBeNull();
  });
});

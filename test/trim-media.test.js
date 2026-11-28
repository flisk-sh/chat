import { describe, expect, it } from 'bun:test';
import { parseTrimMediaCommand } from '../src/trim-media.js';

describe('parseTrimMediaCommand', () => {
  it('parses trim commands with timestamps', () => {
    expect(parseTrimMediaCommand('trim this video from 2s to 10s')).toEqual({ cmd: 'trim-media', start: '2s', end: '10s' });
    expect(parseTrimMediaCommand('cut this gif')).toEqual({ cmd: 'trim-media', start: null, end: null });
  });

  it('ignores questions and code requests', () => {
    expect(parseTrimMediaCommand('how do I trim a video')).toBeNull();
    expect(parseTrimMediaCommand('write a script to trim gif')).toBeNull();
  });
});

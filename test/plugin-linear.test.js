import { describe, expect, it } from 'bun:test';
import { parseLinearCommand } from '../src/plugin-linear.js';

describe('parseLinearCommand', () => {
  it('parses issue lookup', () => {
    expect(parseLinearCommand('open linear issue ENG-42')).toEqual({ cmd: 'get-issue', key: 'ENG-42' });
  });

  it('parses issue creation', () => {
    expect(parseLinearCommand('create a linear issue for login timeout')).toEqual({ cmd: 'create-issue', title: 'login timeout' });
  });

  it('ignores questions and code requests', () => {
    expect(parseLinearCommand('how do I use linear')).toBeNull();
    expect(parseLinearCommand('write a script for linear api')).toBeNull();
  });
});

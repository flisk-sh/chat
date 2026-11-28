import { describe, expect, it } from 'bun:test';
import { parseBlurEraseCommand } from '../src/blur-erase.js';

describe('parseBlurEraseCommand', () => {
  it('parses blur commands', () => {
    expect(parseBlurEraseCommand('blur the license plate in this photo')).toEqual({ cmd: 'blur', target: 'license plate' });
    expect(parseBlurEraseCommand('blur faces')).toEqual({ cmd: 'blur', target: 'faces' });
  });

  it('parses erase commands', () => {
    expect(parseBlurEraseCommand('erase the photobomber from this image')).toEqual({ cmd: 'erase', target: 'photobomber' });
  });

  it('ignores questions and code requests', () => {
    expect(parseBlurEraseCommand('how do I blur a face')).toBeNull();
    expect(parseBlurEraseCommand('write a script to blur faces')).toBeNull();
  });
});

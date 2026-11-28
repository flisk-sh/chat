import { describe, expect, it } from 'bun:test';
import { parseUpscaleCommand } from '../src/upscale.js';

describe('parseUpscaleCommand', () => {
  it('parses upscale commands with optional scale', () => {
    expect(parseUpscaleCommand('upscale this photo')).toEqual({ cmd: 'upscale', scale: 2 });
    expect(parseUpscaleCommand('upscale this image 4x')).toEqual({ cmd: 'upscale', scale: 4 });
  });

  it('ignores questions and code requests', () => {
    expect(parseUpscaleCommand('how do I upscale a photo')).toBeNull();
    expect(parseUpscaleCommand('write a script to upscale images')).toBeNull();
  });
});

import { describe, expect, it } from 'bun:test';
import { parsePhotoToPdfCommand } from '../src/photo-to-pdf.js';

describe('parsePhotoToPdfCommand', () => {
  it('parses photo to pdf commands', () => {
    expect(parsePhotoToPdfCommand('convert this photo to pdf')).toEqual({ cmd: 'photo-to-pdf' });
    expect(parsePhotoToPdfCommand('turn these images into a pdf')).toEqual({ cmd: 'photo-to-pdf' });
    expect(parsePhotoToPdfCommand('photo to pdf')).toEqual({ cmd: 'photo-to-pdf' });
  });

  it('ignores questions and code requests', () => {
    expect(parsePhotoToPdfCommand('how do I convert photo to pdf')).toBeNull();
    expect(parsePhotoToPdfCommand('write a script to convert photo to pdf')).toBeNull();
  });
});

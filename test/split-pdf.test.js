import { describe, expect, it } from 'bun:test';
import { parseSplitPdfCommand } from '../src/split-pdf.js';

describe('parseSplitPdfCommand', () => {
  it('parses page range extraction', () => {
    expect(parseSplitPdfCommand('extract pages 2 to 5 from this pdf')).toEqual({ cmd: 'extract-range', start: 2, end: 5 });
    expect(parseSplitPdfCommand('split pages 1-3')).toEqual({ cmd: 'extract-range', start: 1, end: 3 });
  });

  it('parses split all pages', () => {
    expect(parseSplitPdfCommand('split this pdf into pages')).toEqual({ cmd: 'split-all' });
  });

  it('ignores questions and code requests', () => {
    expect(parseSplitPdfCommand('how do I split a pdf')).toBeNull();
    expect(parseSplitPdfCommand('write a python script to split pdf')).toBeNull();
  });
});

import { describe, expect, it } from 'bun:test';
import { parseReorderPdfCommand } from '../src/reorder-pdf.js';

describe('parseReorderPdfCommand', () => {
  it('parses delete page commands', () => {
    expect(parseReorderPdfCommand('delete page 3')).toEqual({ cmd: 'delete-pages', pages: [3] });
    expect(parseReorderPdfCommand('remove pages 1, 4 from this pdf')).toEqual({ cmd: 'delete-pages', pages: [1, 4] });
  });

  it('parses reorder page commands', () => {
    expect(parseReorderPdfCommand('reorder pages 3, 1, 2')).toEqual({ cmd: 'reorder-pages', order: [3, 1, 2] });
  });

  it('ignores non-matching or question prompts', () => {
    expect(parseReorderPdfCommand('how do I delete page 3')).toBeNull();
    expect(parseReorderPdfCommand('write a script to delete page 3')).toBeNull();
  });
});

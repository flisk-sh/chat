import { describe, expect, it } from 'bun:test';
import { parseGdriveCommand } from '../src/plugin-gdrive.js';

describe('parseGdriveCommand', () => {
  it('parses drive search and open commands', () => {
    expect(parseGdriveCommand('search google drive for Q4 budget')).toEqual({ cmd: 'search-drive', query: 'q4 budget' });
    expect(parseGdriveCommand('open drive file roadmap.pdf')).toEqual({ cmd: 'open-file', target: 'roadmap pdf' });
  });

  it('ignores questions and code requests', () => {
    expect(parseGdriveCommand('how do I search google drive')).toBeNull();
    expect(parseGdriveCommand('write a script for google drive api')).toBeNull();
  });
});

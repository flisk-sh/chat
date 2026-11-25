import { describe, expect, test } from 'bun:test';
import { parseStudioCommand } from '../web/src/studio-commands.js';
import { appCsp, STUDIO_ORIGIN } from '../src/app-page.js';
import catalog from '../plugins/catalog.json';

describe('Studio voice and typed commands', () => {
  test.each(['remove the background', 'Remove the background.', 'please remove background', 'cut out the subject', 'get rid of the backdrop', 'erase the background from this'])('"%s" removes the background', (t) => {
    expect(parseStudioCommand(t)).toEqual({ cmd: 'removeBackground' });
  });
  test.each([['crop to square', '1:1'], ['crop this to 16:9', '16:9'], ['crop it four by three', '4:3'], ['crop to 9 by 16', '9:16'], ['crop this', null]])('"%s" crops (%s)', (t, ratio) => {
    expect(parseStudioCommand(t)).toEqual({ cmd: 'crop', ratio });
  });
  test.each(['what is the weather', 'build me a shop', 'write a story about a crop circle in a very long sentence that goes on and on and on and on and on and on', '', null])('%p is left to the chat', (t) => {
    expect(parseStudioCommand(t)).toBeNull();
  });
  test('the catalog lists both as ready, with phrases the parser understands', () => {
    for (const [id, cmd] of [['studio.remove-background', 'removeBackground'], ['studio.crop', 'crop']]) {
      const p = catalog.plugins.find((x) => x.id === id);
      expect(p.status).toBe('ready');
      for (const v of p.voice) expect(parseStudioCommand(v)?.cmd).toBe(cmd);
    }
  });
  test('the new app may frame studio.flisk.si, and only that besides itself and inference', () => {
    const csp = appCsp("default-src 'none'; frame-src 'self' https://inf.test; script-src 'unsafe-inline'");
    expect(csp.match(/frame-src [^;]*/)[0]).toBe(`frame-src 'self' ${STUDIO_ORIGIN} https://inf.test`);
  });
});

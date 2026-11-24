// The plugin catalog: 50 plugins, each either ready or coming soon, so the picker never offers something that is not there.
import { describe, expect, test } from 'bun:test';
import catalog from '../plugins/catalog.json';

const list = catalog.plugins;
describe('plugin catalog', () => {
  test('has 50 plugins with unique ids', () => {
    expect(list).toHaveLength(50);
    expect(new Set(list.map((p) => p.id)).size).toBe(50);
  });
  test('every plugin has a title, a group, a status, an owner and a voice phrase', () => {
    for (const p of list) {
      expect(p.title.length).toBeGreaterThan(2);
      expect(p.group.length).toBeGreaterThan(2);
      expect(['ready', 'soon']).toContain(p.status);
      expect(['flisk', 'third-party']).toContain(p.owner);
      expect(p.voice.length).toBeGreaterThan(0);
    }
  });
  test('most plugins are in-house', () => {
    expect(list.filter((p) => p.owner === 'flisk').length).toBeGreaterThanOrEqual(40);
  });
  test('the Studio tools are ready', () => {
    for (const id of ['remove-background', 'crop', 'rotate-flip', 'adjust', 'resize', 'text', 'photo-batch', 'merge-pdf', 'shrink-pdf', 'watermark-pdf'])
      expect(list.find((p) => p.id === 'studio.' + id).status).toBe('ready');
  });
});

describe('plugin picker', () => {
  test('the + menu opens the plugin picker, which reads the catalog', async () => {
    const app = await Bun.file(new URL('../web/src/App.jsx', import.meta.url)).text();
    expect(app).toContain("label: 'Plugins'");
    expect(app).toContain('<PluginsDialog');
    const dlg = await Bun.file(new URL('../web/src/Plugins.jsx', import.meta.url)).text();
    expect(dlg).toContain('plugins/catalog.json');
  });
  test('the menu text names the real counts', async () => {
    const app = await Bun.file(new URL('../web/src/App.jsx', import.meta.url)).text();
    expect(app).toContain(`${list.length} plugins, ${list.filter((p) => p.status === 'ready').length} ready`);
  });
});

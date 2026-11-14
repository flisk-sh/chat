import { describe, expect, test } from 'bun:test';
import { appPage } from '../src/page.js';
import { inlineLocal, runTask, SYSTEM } from '../src/loop.js';

const scripted = (...texts) => { let i = 0; return async () => ({ text: texts[Math.min(i++, texts.length - 1)] }); };
const disk = (files) => async (path) => (path in files ? { status: 200, data: { encoding: 'utf8', content: files[path] } } : { error: `No such file: ${path}` });

describe('a site written as separate files is published as one page', () => {
  test('stylesheets and scripts next to the page are put into it; other links stay', async () => {
    const html = '<html><head><link rel="stylesheet" href="styles.css"><link rel="icon" href="icon.png"><link rel="stylesheet" href="https://fonts.example/x.css"><script src="app.js" defer></script></head><body><h1>Hearth</h1></body></html>';
    const r = await inlineLocal(html, '~/site/index.html', disk({ '~/site/styles.css': 'h1{color:red}', '~/site/app.js': 'go("</script>")' }));
    expect(r.missing).toEqual([]);
    expect(r.html).toContain('<style>\nh1{color:red}\n</style>');
    expect(r.html).toContain('<link rel="icon" href="icon.png">');
    expect(r.html).toContain('https://fonts.example/x.css');
    expect(r.html).not.toContain('src="app.js"');
    // The deferred script runs after the page, as it would have: it moves to the end of the body.
    expect(r.html).toMatch(/<h1>Hearth<\/h1><script>\ngo\("<\\\/script>"\)\n<\/script>\n<\/body>/);
  });

  test('a module script stays where it is, with its type', async () => {
    const r = await inlineLocal('<head><script type="module" src="./js/main.js"></script></head>', 'site/index.html', disk({ 'site/js/main.js': 'x()' }));
    expect(r.html).toBe('<head><script type="module">\nx()\n</script></head>');
  });

  test('a linked file that is not there is reported', async () => {
    const r = await inlineLocal('<link rel="stylesheet" href="styles.css">', '~/site/index.html', disk({}));
    expect(r.missing).toEqual(['styles.css']);
  });

  test('bakery replay (2026-11-14): index.html, styles.css and app.js published as one page, no Flisk', async () => {
    const files = {};
    const computer = {
      start: async () => ({ status: 201, data: { id: 'p1', provider: 'upstash' } }),
      stop: async () => ({ status: 200, data: {} }),
      run: async () => ({ status: 200, data: { exitCode: 0, stdout: '', stderr: '' } }),
      write: async (id, path, content) => ((files[path] = content), { status: 200, data: {} }),
      read: async (id, path) => disk(files)(path),
    };
    const page = '<html><head><link rel="stylesheet" href="styles.css"></head><body><h1>Hearth &amp; Crumb</h1>' + '<section>Fresh bread every morning.</section>'.repeat(40) + '<script src="app.js"></script></body></html>';
    const model = scripted(
      JSON.stringify({ write: { path: '~/site/index.html', content: page } }),
      JSON.stringify({ write: { path: '~/site/styles.css', content: 'body{font-family:system-ui}' } }),
      JSON.stringify({ write: { path: '~/site/app.js', content: 'document.title="Hearth"' } }),
      '{"publish": "~/site/index.html"}',
      '{"say": "https://chat.flisk.si/s/x"}',
    );
    const published = [];
    const r = await runTask({ task: 'bakery website with many sections, as separate files (index.html, styles.css, app.js)', model, computer, publish: async (html) => (published.push(html), { url: 'https://chat.flisk.si/s/x' }) });
    expect(r.stats.errors).toBe(0);
    expect(published).toHaveLength(1);
    expect(published[0]).toContain('body{font-family:system-ui}');
    expect(published[0]).toContain('document.title="Hearth"');
    expect(published[0]).not.toContain('href="styles.css"');
  });
});

describe('the recipe names where the files go', () => {
  test('a Flisk website keeps the scaffold layout: index.html, src/style.css, src/main.ts', () => {
    expect(SYSTEM).toContain('<script type="module" src="/src/main.ts"></script>');
    expect(SYSTEM).toContain('href="/src/style.css"');
    expect(SYSTEM).toContain('never copy a file to a second place');
  });

  test('"What: A website" is a show-only page, never a Flisk app', () => {
    expect(SYSTEM).toContain('When the answers say "What: A website", it is a show-only website');
  });
});

describe('the "What" guess from the request', () => {
  const page = appPage({ login: 'x' });
  const line = page.match(/const kind=(.*?);\n/)[1];
  const guess = new Function('task', `return ${line};`);

  test('a file name such as app.js does not make a website "A small app" (bakery, 2026-11-14)', () => {
    expect(guess('bakery website with many sections, as separate files (index.html, styles.css, app.js)')).toBe('A website');
  });

  test('a real app is still an app', () => {
    expect(guess('Build a tip calculator web page with a dark theme.')).toBe('A small app');
    expect(guess('a booking app for my salon')).toBe('A small app');
  });
});

import { expect, test } from 'bun:test';
import { homePage, messagePage } from '../src/page';
import { indexHtml } from '../src/system';

const skip = '<a class="skip-link" href="#main">Skip to content</a>';

test('the shared shell puts the skip link first in the body', () => {
  for (const html of [homePage(), messagePage('Error', 'Text')]) {
    expect(html).toContain(`<body>${skip}`);
    expect(html.indexOf(skip)).toBeLessThan(html.indexOf('<main id="main"'));
  }
});

test('the system page puts the skip link before its navigation', () => {
  const html = indexHtml({ title: 'System', services: [] });
  expect(html).toContain(`<body>\n${skip}`);
  expect(html.indexOf(skip)).toBeLessThan(html.indexOf('<header>'));
  expect(html).toContain('<main class="wrap" id="main">');
});

test('skip links are hidden until focused', () => {
  for (const html of [homePage(), indexHtml({ title: 'System', services: [] })]) {
    expect(html).toContain('.skip-link{position:absolute;left:-9999px');
    expect(html).toContain('.skip-link:focus{left:12px;top:12px');
  }
});

import { describe, expect, it } from 'bun:test';
import { appPage } from '../src/page.js';

// Pull the page's own inline formatter out of the served HTML and run it on a tiny DOM stub.
function render(s) {
  const html = String(appPage({ login: 'x' }));
  const start = html.indexOf('const inl=');
  const src = html.slice(start, html.indexOf('const LI=', start));
  const mk = (tag) => ({ tag, kids: [], attrs: {}, appendChild(c) { this.kids.push(c); }, set textContent(v) { this.text = v; } });
  const document = { createElement: mk, createTextNode: (t) => ({ tag: '#text', text: t }) };
  const node = (tag, _c, t) => ({ tag, text: t });
  const inl = new Function('document', 'node', `${src}; return inl;`)(document, node);
  const p = mk('p');
  inl(p, s);
  return p.kids;
}

describe('inline links in chat answers', () => {
  it('renders a normal [title](url) as a link', () => {
    const k = render('- [Big news](https://www.bbc.co.uk/news/a1)');
    const a = k.find((n) => n.tag === 'a');
    expect(a.href).toBe('https://www.bbc.co.uk/news/a1');
    expect(a.text).toBe('Big news');
  });
  it('renders the model\'s [title]](url) slip as a clean link', () => {
    const k = render("- [Holly Humberstone: My music was 'too polished']](https://www.bbc.co.uk/news/articles/c0x)");
    const a = k.find((n) => n.tag === 'a');
    expect(a?.href).toBe('https://www.bbc.co.uk/news/articles/c0x');
    expect(a?.text).toBe("Holly Humberstone: My music was 'too polished'");
    expect(k.some((n) => n.tag === '#text' && n.text.includes(']'))).toBe(false);
  });
});

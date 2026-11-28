import { describe, expect, test } from 'bun:test';
import { appPage } from '../src/page.js';

// The Advanced search icon on search.flisk.si and maps.flisk.si links to /?mode=search&q=<question>.
// Run the page's mode block against a tiny fake page and check what the visitor sees.
const html = appPage({ login: 'anon-x', anon: true });
const start = html.indexOf('{const MODE={chat');
const end = html.indexOf('\n', html.indexOf('window.history.replaceState', start));
const block = html.slice(start, end);

function open(search, { stored = null, typed = '' } = {}) {
  const buttons = ['chat', 'build', 'create', 'search', 'computer'].map((m) => ({ dataset: { mode: m }, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }));
  const events = [];
  const task = { value: typed, placeholder: '', focused: false, sel: null, dispatchEvent: (e) => events.push(e.type), focus() { this.focused = true; }, setSelectionRange(a, b) { this.sel = [a, b]; } };
  const store = new Map(stored ? [['chat_mode', stored]] : []);
  const replaced = [];
  const env = {
    // The page has its own `history` (the conversation list), so the address must be changed through window.history.
    window: { history: { state: null, replaceState: (s, t, u) => replaced.push(u) } },
    location: { search, pathname: '/', hash: '' },
    history: [],
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    document: { querySelectorAll: () => buttons, querySelector: () => null, getElementById: (id) => (id === 'task' ? task : null) },
    MutationObserver: class {},
    Event: class { constructor(type) { this.type = type; } },
  };
  new Function(...Object.keys(env), block)(...Object.values(env));
  const mode = buttons.find((b) => b.attrs['aria-checked'] === 'true')?.dataset.mode;
  return { mode, task, events, replaced, stored: store.get('chat_mode') };
}

describe('a link opens chat with the question typed', () => {
  test('the block was found in the page', () => {
    expect(start).toBeGreaterThan(0);
    expect(block).toContain("lq.get('mode')");
  });

  test('?mode=search&q= picks Search and puts the question in the box, not sent', () => {
    const r = open('?mode=search&q=coffee%20near%20Ljubljana');
    expect(r.mode).toBe('search');
    expect(r.task.value).toBe('coffee near Ljubljana');
    expect(r.task.focused).toBe(true);
    expect(r.task.sel).toEqual([21, 21]);
    expect(r.events).toEqual(['input']);
    expect(r.replaced).toEqual(['/']);
  });

  test('other address parameters stay', () => {
    expect(open('?mode=search&q=x&flisk_theme=dark').replaced).toEqual(['/?flisk_theme=dark']);
  });

  test('an unknown mode keeps the saved one', () => {
    expect(open('?mode=rocket&q=hi', { stored: 'build' }).mode).toBe('build');
  });

  test('no parameters: the saved mode, an empty box and the address untouched', () => {
    const r = open('', { stored: 'create' });
    expect(r.mode).toBe('create');
    expect(r.task.value).toBe('');
    expect(r.replaced).toEqual([]);
  });

  test('what the visitor already typed is not overwritten', () => {
    expect(open('?q=new', { typed: 'mine' }).task.value).toBe('mine');
  });

  test('control characters become spaces and the question is capped at the box size', () => {
    expect(open('?q=a%00b%0Ac').task.value).toBe('a b\nc');
    expect(open(`?q=${'x'.repeat(7000)}`).task.value).toHaveLength(6000);
  });
});

import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';
import { KEYBOARD_FIT, appPage } from '../src/page.js';

const page = appPage({ login: 'ann', connected: [] });

test('the phone sidebar opens under the flisk bar, not behind it', () => {
  expect(page).toContain("$('sideopen').onclick=()=>{const fb=document.querySelector('flisk-bar'),t=fb?Math.max(0,fb.getBoundingClientRect().bottom):0;side.style.top=t+'px';side.classList.add('open');};");
});

test('on a phone the mic stays beside send when the box buttons wrap', () => {
  const phone = page.slice(page.indexOf('@media (max-width:860px)'));
  expect(phone).toContain('.composer .bar #mic{margin-left:auto}.composer .bar #mic:not([hidden])+.send{margin-left:6px}');
});

test('touch screens never get a text field under 16px (iPhone Safari zooms the page on focus)', () => {
  expect(page).toContain('@media (pointer:coarse){input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]),textarea,select{font-size:16px!important}}');
});

// Runs the keyboard fit against a fake iPhone: 844px tall page, keyboard leaves 553px visible.
function runFit(src, { height = 553, scale = 1 } = {}) {
  const listeners = {};
  const classes = new Set();
  const body = { style: {} };
  const vv = { height: 844, scale: 1, offsetTop: 0, addEventListener: (e, f) => { listeners[e] = f; } };
  const document = { body, documentElement: { clientHeight: 844, classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) } } };
  new Function('window', 'document', src)({ visualViewport: vv }, document);
  Object.assign(vv, { height, scale, offsetTop: 40 });
  listeners.resize();
  return { body, classes };
}

test('keyboard open on an iPhone: the body is pinned to the visible part of the screen', () => {
  const { body, classes } = runFit(KEYBOARD_FIT);
  expect(classes.has('kbopen')).toBe(true);
  expect(body.style).toEqual({ position: 'fixed', top: '40px', left: '0', right: '0', height: '553px' });
});

test('pinch zoom is not mistaken for the keyboard', () => {
  const { body, classes } = runFit(KEYBOARD_FIT, { height: 400, scale: 2 });
  expect(classes.has('kbopen')).toBe(false);
  expect(body.style.position).toBe('');
});

test('every page carries the keyboard fit and hides the top bar while typing on a phone', () => {
  expect(page).toContain(`<script>${KEYBOARD_FIT}`);
  expect(page).toContain('html.kbopen flisk-bar,html.kbopen .top{display:none!important}');
});

test('on a phone the sidebar drawer is opaque on the Earth home (the page text must not show through it)', () => {
  expect(page).toContain('@media (max-width:860px){html[data-theme=earth].home .side{background:#0b0b0c;backdrop-filter:none}}');
});

test('touch screens get 44px tap targets on the box buttons, menu button and mode switch', () => {
  expect(page).toContain('@media (pointer:coarse){.iconbtn,.chip,.md,#mic,.excta>button{min-height:44px;min-width:44px}.composer .send{width:44px;height:44px}#newchat{min-height:44px}');
});

test('phone composer keeps only + , mic and send; modes and model move into the + menu', () => {
  expect(page).toContain("pm.prepend(md);pm.insertBefore(mp,md.nextSibling)");
  expect(page).toContain('.plusmenu .modes{display:flex;flex:none;width:100%');
});

test('generated pictures reserve a square and keep their top in view when they load', () => {
  expect(page).toContain('.gimg img{aspect-ratio:1/1');
  expect(page).toContain("turn.scrollIntoView({block:'start'})");
  expect(page).not.toContain("im.onload=()=>{f.scrollIntoView");
  expect(page).not.toContain('im.onload=down');
});

test('the shared top bar never makes the page wider and never clips its menus', () => {
  expect(page).toContain('flisk-bar{display:block;max-width:100vw;overflow-x:clip}');
});

test('the API key form stacks Save and Remove as full-width 44px buttons on phones', () => {
  expect(page).toContain('#byo .bystat{flex-direction:column;align-items:stretch');
  expect(page).toContain('#byo .byacts button{flex:1;height:44px');
  expect(page).not.toContain('.plusmenu:has(#mppop:not([hidden]))>:not(.mp){display:none}');
});

test('Earth pills stay readable over the globe and the picker focus never scrolls the page', () => {
  const page = appPage({ login: 'ann', connected: [] });
  expect(page).toContain('html[data-theme=earth] .excta button:not(:first-child):not([aria-expanded=true]){background:rgba(8,8,10,.82)');
  expect(page).toContain('mq.focus({preventScroll:true})');
});

test('phone + menu is a bottom sheet, the plus glyph is centered, key buttons are centered', () => {
  const pg = appPage({ login: 'ann', connected: [] });
  expect(pg).toContain('html.plus .plusmenu{position:fixed!important');
  expect(pg).toContain('html.plus .composer{backdrop-filter:none!important');
  expect(pg).toContain('html.plus .plusmenu #mppop{position:static!important');
  expect(pg).toContain('#plus{display:inline-flex;align-items:center;justify-content:center;padding:0}');
  expect(pg).toContain('e.target.isConnected&&!e.target.closest(\'#plus,#plusmenu\')');
  expect(pg).toContain('#byo .byacts button{flex:1;height:44px;font-size:13px;justify-content:center');
});

test('phone sheet: kinds in two columns, everything else behind one collapsed Settings row', () => {
  expect(page).toContain('html.plus .plusmenu .cats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))');
  expect(page).toContain("more.className='more'");
  expect(page).toContain('AI model, computers, voice, files');
  // collapsed by default: the details element is never created open
  expect(page).not.toContain("more.open=true");
});

test('phone sheet uses plain labels, brand names only as the second line', () => {
  expect(page).toContain('<b>AI model</b><small class="phv"><span class="pv1">Free model</span> <span class="pv2">Flisk Wolf</span>');
  expect(page).toContain('<b>Computers</b><small id="sbsum2">Cheapest first</small>');
  expect(page).not.toContain('Fleet, automatic</');
});

test('phone model picker is one column: title and Done, provider pills in one row, one-line rows', () => {
  expect(page).toContain('#mppop .pgrid{display:contents}');
  expect(page).toContain('#mppop .rail{flex:none;flex-direction:row');
  expect(page).toContain('-webkit-line-clamp:1');
  expect(page).toContain('id="popx"');
});

test('phones get a menu button in the top bar, so New chat and the chat list can be opened', async () => {
  const app = await Bun.file(new URL('../web/src/App.jsx', import.meta.url)).text();
  expect(app).toContain('mobileNav={{hasToggle: false, isOpen: navOpen, onOpenChange: setNavOpen, content: drawer}}');
  expect(app).toMatch(/topNav=\{[\s\S]*?<MobileNavToggle \/>/);
});

test('starting or opening a chat closes the phone drawer', async () => {
  const app = await Bun.file(new URL('../web/src/App.jsx', import.meta.url)).text();
  expect(app).toMatch(/const newChat = \(\) => \{ setNavOpen\(false\);/);
  expect(app).toMatch(/const openChat = \(c\) => \{ newChat\(\);/); // opening a chat starts from newChat, so it closes too
});

test('the message box has no background of its own, so phones show no dark strip behind the text', () => {
  const css = readFileSync(new URL('../web/src/app.css', import.meta.url), 'utf8');
  expect(css).toMatch(/\.astryx-chat-composer-input \[contenteditable\][^{]*\{background:transparent!important/);
});

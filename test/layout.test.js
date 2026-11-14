import { expect, test } from 'bun:test';
import { appPage } from '../src/page.js';

const page = appPage({ login: 'ann', connected: [] });

test('the model picker and the + menu are placed inside the window when they open', () => {
  expect(page).toContain('const placeFloat=(el,anchor)=>');
  // clamps to the flisk bar and to any clipping parent, so neither menu is cut off
  expect(page).toContain("document.querySelector('flisk-bar')");
  expect(page).toContain("st.overflowX!=='visible'||st.overflowY!=='visible'");
  expect(page).toContain('placeFloat(pop,mpBtn);mq.focus();');
  expect(page).toContain('if(on)placeFloat(pm,pb);');
  expect(page).toContain("addEventListener('resize',()=>{if(!pop.hidden)placeFloat(pop,mpBtn);");
  // an open menu sits above the blurred idea buttons
  expect(page).toContain('.composer:has(.pop:not([hidden])),html.plus .composer{position:relative;z-index:25}');
});

test('buttons on the accent colour use the on-accent ink, so dark looks are not white on white', () => {
  expect(page).toContain('#plus[aria-expanded=true]{color:var(--flisk-on-accent,#fff);');
  expect(page).toMatch(/\.btn\.go\{[^}]*color:var\(--flisk-on-accent,#fff\)/);
  expect(page).toContain('html.nt .talkb{color:var(--bg)!important;');
  expect(page).toContain('html.nt .rail button[aria-pressed=true]{color:var(--ink)}');
});

test('the page script still parses', () => {
  for (const [, s] of page.matchAll(/<script>([\s\S]*?)<\/script>/g)) expect(() => new Function(s)).not.toThrow();
});

test('Voice is the fourth mode toggle and opens the talk screen; the + menu rows never turn white', () => {
  expect(page).toContain('data-mode="voice"');
  expect(page).toContain(">Voice</button></div>");
  expect(page).toContain("document.querySelectorAll('.md:not([data-mode=voice])')");
  expect(page).toContain('if(or.hidden)ob.click();');
  // Voice talk's button is forced to the ink colour everywhere else; inside the + menu it must stay see-through
  expect(page).toContain('html .plusmenu>button.talkb{background:transparent!important;color:var(--ink)!important');
});

test('the + menu rows stay clickable: the Computers list opens in place, rows span the menu, on-rows stay readable', () => {
  // the Computers list was a second floating box inside the scrolling + menu: clipped, and it covered the rows under it
  expect(page).toContain('.plusmenu details.pick .menu{position:static;width:auto;max-height:none;overflow:visible;');
  expect(page).toContain("if(pkIn.open)pkIn.scrollIntoView({block:'nearest'});");
  // .chip max-width:240px and the phone 32px icon rule must not squeeze menu rows
  expect(page).toContain('.plusmenu .chip{max-width:none}');
  expect(page).toContain('.composer .bar .plusmenu>#voice');
  expect(page).toContain('.plusmenu #sbsum{display:inline}');
  // Earth's accent is near-white: "Read answers aloud" switched on was white text on a white row
  expect(page).toContain('html .plusmenu>.chip.ico.on{background:transparent;color:var(--ink);');
  expect(page).toContain('.chip.ico.on{color:var(--flisk-on-accent,#fff);');
});

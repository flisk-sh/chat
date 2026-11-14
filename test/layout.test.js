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

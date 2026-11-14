import { expect, test } from 'bun:test';
import { appPage } from '../src/page.js';

const page = appPage({ login: 'ann', connected: [] });

test('the phone sidebar opens under the flisk bar, not behind it', () => {
  expect(page).toContain("$('sideopen').onclick=()=>{const fb=document.querySelector('flisk-bar'),t=fb?Math.max(0,fb.getBoundingClientRect().bottom):0;side.style.top=t+'px';side.classList.add('open');};");
});

test('on a phone the mic stays beside send when the box buttons wrap', () => {
  const phone = page.slice(page.indexOf('@media (max-width:860px)'));
  expect(phone).toContain('.composer .bar #mic{margin-left:auto}.composer .bar #mic:not([hidden])+.send{margin-left:6px}');
});

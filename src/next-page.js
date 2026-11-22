// The new Astryx look of the chat, served at /next while the current page at / stays as it is.
// The app itself is built from web/ (see scripts/embed-web.mjs) into next-app.generated.js; this only wraps it in a page
// and hands it what the server knows about the visitor (the same facts the current page gets).
import { NEXT_CSS, NEXT_JS } from './next-app.generated.js';
import { EARTH_JS } from './earth.js';
import { CATS, KEY_PAGES, PROVIDER_CARDS, PROVIDER_NAMES } from './page.js';

const LS = new RegExp('[\\u2028\\u2029]', 'g');
const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(LS, '');

// The shared Flisk bar is mounted first in <body>, in the page flow; the fixed app sits below it, whatever height the bar has.
const BAR_CSS = '.vv-root{top:calc(var(--vv-top,0px) + var(--fbar,0px));height:calc(var(--vv-h,100dvh) - var(--fbar,0px))}';
const BAR_JS = `(function(){var r=document.documentElement,h;function find(){return [].find.call(document.body.children,function(e){return /2147483000/.test(e.style.cssText)})}function set(){r.style.setProperty('--fbar',(h?h.offsetHeight:0)+'px')}function go(){h=find();if(!h)return setTimeout(go,100);set();if(window.ResizeObserver)new ResizeObserver(set).observe(h)}go()})();`;

export function nextPage({ login = null, anon = false, connected = [], models = [], names = {}, theme = 'earth', here = null, pod = '', inf = '' } = {}) {
  const boot = { login, anon, connected, models, names, theme, here, pod, inf, cats: CATS, cards: PROVIDER_CARDS, providerNames: PROVIDER_NAMES, keyPages: KEY_PAGES };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,interactive-widget=resizes-content">
<title>Flisk Chat</title><meta name="robots" content="noindex">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<script defer data-domain="chat.flisk.si" src="https://flisk.sh/a.js"></script>
<script src="https://flisk.si/assets/bar.js" data-product="Chat" data-icon="chat" data-accent="#2F7D4A" data-siblings="Cilytics,Ranker" data-text="Type a task and a computer does it." defer></script>
<style>${NEXT_CSS}${BAR_CSS}</style></head><body><canvas id="earth" class="earthc" aria-hidden="true"></canvas><div id="root"></div>
<script>window.__BOOT__=${json(boot)}</script>
<script type="module">${NEXT_JS}</script>
<script>${EARTH_JS}</script>
<script>${BAR_JS}</script></body></html>`;
}

// The Astryx fonts are inlined in the CSS as data: URLs, which the shared policy does not allow for fonts.
export const nextCsp = (csp) => csp.replace('font-src ', 'font-src data: ');

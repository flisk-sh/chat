// The new Astryx look of the chat, served at / (the previous page stays at /classic).
// The app itself is built from web/ (see scripts/embed-web.mjs) into app.generated.js; this only wraps it in a page
// and hands it what the server knows about the visitor (the same facts the current page gets).
import { APP_CSS, APP_CSS_PATH, APP_FONTS, APP_JS, APP_JS_PATH } from './app.generated.js';
import { EARTH_JS } from './earth.js';
import { COMPUTERS_URL } from './settings-dialog.js';
import { jaScript } from './i18n-ja.js';
import { CATS, ICON_HEAD, KEY_PAGES, PROVIDER_CARDS, PROVIDER_NAMES, GITHUB_APP_URL, seoHead, loginHook } from './page.js';

const LS = new RegExp('[\\u2028\\u2029]', 'g');
const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(LS, '');

// The shared Flisk bar is mounted first in <body>, in the page flow; the fixed app sits below it, whatever height the bar has.
const BAR_CSS = '.vv-root{top:calc(var(--vv-top,0px) + var(--fbar,0px));height:calc(var(--vv-h,100dvh) - var(--fbar,0px))}';
const BAR_JS = `(function(){var r=document.documentElement,h;function find(){return [].find.call(document.body.children,function(e){return /2147483000/.test(e.style.cssText)})}function set(){r.style.setProperty('--fbar',(h?h.offsetHeight:0)+'px')}function go(){h=find();if(!h)return setTimeout(go,100);set();if(window.ResizeObserver)new ResizeObserver(set).observe(h)}go()})();`;

export function chatPage({ login = null, anon = false, connected = [], models = [], names = {}, theme = 'earth', here = null, pod = '', inf = '', embed = false, lang = 'en' } = {}) {
  const boot = { embed, login, anon, connected, models, names, theme, here, pod, inf, cats: CATS, cards: PROVIDER_CARDS, providerNames: PROVIDER_NAMES, keyPages: KEY_PAGES, appUrl: GITHUB_APP_URL, computersUrl: COMPUTERS_URL };
  return `<!doctype html><html lang="${lang === 'ja' ? 'ja' : 'en'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,interactive-widget=resizes-content">
<title>${lang === 'ja' ? 'Flisk Chat: 一言でウェブサイトとアプリを作る' : 'Flisk Chat'}</title>${seoHead(lang)}
${ICON_HEAD}
<script defer data-domain="chat.flisk.si" src="https://flisk.sh/a.js"></script>
${embed ? '' : `<script src="https://flisk.si/assets/bar.js" data-product="Chat" data-icon="chat" data-accent="#2F7D4A" data-free-key data-siblings="Cilytics,Ranker" data-text="Type a task and a computer does it." defer></script>`}
<link rel="modulepreload" href="${APP_JS_PATH}"><link rel="stylesheet" href="${APP_CSS_PATH}">
<style>${embed ? '' : BAR_CSS}</style></head><body>${embed ? '' : '<canvas id="earth" class="earthc" aria-hidden="true"></canvas>'}<div id="root"></div>${loginHook(login, anon)}
<script>window.__BOOT__=${json(boot)}</script>
<script type="module" src="${APP_JS_PATH}"></script>
${embed ? '' : `<script>${EARTH_JS}</script>\n<script>${BAR_JS}</script>`}${lang === 'ja' ? `\n<script>${jaScript()}</script>` : ''}</body></html>`;
}

// The embedded chat can be framed by grow.flisk.si (and analytics, as everywhere); nothing else.
export const embedCsp = (csp) => csp.replace(/frame-ancestors [^;]*/, 'frame-ancestors https://grow.flisk.si https://analytics.flisk.si');

// The app's own files (JS, CSS, fonts) come from this origin, so the page policy allows 'self' for them.
export const appCsp = (csp) => csp.replace('script-src ', "script-src 'self' ").replace('style-src ', "style-src 'self' ").replace('font-src ', "font-src 'self' ");

// /_app/<name>.<hash>.<ext>: the app's files, kept by browsers for a year because the name changes with the content (#351).
// A page from the version before a deploy can still ask for an old name for a moment; it gets today's file, not kept.
const TYPES = { js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', woff2: 'font/woff2' };
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export function appAsset(path) {
  const m = /^\/_app\/(app|font)\.[0-9a-f]{12}\.(js|css|woff2)$/.exec(path);
  if (!m) return null;
  const [, name, ext] = m;
  const now = path === APP_JS_PATH || path === APP_CSS_PATH || path in APP_FONTS;
  let body;
  if (path in APP_FONTS) body = b64(APP_FONTS[path]);
  else if (name === 'app' && ext === 'js') body = APP_JS;
  else if (name === 'app' && ext === 'css') body = APP_CSS;
  else return null;
  return new Response(body, { headers: { 'content-type': TYPES[ext], 'cache-control': now ? 'public, max-age=31536000, immutable' : 'no-store', 'x-content-type-options': 'nosniff' } });
}

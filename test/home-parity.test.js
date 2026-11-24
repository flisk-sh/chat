// The new home page (web/src) must show everything the server streams, as /classic (src/page.js) does (#343-#347).
import {test, expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {newTurn, applyEv, liveText, pictures, wantsVoice} from '../web/src/events.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const app = read('web/src/App.jsx');
const cards = read('web/src/Cards.jsx');
const page = read('src/page.js');
const built = read('src/next-app.generated.js'); // what / really serves

test('every field a turn collects is read by the page', () => {
  // A field events.js fills but nothing renders is a card the visitor never sees (widgets, workers and browser were).
  const internal = ['task', 'status', 'answer', 'podStarted', 'model', 'text'];
  for (const k of Object.keys(newTurn('x'))) {
    if (internal.includes(k)) continue;
    expect({k, read: new RegExp('t\\.' + k + '\\b').test(app)}).toEqual({k, read: true});
  }
});

test('every widget kind /classic draws has a card here', () => {
  const block = page.slice(page.indexOf('const WIDGET_DRAW={'), page.indexOf('const drawWidget='));
  const kinds = [...block.matchAll(/^ {2}([a-z]+)\(d\)/gm)].map((m) => m[1]);
  expect(kinds.length).toBeGreaterThanOrEqual(5);
  const here = cards.slice(cards.indexOf('export const WIDGETS'));
  for (const k of kinds) expect({k, here: new RegExp('\\b' + k + '\\b').test(here)}).toEqual({k, here: true});
});

test('widget, worker and browseranswer events reach the turn', () => {
  let t = newTurn('weather in Kyiv');
  t = applyEv(t, {type: 'widget', kind: 'weather', data: {}});
  t = applyEv(t, {type: 'worker', path: 'src/index.js', code: 'export default {}'});
  t = applyEv(t, {type: 'browseranswer', question: 'q', results: [{title: 'a', snippet: 'b'}]});
  expect(t.widgets).toHaveLength(1);
  expect(t.workers).toHaveLength(1);
  expect(t.browser.question).toBe('q');
});

test('failed github sign-in event produces an error output', () => {
  let t = newTurn('fix bug');
  t = applyEv(t, {type: 'github', ok: false, error: 'bad credentials'});
  expect(t.outs).toEqual([{text: 'GitHub sign-in on the computer failed: bad credentials', bad: true}]);
  // ok: true event produces no error output
  let tOk = newTurn('fix bug');
  tOk = applyEv(tOk, {type: 'github', ok: true, error: null});
  expect(tOk.outs).toEqual([]);
});

test('a reroute is shown as a model step, not a computer', () => {
  const t = applyEv(newTurn('x'), {type: 'reroute', text: 'Trying another model'});
  expect(t.steps.at(-1).name).toBe('model');
});

test('a task stopped by sign-in is kept and runs once after it', () => {
  const at401 = app.slice(app.indexOf('res.status === 401'), app.indexOf('res.status === 429'));
  expect(at401).toContain("sessionStorage.setItem('chat_pending', String(task)");
  expect(at401).toContain("'chat_pending_files'");
  expect(app).toMatch(/if \(p && BOOT\.login\) run\(p, \{files:/);
  expect(app).toContain("sessionStorage.removeItem('chat_pending_files')");
});

test('the Oracle wakes the voice model when it opens', () => {
  expect(read('web/src/Oracle.jsx')).toContain("fetch('/api/talk/warm', {method: 'POST'})");
});

test('the Oracle re-requests microphone permissions on tap after refusal (#359)', () => {
  const oracle = read('web/src/Oracle.jsx');
  expect(oracle).toContain("else requestMic();");
  expect(oracle).toContain("NotFoundError");
  expect(oracle).toContain("NotAllowedError");
  expect(oracle).toContain("No microphone found on this device.");
  expect(oracle).toContain("The microphone is blocked. Allow it for this site, then tap the circle.");
});

test('the home page at / can be found by search engines and shows a link preview, as /classic does (#350)', async () => {
  const {nextPage} = await import('../src/next-page.js');
  const {appPage} = await import('../src/page.js');
  const head = (html) => html.slice(0, html.indexOf('</head>'));
  const tags = (html) => [...head(html).matchAll(/<(?:meta (?:name|property)="(?:robots|description|og:[a-z:]+|twitter:[a-z]+)"|link rel="(?:canonical|icon|apple-touch-icon)")[^>]*>/g)].map((m) => m[0]).sort();
  const home = nextPage({login: null, anon: true});
  expect(home).not.toContain('noindex');
  expect(home).toContain('<meta name="robots" content="index,follow">');
  expect(home).toContain('<link rel="canonical" href="https://chat.flisk.si/">');
  expect(home).toContain('<meta name="twitter:card" content="summary_large_image">');
  expect(tags(home)).toEqual(tags(appPage({login: '', anon: true, connected: []})));
});

test('closing the tab while a task runs asks first, as /classic does (#352)', () => {
  expect(page).toContain("addEventListener('beforeunload'");
  // The guard is on only while a task runs and is taken off when it ends.
  expect(app).toMatch(/if \(!busy\) return undefined;[\s\S]{0,200}addEventListener\('beforeunload', stay\)[\s\S]{0,80}removeEventListener\('beforeunload', stay\)[\s\S]{0,20}\}, \[busy\]\)/);
  expect(app).toContain("e.preventDefault(); e.returnValue = '';");
});

test('screen readers hear the status and the answer; errors and limits are alerts (#353)', () => {
  expect(page).toContain('aria-live="polite"');
  expect(app).toContain('aria-live="polite" aria-atomic="true" data-testid="turn-status">{liveText(turns, busy)}');
  expect(app).toContain('<Card role="alert"><VStack gap={2}>\n      <Text weight="semibold">{t.error.message}');
  expect(app).toContain('<Card role="alert"><VStack gap={2}>\n      <Heading level={4}>Daily limit reached');
  const turn = (t, extra) => ({task: 'x', files: [], t: {...newTurn('x'), ...t}, ...extra});
  expect(liveText([], false)).toBe('');
  expect(liveText([turn({status: 'Searching the web'})], true)).toBe('Searching the web…');
  expect(liveText([turn({status: 'Done', answer: 'Here it is.'})], false)).toBe('Answer ready: Here it is.');
  expect(liveText([turn({status: 'Done', answer: 'y'.repeat(900)})], false).length).toBe('Answer ready: '.length + 300);
  expect(liveText([turn({error: {message: 'No', kind: 'busy'}})], false)).toBe('');
  // Opening an old chat from the list is not read out.
  expect(liveText([turn({status: 'Done', answer: 'old'}, {old: true})], false)).toBe('');
});

test('a past chat can be deleted from the list, as on /classic (#355)', async () => {
  expect(page).toContain('Delete chat: ');
  expect(app).toContain("actions={<Button label={'Delete chat: ' + (c.title || 'Untitled')}");
  expect(app).toMatch(/setChats\(deleteChat\(c\.id\)\);\s*if \(c\.id === chatId\) newChat\(\);/);
  const store = {chat_history_v1: JSON.stringify([{id: 'a', title: 'A'}, {id: 'b', title: 'B'}, {id: 'c', title: 'C'}])};
  const had = globalThis.localStorage;
  globalThis.localStorage = {getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }};
  const {deleteChat, loadChats} = await import('../web/src/api.js?delete-chat'); // its own copy: other tests load api.js with a window set
  expect(deleteChat('b').map((c) => c.id)).toEqual(['a', 'c']);
  expect(loadChats().map((c) => c.id)).toEqual(['a', 'c']);
  expect(deleteChat('nope').map((c) => c.id)).toEqual(['a', 'c']);
  globalThis.localStorage = had;
});

test('a guest sees what they get and three concrete examples, not category names', () => {
  // 74% of chat.flisk.si visits bounced on 2026-11-22, and most visitors are guests (an anonymous session).
  expect(app).toContain("const guestHome = !!BOOT.login && !!BOOT.anon;");
  expect(app).toContain("'Describe a website or app. Get a live link.'");
  expect(app).toContain("guestHome ? GUEST_STARTERS : (BOOT.cats || []).slice(0, 6)");
  const examples = app.match(/const GUEST_STARTERS = \[([\s\S]*?)\];/)[1];
  expect((examples.match(/label: '/g) || []).length).toBe(3);
  // Plain words a first-time visitor knows: no jargon in the heading, the lead or the examples.
  const copy = ["Describe a website or app. Get a live link.", 'Free, no sign-up. Pick an example or type your own.', examples].join(' ');
  expect(copy).not.toMatch(/\b(agent|MCP|LLM|API|token|orchestrat|pod|fleet)\b/i);
  expect("Describe a website or app. Get a live link.".split(/\s+/).length).toBeLessThanOrEqual(12);
});

test('the home page has one level-1 heading, as /classic does (#357)', () => {
  expect(page).toMatch(/<h1[ >]/);
  expect(app.match(/<Heading level=\{1\}/g) || []).toHaveLength(1);
  expect(app).toContain("'What shall we make today?'}</Heading>");
  // Once a chat has turns the greeting goes, and a hidden h1 names the chat; the two never show together.
  expect(app).toContain('{!turns.length && (');
  expect(app).toContain('{turns.length > 0 && <h1 className="sr-only">');
});

test('a ?voice=1 link opens voice talk on the first tap, as on /classic (#364)', () => {
  expect(page).toContain("/^(1|true|talk)$/.test(new URLSearchParams(location.search).get('voice')");
  for (const q of ['?voice=1', '?voice=true', '?voice=talk', '?flisk_theme=ivory&voice=1']) expect({q, on: wantsVoice(q)}).toEqual({q, on: true});
  for (const q of ['', '?voice=0', '?voice=yes', '?voice=', '?voices=1']) expect({q, on: wantsVoice(q)}).toEqual({q, on: false});
  expect(app).toContain('wantsVoice(location.search)');
  expect(app).toContain('<div className="caption voice-note" role="status">Tap anywhere to start talking</div>');
  // One tap, anywhere but the Voice talk button itself, opens the talk screen.
  expect(app).toMatch(/document\.addEventListener\('pointerdown', first, \{once: true\}\)/);
  expect(app).toMatch(/closest\('\[aria-label="Voice talk"\], \.earth-talk'\)\) return; setTalk\(true\);/);
  expect(built).toContain('Tap anywhere to start talking');
});

test('picking more files than there is room for says so, as on /classic (#365)', () => {
  expect(page).toContain("'You can attach up to 3 files.'");
  // Checked before anything is read, so it covers 5 files at once and a 4th when 3 are attached (room 0).
  expect(app).toMatch(/const room = 3 - files\.length;[^\n]*\n\s*if \(list\.length > room\) setNotice\('You can attach up to 3 files\.'\);/);
  expect(app).toContain("setNotice('Attached files can be 5 MB in all')");
  expect(built).toContain('You can attach up to 3 files.');
});

test('videos, pictures and published pages can be downloaded, as on /classic (#354)', () => {
  expect(page).toContain("dl.download='flisk-video.mp4'");
  expect(page).toContain("dl.download='index.html'");
  expect(page).toContain("x.download='flisk-picture.'+ext");
  expect(app).toContain('<Button label="Download mp4" variant="primary" href={t.video} download="flisk-video.mp4"');
  expect(app).toContain('<Button label="Copy link" variant="secondary" onClick={() => copy(t.video)} />');
  expect(app).toContain('{page && <Button label="Download" variant="secondary" href={u} download="index.html"');
  expect(app).toContain("'Kept 7 days. Download the page to keep it.'");
  expect(app).toContain("a.download = 'flisk-picture.' + ext;");
  for (const s of ['flisk-video.mp4', 'index.html', 'flisk-picture.', 'Download the page to keep it.', 'Save picture']) expect({s, in: built.includes(s)}).toEqual({s, in: true});
});

test('pictures in an answer are found for their Save picture buttons (#354)', () => {
  expect(pictures('')).toEqual([]);
  expect(pictures('Here: ![a cat](https://chat.flisk.si/i/abc.png) and ![b](/i/def.svg)')).toEqual(['https://chat.flisk.si/i/abc.png', '/i/def.svg']);
  expect(pictures('![a](/i/x.png) again ![a](/i/x.png)')).toEqual(['/i/x.png']);
  // A plain link is not a picture, and a javascript: URL is never one.
  expect(pictures('[site](https://x.dev) ![x](javascript:alert(1))')).toEqual([]);
});

test('the phone top bar keeps every button on screen at 320, 360 and 375 px (#358)', () => {
  const css = read('web/src/app.css');
  expect(css).toContain('@media (max-width:400px){.chat-head:has(.chat-head-end)');
  expect(app).toContain('const tiny = useNarrow(340);');
  expect(app).toContain('{signIn && !tiny && <Button label="Start free with GitHub"');
  expect(app).toContain("...(signIn && tiny ? [{label: 'Start free with GitHub'");
  const qa = read('scripts/mobile-qa.mjs');
  expect(qa).toContain('for (const width of [320, 360, 375])');
  expect(qa).toContain('top bar');
});

test('guest does not expose internal anon id in user footer or badge (#363)', () => {
  // Evaluate the helper from source: importing App.jsx would load web/src/api.js with this file's globals and break other tests.
  const src = app.match(/export const userLabel = (.*);/)[1];
  const userLabel = new Function('return ' + src.replace('boot = BOOT', 'boot'))();
  expect(userLabel({login: 'anon-c8a5d77f7bbb99e5', anon: true})).toBe('Guest');
  expect(userLabel({login: '', anon: false})).toBe('Guest');
  expect(userLabel({login: null, anon: false})).toBe('Guest');
  expect(userLabel({login: 'octocat', anon: false})).toBe('@octocat');
  expect(app).toContain('userLabel()');
  expect(app).toContain('Sign in with GitHub');
  expect(app).not.toMatch(/@' \+ BOOT\.login/);
  expect(built).toContain('Sign in with GitHub');
  expect(built).not.toMatch(/@['"]\s*\+\s*BOOT\.login/);
});

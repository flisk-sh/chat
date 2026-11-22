// The composer is one row (+, text, send), has no mode picker, and Explain mode opens an animated modal on press (docs/adr/0001).
import {test, expect} from 'bun:test';
import {readFileSync} from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const app = read('web/src/App.jsx');
const tip = read('web/src/Tip.jsx');
const css = read('web/src/app.css');
const built = read('src/next-app.generated.js'); // what / really serves

test('the page always sends ask: the Jev router decides, there is no mode picker', () => {
  expect(app).toContain("const mode = 'ask';");
  expect(app).not.toContain('SegmentedControl');
  expect(app).not.toMatch(/chat_mode\b/);
});

test('every extra control lives in the + menu, each row with a live demo', () => {
  for (const kind of ['dictate', 'talk', 'attach', 'computers', 'model']) expect(app).toContain(`<Demo kind="${kind}" />`);
});

test('the text area keeps the pill colour and + , text, send share one 32px row', () => {
  expect(css).toContain('.one-row .astryx-chat-composer-input');
  expect(css).toContain('background: transparent !important');
  expect(css).toContain('min-height:32px');
});

test('a press in Explain mode opens the animated modal, and so does press-and-hold', () => {
  expect(tip).toContain('onClickCapture={(e) => { e.preventDefault(); e.stopPropagation(); open(); }}');
  expect(tip).toContain('HOLD_MS');
  expect(tip).toContain('@keyframes peekGrow');
  expect(tip).toContain('<Demo kind={scene} />');
});

test('the Explain button itself still works while Explain mode is on', () => {
  expect(app).toContain('<Tip passThrough text="Explain mode');
});

test('what / serves includes the modal', () => {
  expect(built).toContain('peekGrow');
});

test('the placeholder fits one line on a 320px phone (17 characters or fewer)', () => {
  const placeholder = app.match(/placeholder="([^"]+)"/)[1];
  expect([...placeholder].length).toBeLessThanOrEqual(17);
});

test('the computers dialog lets the Fleet auto button wrap and keeps Connect and Get key on one row', () => {
  const pickers = read('web/src/Pickers.jsx');
  expect(pickers).toContain('computers-fleet-row');
  expect(css).toContain('.computers-fleet-text{flex:1 1 160px;min-width:0}');
  expect(pickers.indexOf("'Connecting…' : 'Connect'")).toBeLessThan(pickers.indexOf('label="Get key"'));
});

test('the placeholder shares the text line, so the text is level with the + and send', () => {
  expect(css).toContain('.one-row .astryx-chat-composer-input > div:first-child:not(:only-child){top:0!important;bottom:0!important;margin-block:auto;height:22px}');
  expect(css).toContain('.one-row > div > div:nth-child(2){align-self:stretch}');
  expect(css).toContain('.one-row > div > div:nth-child(2) > .astryx-chat-composer-input{flex:1 1 auto}');
  expect(css).toContain('.one-row .astryx-chat-composer-input{position:relative}');
});

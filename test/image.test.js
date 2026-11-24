import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { appPage } from '../src/page.js';
import { asksImage, BUSY_WAITS, cleanSvg, inlineLocal, parseAction, runTask } from '../src/loop.js';
import { SYSTEM } from '../src/prompt.js';
import { imageIntent } from '../src/model.js';
import { handle, saveImage } from '../src/index.js';
import { fakeD1 } from './d1.js';

const PIC = `data:image/jpeg;base64,${'A'.repeat(2000)}`;
const scripted = (...texts) => { let i = 0; return async () => ({ text: texts[Math.min(i++, texts.length - 1)] }); };
const noComputer = { start: async () => { throw new Error('a picture needs no computer'); } };

describe('a picture the user asks for is drawn and shown in the chat, like ChatGPT', () => {
  test('"generate a photo of a cat taking a mirror selfie" is drawn at once: no model, no computer, no page', async () => {
    const events = [];
    let asked = 0;
    const prompts = [];
    const r = await runTask({ task: 'generate a photo of a cat taking a mirror selfie', model: async () => (asked++, { text: '{"say":"no"}' }), computer: noComputer, publish: async () => { throw new Error('no page'); }, photo: async (p) => (prompts.push(p), PIC), saveImage: async () => ({ url: 'https://chat.flisk.si/i/0123456789abcdef.jpg' }), lookupFacts: () => { throw new Error('no lookup'); }, emit: (e) => events.push(e) });
    expect(asked).toBe(0);
    expect(prompts[0]).toContain('a cat taking a mirror selfie');
    expect(r.answer).toBe('![Here is a cat taking a mirror selfie.](https://chat.flisk.si/i/0123456789abcdef.jpg)\n\nHere is a cat taking a mirror selfie.');
    expect(events.map((e) => e.type)).toEqual(['image_start', 'answer']);
    expect(r.links).toEqual(['https://chat.flisk.si/i/0123456789abcdef.jpg']);
  });

  test('only plain picture requests take the fast way', () => {
    expect(asksImage('draw me a dragon over Kyiv')?.caption).toBe('Here is a dragon over Kyiv.');
    expect(asksImage('Create an image of a sunset on Mars.')?.caption).toBe('Here is a sunset on Mars.');
    expect(asksImage('make a landing page with a photo of a cat')).toBeNull();
    expect(asksImage('draw a chart of our sales')).toBeNull();
    expect(asksImage('what is in this photo of a cat')).toBeNull();
    expect(asksImage('make a video of a cat')).toBeNull();
  });

  test('the model can send an "image" action; the picture ends the task with no computer', async () => {
    expect(SYSTEM).toContain('{"image": {"prompt"');
    expect(SYSTEM).toContain('never download a picture with curl');
    expect(parseAction('{"image": {"prompt": "a red fox", "caption": "A red fox."}}')).toEqual({ type: 'image', spec: { prompt: 'a red fox', caption: 'A red fox.' } });
    const r = await runTask({ task: 'I would love a cute fox for my avatar', model: scripted('{"image": {"prompt": "a cute red fox avatar", "caption": "A cute red fox for your avatar."}}'), computer: noComputer, photo: async () => PIC, saveImage: async () => ({ url: 'https://chat.flisk.si/i/fedcba9876543210.jpg' }) });
    expect(r.answer).toContain('![A cute red fox for your avatar.](https://chat.flisk.si/i/fedcba9876543210.jpg)');
    expect(r.error).toBeNull();
  });

  test('a model that reaches for an image website is refused, and the prompt rules it out', async () => {
    expect(SYSTEM).toContain('Never fetch a picture from an image website');
    expect(SYSTEM).toContain('never call it "real"');
    let ran = 0;
    const computer = { start: async () => ({ ok: true, data: { podId: 'p' } }), run: async () => (ran++, { data: { exitCode: 0, stdout: '', stderr: '' } }), stop: async () => ({}) };
    const msgs = [];
    const model = async (m) => { msgs.push(m); return { text: msgs.length === 1 ? '{"run":"curl -o cat.jpg https://image.pollinations.ai/prompt/cat"}' : '{"say":"ok"}' }; };
    await runTask({ task: 'put a cat photo into my notes file', model, computer });
    expect(ran).toBe(0);
    expect(JSON.stringify(msgs[1])).toContain('Refused: do not fetch pictures from an image website');
  });

  test('no photo and a busy chat model: the SVG fallback waits and asks again, then draws', async () => {
    const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><rect width="800" height="800" fill="#eee"/><circle cx="400" cy="400" r="200" fill="#fa0"/><circle cx="330" cy="350" r="30"/><circle cx="470" cy="350" r="30"/><path d="M340 480 Q400 540 460 480" stroke="#000" fill="none"/>${'<!-- pad -->'.repeat(30)}</svg>`;
    let calls = 0;
    const waits = [];
    const model = async () => (++calls < 3 ? { error: 'The free AI is busy right now.', kind: 'busy' } : { text: SVG });
    const r = await runTask({ task: 'draw a cat', model, computer: noComputer, photo: async () => '', wait: async (ms) => { waits.push(ms); } });
    expect(calls).toBe(3);
    expect(waits).toEqual(BUSY_WAITS);
    expect(r.answer).toContain('![');
  });

  test('still busy after every wait: the sentence says the free models are busy, not that a limit is used up', async () => {
    const model = async () => ({ error: 'The free AI is busy right now.', kind: 'busy' });
    const r = await runTask({ task: 'draw a cat', model, computer: noComputer, photo: async () => '', wait: async () => {} });
    expect(r.answer).toMatch(/^Sorry, every free model is busy/);
    expect(r.answer).not.toMatch(/limit/);
  });

  test('no picture (daily limit, busy model): a calm sentence, never a page or a computer', async () => {
    const r = await runTask({ task: 'generate a picture of a lighthouse at night', model: scripted('{"say":"x"}'), computer: noComputer, photo: async () => '' });
    expect(r.answer).toMatch(/^Sorry, the picture could not be drawn right now/);
  });
});

describe('a drawn picture has its own link', () => {
  const SCHEMA = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
  test('saveImage keeps it in D1 and /i/<id>.jpg serves the bytes', async () => {
    const env = { DB: fakeD1(SCHEMA), PUBLIC_ORIGIN: 'https://chat.flisk.si' };
    const made = await saveImage(env, 'ann', 'data:image/jpeg;base64,/9j/4AAQ', 'a cat', 'https://chat.flisk.si');
    expect(made.url).toMatch(/^https:\/\/chat\.flisk\.si\/i\/[a-f0-9]{16}\.jpg$/);
    const res = await handle(new Request(made.url), env, {});
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect([...new Uint8Array(await res.arrayBuffer())].slice(0, 3)).toEqual([0xff, 0xd8, 0xff]);
    expect((await handle(new Request('https://chat.flisk.si/i/0000000000000000.jpg'), env, {})).status).toBe(404);
    expect((await saveImage(env, 'ann', 'not a picture', '', 'https://chat.flisk.si')).error).toBeTruthy();
  });
});

describe('a published page keeps its pictures', () => {
  test('<img src="cat.jpg"> next to the page goes into it as a data: URL', async () => {
    const files = { '~/site/cat.jpg': { encoding: 'base64', content: '/9j/4AAQ' } };
    const read = async (p) => (p in files ? { data: files[p] } : { error: `No such file: ${p}` });
    const r = await inlineLocal('<html><body><img src="cat.jpg" alt="Cat"><img src="https://x.test/a.png"></body></html>', '~/site/index.html', read);
    expect(r.html).toContain('<img src="data:image/jpeg;base64,/9j/4AAQ" alt="Cat">');
    expect(r.html).toContain('src="https://x.test/a.png"');
    expect(r.pictures).toBe(1);
    expect(r.missing).toEqual([]);
  });

  test('a picture that is not there is reported, never published broken', async () => {
    const r = await inlineLocal('<html><body><img src="cat.jpg" alt="Cat"></body></html>', '~/site/index.html', async (p) => ({ error: `No such file: ${p}` }));
    expect(r.missing).toEqual(['cat.jpg']);
  });
});

describe('the chat page shows the picture', () => {
  const page = appPage({ login: 'ann', connected: [] });
  test('an answer line ![alt](link) is drawn as a picture with a save button, and the step says what happens', () => {
    expect(page).toContain("const picture=(src,alt)=>");
    expect(page).toContain("if(im){n.appendChild(picture(im[2],im[1]));i++;continue;}");
    expect(page).toContain("step('Drawing the picture','','image')");
    for (const [, s] of page.matchAll(/<script>([\s\S]*?)<\/script[^>]*>/gi)) expect(() => new Function(s)).not.toThrow();
  });
});

describe('when the drawing model has no budget, the chat model draws the picture as SVG code', () => {
  const SVG = `<svg viewBox="0 0 800 800"><defs><radialGradient id="g"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#a50"/></radialGradient></defs><rect width="800" height="800" fill="#cde"/><circle cx="400" cy="400" r="200" fill="url(#g)" onclick="x()"/><ellipse cx="400" cy="620" rx="220" ry="40" fill="#0003"/><path d="M200 300 L400 100 L600 300Z" fill="#c60"/><script>alert(1)</script><image href="https://evil.test/a.png"/>${'<circle cx="1" cy="1" r="1"/>'.repeat(10)}</svg>`;
  test('cleanSvg keeps the shapes and drops script, handlers and outside links', () => {
    const out = cleanSvg('Here you go:\n```svg\n' + SVG + '\n```');
    expect(out).toContain('radialGradient');
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(out).not.toMatch(/script|onclick|evil\.test|<image/i);
    expect(cleanSvg('no picture here')).toBeNull();
    expect(cleanSvg('<svg><rect/></svg>')).toBeNull();
  });

  test('a picture request whose photo fails is drawn by the chat model and kept as an svg', async () => {
    let saved = null;
    const r = await runTask({ task: 'generate a photo of a red fox in the snow', model: async () => ({ text: SVG }), computer: noComputer, photo: async () => '', saveImage: async (pic) => ((saved = pic), { url: 'https://chat.flisk.si/i/0123456789abcdef.svg' }) });
    expect(saved).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(r.answer).toContain('![Here is a red fox in the snow.](https://chat.flisk.si/i/0123456789abcdef.svg)');
  });

  test('saved svg is served with a locked-down policy', async () => {
    const SCHEMA = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
    const env = { DB: fakeD1(SCHEMA), PUBLIC_ORIGIN: 'https://chat.flisk.si' };
    const out = await saveImage(env, 'odykyi', `data:image/svg+xml;base64,${btoa(cleanSvg(SVG))}`, 'fox', 'https://chat.flisk.si');
    expect(out.url).toMatch(/\/i\/[0-9a-f]{16}\.svg$/);
    const res = await handle(new Request(out.url), env, {});
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/svg+xml');
    expect(res.headers.get('content-security-policy')).toContain('sandbox');
  });
});

describe('picture buttons', () => {
  test('a drawn picture saves as a PNG, and a picture-only answer has no markdown Save/Copy buttons', () => {
    const page = appPage({ login: 'ann', connected: [] });
    expect(page).toContain("give(p,'png')");
    expect(page).toContain('if(!onlyPic)turn.appendChild(sv)');
  });
});

describe('a small model decides, not the wording', () => {
  const run = (classify) => {
    let asked = 0;
    return runTask({ task: 'draw me a dragon over Kyiv', classify, model: async () => (asked++, { text: '{"say":"here is the plan"}' }), computer: noComputer, publish: async () => { throw new Error('no'); }, photo: async () => '', saveImage: async () => ({ url: 'x' }), emit: () => {} }).then((r) => ({ r, asked }));
  };
  test('a message the wording nominates but the classifier calls "other" goes to the main model', async () => {
    const { r, asked } = await run(async () => 'other');
    expect(asked).toBe(1);
    expect(r.answer).toContain('here is the plan');
  });
  test('a failing classifier also goes to the main model', async () => {
    const { asked } = await run(async () => { throw new Error('down'); });
    expect(asked).toBe(1);
  });
  test('imageIntent: one word "image" means image, anything else or no binding does not', async () => {
    expect(imageIntent({})).toBeNull();
    expect(await imageIntent({ AI: { run: async () => ({ response: 'image' }) } })('draw a cat')).toBe('image');
    expect(await imageIntent({ AI: { run: async () => ({ response: 'other.' }) } })('draw up a plan')).toBe('other');
    expect(await imageIntent({ AI: { run: async () => ({ choices: [{ message: { content: 'Image' } }] }) } })('draw a cat')).toBe('image');
  });
});

describe('Jev decides image or not', () => {
  const jev = (choice, confidence, seen = []) => ({ AI: { run: async (model, input) => { seen.push([model, input]); return model === 'typesafe/jev' ? { answers: { wants: { type: 'choice', choice, confidence, probabilities: {} } } } : { response: 'image' }; } } });
  test('a confident image answer is an image, and Jev gets the typed question', async () => {
    const seen = [];
    expect(await imageIntent(jev('image', 0.95, seen))('draw a cat')).toBe('image');
    expect(seen[0][0]).toBe('typesafe/jev');
    expect(seen[0][1].state).toBe('draw a cat');
    expect(Object.keys(seen[0][1].questions.wants.criteria)).toEqual(['image', 'other']);
    expect(seen.length).toBe(1);
  });
  test('a weak image guess or an "other" answer is not an image, and Llama is not asked', async () => {
    const seen = [];
    expect(await imageIntent(jev('image', 0.4, seen))('something cool')).toBe('other');
    expect(await imageIntent(jev('other', 0.99, seen))('write a plan')).toBe('other');
    expect(seen.every((c) => c[0] === 'typesafe/jev')).toBe(true);
  });
  test('when Jev fails the Llama question still decides', async () => {
    const env = { AI: { run: async (model) => { if (model === 'typesafe/jev') throw new Error('not in your plan'); return { response: 'image' }; } } };
    expect(await imageIntent(env)('draw a cat')).toBe('image');
  });
});

describe('a picked website is never drawn as a picture', () => {
  test('"draw me something cool" with the website picked goes to the model, which is told what was picked', async () => {
    const prompts = [];
    let asked = 0;
    const r = await runTask({ task: 'draw me something cool', kind: 'website', model: async (m) => { prompts.push(JSON.stringify(m)); asked++; return { text: '{"say":"I will build the site."}' }; }, computer: noComputer, photo: async () => { throw new Error('no picture when a website was picked'); }, publish: async () => ({}) });
    expect(asked).toBeGreaterThan(0);
    expect(prompts[0]).toContain('picked');
    expect(r.answer).not.toContain('![');
  });

  test('a model "image" action is refused when a website was picked', async () => {
    let drew = 0;
    const r = await runTask({ task: 'something cool', kind: 'website', model: scripted('{"image": {"prompt": "a city", "caption": "A city."}}', '{"say":"done"}'), computer: noComputer, photo: async () => { drew++; return PIC; }, saveImage: async () => 'https://chat.flisk.si/i/0123456789abcdef.jpg', publish: async () => ({}) });
    expect(drew).toBe(0);
    expect(r.answer).not.toContain('![');
  });
});

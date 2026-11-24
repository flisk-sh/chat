import { describe, expect, test } from 'bun:test';
import { MAX_LAYOUT_BYTES, parseAction, runTask } from '../src/loop.js';
import { SYSTEM } from '../src/prompt.js';
import { BROWSER_NOTE } from '../src/browserpod.js';
import { ACCENTS, cleanSite, LAYOUTS, photoPrompt, renderSite } from '../src/sites.js';
import { PHOTOS_PER_DAY, PHOTOS_PER_LOGIN, pollinationsPhoto, sitePhoto } from '../src/photo.js';

const PHOTO = `data:image/jpeg;base64,${'A'.repeat(800 * 1024)}`;
const bytes = (h) => new TextEncoder().encode(h).length;

const scripted = (...texts) => { let i = 0; return async () => ({ text: texts[Math.min(i++, texts.length - 1)] }); };

const SAMPLES = {
  landing: { layout: 'landing', title: 'Moon Roast', tagline: 'Coffee roasted on Tuesdays', about: 'A small roastery.', button: 'Visit us', features: [{ title: 'Fresh', text: 'Roasted this week.' }, { title: 'Local', text: 'From the hill farm.' }] },
  portfolio: { layout: 'portfolio', title: 'Ana Ruiz', tagline: 'Illustrator', about: 'I draw books.', skills: ['Ink', 'Watercolour'], projects: [{ title: 'The Fox', text: 'A picture book.', tag: '2025' }] },
  menu: { layout: 'menu', title: 'Hearth & Crumb', tagline: 'Bakery', about: 'Bread every morning.', sections: [{ name: 'Bread', items: [{ name: 'Sourdough', price: '£4', text: 'Two days of rise.' }] }], hours: ['Mon-Fri 7-15', 'Sat 8-13'] },
  event: { layout: 'event', title: 'Sam & Lee', tagline: 'We are getting married', about: 'Join us.', when: '2027-06-12 15:00', where: 'The Old Mill', button: 'RSVP', schedule: [{ time: '15:00', title: 'Ceremony', text: 'In the garden.' }], speakers: ['Sam', 'Lee'] },
  prices: { layout: 'prices', title: 'Tidy', tagline: 'Cleaning plans', about: 'Weekly cleaning.', plans: [{ name: 'Basic', price: '£20', per: 'week', features: ['Kitchen'], best: false }, { name: 'Full', price: '£40', per: 'week', features: ['Whole home'], best: true }], faq: [{ q: 'Can I cancel?', a: 'Any time.' }] },
};

describe('every layout draws a full page', () => {
  test('there are five layouts and a sample for each', () => {
    expect(LAYOUTS).toEqual(Object.keys(SAMPLES));
  });

  for (const [name, raw] of Object.entries(SAMPLES)) {
    test(`${name}: a whole page with its title, phone styles, no scripts, nothing from elsewhere`, () => {
      const html = renderSite(cleanSite(raw));
      expect(html.startsWith('<!doctype html>')).toBe(true);
      expect(html).toContain('<meta name="viewport" content="width=device-width,initial-scale=1">');
      expect(html).toMatch(/@media \(max-width:7[26]0px\)/);
      expect(html).toContain('<title>');
      expect(html).toContain('id="contact"');
      expect(html).not.toMatch(/<script/i);
      // Nothing is loaded from elsewhere: fonts and pictures are built in as data: URLs.
      expect(html).not.toMatch(/src="https?:|<link|@import|url\(\s*['"]?(https?:|\/\/)/i);
      expect(html).toContain('url(data:font/woff2;base64,');
      expect(bytes(html)).toBeLessThan(MAX_LAYOUT_BYTES);
    });
  }

  test('each layout shows its own parts', () => {
    expect(renderSite(cleanSite(SAMPLES.menu))).toContain('Sourdough');
    expect(renderSite(cleanSite(SAMPLES.menu))).toContain('Sat 8-13');
    expect(renderSite(cleanSite(SAMPLES.event))).toContain('The Old Mill');
    expect(renderSite(cleanSite(SAMPLES.event))).toContain('Ceremony');
    expect(renderSite(cleanSite(SAMPLES.prices))).toContain('Can I cancel?');
    expect(renderSite(cleanSite(SAMPLES.portfolio))).toContain('The Fox');
    expect(renderSite(cleanSite(SAMPLES.landing))).toContain('Roasted this week.');
  });

  test('the biggest allowed page, with a big photo, is still under the layout limit', () => {
    const long = 'x'.repeat(5000);
    const raw = { layout: 'menu', look: 'editorial', title: long, tagline: long, about: long, photo: long, hours: Array(50).fill(long), sections: Array(50).fill({ name: long, items: Array(50).fill({ name: long, price: long, text: long }) }) };
    expect(bytes(renderSite(cleanSite(raw), PHOTO))).toBeLessThan(MAX_LAYOUT_BYTES);
    // Slow on a busy machine (about 5 s under load): the size is what is checked, not the speed.
  }, 30000);
});

describe('looks, accents and the photo', () => {
  test('each layout has a look and an accent of its own, and the model can pick others', () => {
    expect(cleanSite(SAMPLES.menu)).toMatchObject({ look: 'cinematic', accent: 'forest' });
    expect(cleanSite(SAMPLES.portfolio)).toMatchObject({ look: 'editorial', accent: 'graphite' });
    expect(cleanSite({ ...SAMPLES.menu, look: 'Editorial', accent: 'flisk' })).toMatchObject({ look: 'editorial', accent: 'flisk' });
    expect(cleanSite({ ...SAMPLES.menu, colour: 'midnight' }).accent).toBe('midnight');
    expect(cleanSite({ ...SAMPLES.menu, look: 'pink', accent: 'neon' })).toMatchObject({ look: 'cinematic', accent: 'forest' });
  });

  test('the accent colour is used on the page', () => {
    for (const look of ['cinematic', 'editorial']) expect(renderSite(cleanSite({ ...SAMPLES.prices, look, accent: 'forest' }))).toContain(ACCENTS.forest[0]);
  });

  test('the photo is written once and used by the hero', () => {
    for (const look of ['cinematic', 'editorial']) {
      const html = renderSite(cleanSite({ ...SAMPLES.landing, look }), PHOTO);
      expect(html.split(PHOTO).length - 1).toBe(1);
      expect(html).toContain('var(--photo)');
    }
  });

  test('without a photo, or with something that is not one, the hero has no photo', () => {
    expect(renderSite(cleanSite(SAMPLES.landing))).not.toContain('--photo:');
    const html = renderSite(cleanSite(SAMPLES.landing), 'https://evil.example/x.jpg);background:red');
    expect(html).not.toContain('evil.example');
  });

  test('the photo prompt has the scene and asks for no text', () => {
    const p = photoPrompt(cleanSite({ ...SAMPLES.menu, photo: 'a loaf of sourdough on a dark oak table' }));
    expect(p).toContain('a loaf of sourdough on a dark oak table');
    expect(p).toContain('no text');
    expect(p).toMatch(/Cinematic 8k HDR/);
    expect(photoPrompt(cleanSite(SAMPLES.portfolio))).toContain('Ana Ruiz');
  });
});

describe('the page is safe and honest', () => {
  test('text is escaped, so a model reply cannot add markup', () => {
    const html = renderSite(cleanSite({ layout: 'landing', title: '<script>alert(1)</script>', about: '"><img src=x onerror=alert(1)>' }));
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
  });

  test('made-up emails and phone numbers are taken out; dates, times and prices stay', () => {
    const s = cleanSite({ layout: 'event', title: 'Party', about: 'Write to hello@party.com or call +44 20 7946 0958.', when: '2027-06-12 15:00', schedule: [{ time: '15:00', title: 'Cake', text: 'Tickets £12.50' }] });
    const html = renderSite(s);
    expect(html).not.toContain('hello@party.com');
    expect(html).not.toContain('7946');
    expect(html).toContain('2027-06-12 15:00');
    expect(html).toContain('£12.50');
  });

  test('the contact part only asks the owner to add their details', () => {
    const html = renderSite(cleanSite(SAMPLES.menu));
    expect(html).toContain('Add your address here');
    expect(html).toContain('Add your phone number here');
  });

  test('an unknown layout or a missing title is refused', () => {
    expect(cleanSite({ layout: 'shop', title: 'X' })).toBeNull();
    expect(cleanSite({ layout: 'landing' })).toBeNull();
    expect(cleanSite(null)).toBeNull();
  });
});

describe('the model can ask for a layout', () => {
  test('the instructions name the layouts, and the in-tab note prefers them', () => {
    for (const l of LAYOUTS) expect(SYSTEM).toContain(l);
    expect(SYSTEM).toContain('{"site":');
    expect(BROWSER_NOTE).toContain('"site"');
  });

  test('a site reply is read as a site action', () => {
    const a = parseAction(JSON.stringify({ site: SAMPLES.landing }));
    expect(a.type).toBe('site');
    expect(a.spec.title).toBe('Moon Roast');
  });

  test('a site with no layout gets a helpful retry message', () => {
    const a = parseAction('{"site": {"title": "X"}}');
    expect(a.type).toBe('bad');
    expect(a.why).toContain('landing');
  });

  test('a visitor gets a live page with no computer started', async () => {
    let started = 0;
    const computer = { start: async () => (started++, { status: 201, data: { id: 'p1' } }), stop: async () => ({ status: 200, data: {} }), run: async () => ({ status: 200, data: {} }) };
    const published = [];
    const events = [];
    const model = scripted(JSON.stringify({ site: SAMPLES.menu }), '{"say": "Your bakery page: https://chat.flisk.si/s/abc"}');
    const r = await runTask({ task: 'a menu page for my bakery', model, computer, emit: (e) => events.push(e), publish: async (html) => (published.push(html), { url: 'https://chat.flisk.si/s/abc' }) });
    expect(started).toBe(0);
    expect(published).toHaveLength(1);
    expect(published[0]).toContain('Sourdough');
    expect(r.stats.errors).toBe(0);
    expect(events.some((e) => e.type === 'site' && e.layout === 'menu')).toBe(true);
  });

  test('the page gets the drawn photo, and is still published when the photo fails', async () => {
    for (const photo of [async () => PHOTO, async () => { throw new Error('no neurons'); }]) {
      const published = [];
      const model = scripted(JSON.stringify({ site: SAMPLES.menu }), '{"say": "Done"}');
      const computer = { start: async () => ({ status: 201, data: { id: 'p1' } }), stop: async () => ({ status: 200, data: {} }), run: async () => ({ status: 200, data: {} }) };
      await runTask({ task: 'a menu page', model, computer, photo, publish: async (html, o) => (published.push([html, o]), { url: 'https://chat.flisk.si/s/abc' }) });
      expect(published).toHaveLength(1);
      expect(published[0][1].limit).toBe(MAX_LAYOUT_BYTES);
      expect(published[0][0].includes(PHOTO)).toBe(photo.toString().includes('PHOTO'));
    }
  });
});

describe('drawing the photo', () => {
  const fakeDb = () => {
    const rows = new Map();
    const prep = (sql) => ({
      bind: (...a) => ({
        all: async () => ({ results: [a[1], a[2]].filter((l) => rows.has(`${a[0]}|${l}`)).map((l) => ({ login: l, n: rows.get(`${a[0]}|${l}`) })) }),
        run: async () => { const k = `${a[0]}|${a[1]}`; rows.set(k, (rows.get(k) || 0) + 1); },
      }),
    });
    return { rows, prepare: prep, batch: async (st) => { for (const x of st) await x.run(); } };
  };
  const ai = (image) => ({ run: async (model, input) => (expect(input.prompt).toBeTruthy(), { image }) });

  test('a drawn photo comes back as a data: URL and is counted', async () => {
    const env = { DB: fakeDb(), AI: ai('B'.repeat(4000)) };
    expect(await sitePhoto(env, 'ana', 'bread')).toBe(`data:image/jpeg;base64,${'B'.repeat(4000)}`);
    const day = new Date().toISOString().slice(0, 10);
    expect(env.DB.rows.get(`${day}|ana`)).toBe(1);
    expect(env.DB.rows.get(`${day}|*`)).toBe(1);
  });

  test('over the cap per login, or for everybody, FLUX is skipped and only free Pollinations can answer', async () => {
    const env = { DB: fakeDb(), AI: { run: async () => { throw new Error('FLUX must not run over the cap'); } } };
    const day = new Date().toISOString().slice(0, 10);
    const down = async () => new Response('down', { status: 502 });
    env.DB.rows.set(`${day}|ana`, PHOTOS_PER_LOGIN);
    expect(await sitePhoto(env, 'ana', 'bread', { fetchImpl: down })).toBe('');
    env.DB.rows.set(`${day}|*`, PHOTOS_PER_DAY);
    expect(await sitePhoto(env, 'bo', 'bread', { fetchImpl: down })).toBe('');
    // Over the cap, Pollinations still draws: the cap protects FLUX neurons, which Pollinations does not use.
    const jpeg = new Uint8Array(5000).fill(7);
    const ok = async () => new Response(jpeg, { headers: { 'content-type': 'image/jpeg' } });
    expect(await sitePhoto(env, 'ana', 'a cat', { fetchImpl: ok })).toBe(`data:image/jpeg;base64,${Buffer.from(jpeg).toString('base64')}`);
  });

  test('Pollinations is asked once more after a 402, then answers', async () => {
    const jpeg = new Uint8Array(5000).fill(7);
    let n = 0;
    const fetchImpl = async () => (++n === 1 ? new Response('{}', { status: 402, headers: { 'content-type': 'application/json' } }) : new Response(jpeg, { headers: { 'content-type': 'image/jpeg' } }));
    expect(await pollinationsPhoto('a cat', { fetchImpl, retryMs: 1 })).toStartWith('data:image/jpeg;base64,');
    expect(n).toBe(2);
    n = -5; // always 402: one retry only, then no photo
    let calls = 0;
    expect(await pollinationsPhoto('a cat', { fetchImpl: async () => (calls++, new Response('{}', { status: 402 })), retryMs: 1 })).toBe('');
    expect(calls).toBe(2);
  });

  test('a failed, slow or empty model gives no photo instead of an error', async () => {
    const fetchImpl = async () => new Response('down', { status: 502 });
    expect(await sitePhoto({ DB: fakeDb(), AI: { run: async () => { throw new Error('3036'); } } }, 'a', 'x', { fetchImpl })).toBe('');
    expect(await sitePhoto({ DB: fakeDb(), AI: { run: () => new Promise(() => {}) } }, 'a', 'x', { ms: 20, fetchImpl })).toBe('');
    expect(await sitePhoto({ DB: fakeDb(), AI: ai('') }, 'a', 'x', { fetchImpl })).toBe('');
    expect(await sitePhoto({ DB: { prepare: () => { throw new Error('no such table'); } }, AI: ai('B'.repeat(4000)) }, 'a', 'x', { fetchImpl })).toBe('');
    expect(await sitePhoto({ DB: fakeDb() }, 'a', 'x', { fetchImpl })).toBe('');
  });

  test('when FLUX cannot draw (neurons used up), the picture comes from Pollinations with no key', async () => {
    const urls = [];
    const jpeg = new Uint8Array(5000).fill(7);
    const fetchImpl = async (u) => (urls.push(String(u)), new Response(jpeg, { headers: { 'content-type': 'image/jpeg' } }));
    const out = await sitePhoto({ DB: fakeDb(), AI: { run: async () => { throw new Error('4006: used up your daily free allocation of 10,000 neurons'); } } }, 'a', 'a cat selfie', { fetchImpl });
    expect(out).toBe(`data:image/jpeg;base64,${Buffer.from(jpeg).toString('base64')}`);
    expect(urls[0]).toStartWith('https://image.pollinations.ai/prompt/a%20cat%20selfie?');
    // A page that is not a picture is no picture.
    expect(await sitePhoto({ DB: fakeDb() }, 'a', 'x', { fetchImpl: async () => new Response('<html>', { headers: { 'content-type': 'text/html' } }) })).toBe('');
    // Switched off, nothing is fetched.
    urls.length = 0;
    expect(await sitePhoto({ DB: fakeDb(), NO_POLLINATIONS: '1' }, 'a', 'x', { fetchImpl })).toBe('');
    expect(urls).toEqual([]);
  });
});

import { describe, expect, test } from 'bun:test';
import { CITABLE_URL, parseWidget, WIDGETS } from '../src/widgets.js';
import { runTask } from '../src/loop.js';
import { appPage } from '../src/page.js';

const good = {
  kind: 'grow', url: 'https://acme-3000.preview.box.upstash.com/', product: 'Booking tool for dog groomers',
  buyers: 'Owners of 1-3 chair grooming salons who take bookings by phone.', pitch: 'Stop answering the phone mid-trim.',
  places: [{ name: 'r/doggrooming', why: 'groomers talk shop', url: 'https://www.reddit.com/r/doggrooming/' }, { name: 'Local grooming Facebook groups', url: 'javascript:alert(1)' }, { why: 'no name' }],
  emails: [{ to: 'salon owner', subject: 'Bookings without the phone', body: 'Hi [Name],\nquick question.\n\n[Your name]' }, { to: 'x', subject: '', body: 'no subject' }],
};
const citableReport = { score: 72, grade: 'C', checks: [{ title: 'AI answer engines can crawl the page', status: 'pass' }, { title: 'Readable without JavaScript', status: 'fail', summary: 'The HTML has 12 words.' }, { title: 'Title and description', status: 'warn', summary: 'No description.' }] };

describe('grow widget', () => {
  test('keeps only safe links, named places and complete emails; needs a link, buyers, a place and an email', () => {
    const { input } = parseWidget(good);
    expect(input.places).toEqual([{ name: 'r/doggrooming', why: 'groomers talk shop', url: 'https://www.reddit.com/r/doggrooming/' }, { name: 'Local grooming Facebook groups', why: '', url: '' }]);
    expect(input.emails.length).toBe(1);
    expect(input.emails[0].body).toContain('\n\n[Your name]');
    for (const bad of [{ url: 'ftp://x' }, { url: '' }, { buyers: '' }, { places: [] }, { emails: [{ subject: 'a' }] }]) {
      expect(parseWidget({ ...good, ...bad }).error).toContain('grow');
    }
  });

  test('checks the live link on Citable through the service binding and keeps the top fixes', async () => {
    const asked = [];
    const citable = async (url) => (asked.push(url), Response.json(citableReport));
    const r = await WIDGETS.grow.run(parseWidget(good).input, { fetch: async () => { throw new Error('public fetch used'); }, citable });
    expect(asked[0]).toBe(CITABLE_URL + encodeURIComponent(good.url));
    expect(r.data.check).toEqual({ score: 72, grade: 'C', fixes: [{ title: 'Readable without JavaScript', summary: 'The HTML has 12 words.' }, { title: 'Title and description', summary: 'No description.' }], report: 'https://citable.flisk.si/acme-3000.preview.box.upstash.com' });
    expect(r.summary).toContain('72/100');
  });

  test('still draws the card when Citable is down', async () => {
    const r = await WIDGETS.grow.run(parseWidget(good).input, { fetch: async () => new Response('busy', { status: 503 }) });
    expect(r.error).toBeUndefined();
    expect(r.data.check).toBeNull();
    expect(r.summary).toContain('did not answer');
  });

  test('a "Grow it" turn draws the card with no computer and sends nothing', async () => {
    const events = [];
    const replies = [JSON.stringify({ widget: good }), JSON.stringify({ say: 'Post in r/doggrooming today.' })];
    let i = 0;
    const computer = { start: async () => { throw new Error('no computer for grow'); } };
    const res = await runTask({ task: `Grow it: find the first customers for ${good.url}`, model: async () => ({ text: replies[i++] }), computer, citable: async () => Response.json(citableReport), emit: (e) => events.push(e) });
    const w = events.find((e) => e.type === 'widget');
    expect(w.kind).toBe('grow');
    expect(w.data.check.score).toBe(72);
    expect(events.some((e) => e.type === 'pod_starting')).toBe(false);
    expect(res.answer || events.find((e) => e.type === 'answer').text).toContain('r/doggrooming');
  });

  test('the page offers Grow it on a live link and opens drafts in Gmail, never sending', () => {
    const html = appPage({});
    expect(html).toContain('function growButton(link)');
    expect(html).toContain("'Grow it: find the first customers for '+link");
    expect(html).toContain('https://mail.google.com/mail/?view=cm&fs=1&su=');
    expect(html).toContain('Nothing is sent for you');
    expect(html).toContain("'https://grow.flisk.si/?url='+encodeURIComponent(d.url)");
  });
});

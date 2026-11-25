import { expect, test } from 'bun:test';
import { ANSWER_PER_ASKER_PER_DAY, BUILD, MAX_ANSWER, answer, cleanQuestion, extractHtml, postable } from '../src/answer.js';

const KEY = 'k'.repeat(32);
const req = (body, auth = `Bearer ${KEY}`) => new Request('https://chat.flisk.si/api/answer', { method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const deps = (over = {}) => ({ weather: async () => '', search: async () => ({ error: 'none' }), format: () => '', over: async () => false, ask: async () => ({ text: 'Rainy, 9°C.' }), ...over });

test('no key or a wrong key answers 404 and never reaches the model', async () => {
  let asked = 0;
  const d = deps({ ask: async () => { asked++; return { text: 'x' }; } });
  expect((await answer(req({ question: 'hi' }), {}, d)).status).toBe(404);
  expect((await answer(req({ question: 'hi' }, 'Bearer nope'), { X_BOT_KEY: KEY }, d)).status).toBe(404);
  expect((await answer(req({ question: 'hi' }, 'Bearer short'), { X_BOT_KEY: 'short' }, d)).status).toBe(404);
  expect(asked).toBe(0);
});

test('the mention is removed and the weather note goes to the model', async () => {
  let seen;
  const d = deps({ weather: async () => 'London: rain, 9°C', ask: async (m) => { seen = m; return { text: 'London: rain, 9°C.' }; } });
  const res = await answer(req({ question: '@askflisk weather in london ', asker: '123' }), { X_BOT_KEY: KEY }, d);
  expect(res.status).toBe(200);
  expect((await res.json()).text).toBe('London: rain, 9°C.');
  expect(seen[1].content).toBe('weather in london');
  expect(seen[0].content).toContain('London: rain, 9°C');
});

test('search results are used when it is not a weather question', async () => {
  let seen;
  const d = deps({ search: async () => ({ results: [{ title: 'T', url: 'https://a.b', snippet: 's' }] }), format: () => '[1] T', ask: async (m) => { seen = m; return { text: 'ok' }; } });
  await answer(req({ question: 'who won the match' }), { X_BOT_KEY: KEY }, d);
  expect(seen[0].content).toContain('[1] T');
});

test('limits answer 429, an empty question 400, a model error 502', async () => {
  expect((await answer(req({ question: 'hi', asker: '1' }), { X_BOT_KEY: KEY }, deps({ over: async (s) => s === 'x-asker' }))).status).toBe(429);
  expect((await answer(req({ question: 'hi' }), { X_BOT_KEY: KEY }, deps({ over: async (s) => s === 'x-bot' }))).status).toBe(429);
  expect((await answer(req({ question: '@askflisk' }), { X_BOT_KEY: KEY }, deps())).status).toBe(400);
  expect((await answer(req({ question: 'hi' }), { X_BOT_KEY: KEY }, deps({ ask: async () => ({ error: 'busy', kind: 'busy' }) }))).status).toBe(502);
  expect(ANSWER_PER_ASKER_PER_DAY).toBeGreaterThan(0);
});

test('postable makes one safe line that fits a post', () => {
  expect(postable('**Rain** at [BBC](https://bbc.co.uk) see https://x.com/a\n\nok')).toBe('Rain at BBC see ok');
  expect(postable('{"say":"hello"}')).toBe('hello');
  expect(postable('hi @elonmusk')).not.toContain('@e');
  const long = postable('word '.repeat(200));
  expect(long.length).toBeLessThanOrEqual(MAX_ANSWER);
  expect(cleanQuestion('@AskFlisk  hey   @askflisk')).toBe('hey');
});

test('the post being replied to goes into the search and the prompt', async () => {
  let query, seen;
  const d = deps({ search: async (q) => { query = q; return { results: [{ title: 'Gemini 4 Neon', url: 'https://a.b', snippet: 's' }] }; }, format: () => '[1] Gemini 4 Neon', ask: async (m) => { seen = m; return { text: 'ok' }; } });
  await answer(req({ question: '@askflisk is neon good model?', context: '@rayan Google just shipped Gemini 4 Neon today' }), { X_BOT_KEY: KEY }, d);
  expect(query).toContain('is neon good model?');
  expect(query).toContain('Gemini 4 Neon');
  expect(seen[0].content).toContain('The post being replied to: "Google just shipped Gemini 4 Neon today"');
  expect(seen[0].content).toContain('Today is 20');
  expect(seen[0].content).toContain('not sure');
});

test('a picture ask is drawn, capped, and falls back to words when nothing was drawn', async () => {
  const drawn = [];
  const d = (extra = {}) => deps({ image: async (p) => { drawn.push(p); return 'data:image/jpeg;base64,AAAA'; }, ask: async () => { throw new Error('the model must not be asked'); }, ...extra });
  const res = await answer(req({ question: '@askflisk draw image of cat eating spaghetti', asker: '5' }), { X_BOT_KEY: KEY }, d());
  const body = await res.json();
  expect(body.image).toBe('data:image/jpeg;base64,AAAA');
  expect(drawn).toEqual(['draw image of cat eating spaghetti']);
  expect((await (await answer(req({ question: 'make me a picture of a fox', asker: '5' }), { X_BOT_KEY: KEY }, d())).json()).image).toBeTruthy();
  expect((await (await answer(req({ question: 'draw a cat', asker: '5' }), { X_BOT_KEY: KEY }, d({ image: async () => '' }))).json()).text).toContain('could not draw');
  const capped = await (await answer(req({ question: 'draw a cat', asker: '5' }), { X_BOT_KEY: KEY }, d({ over: async (s) => s === 'x-image-asker' }))).json();
  expect(capped.image).toBeUndefined();
  expect(capped.text).toContain('enough pictures');
  // Not a picture ask: answered in words as before.
  expect((await (await answer(req({ question: 'who drew the Mona Lisa?' }), { X_BOT_KEY: KEY }, deps({ image: async () => 'x' }))).json()).text).toBe('Rainy, 9°C.');
});

test('an app ask is built, published and returned as a link; capped; failures answer in words', async () => {
  const built = [];
  const d = (extra = {}) => deps({ build: async (q) => { built.push(q); return { url: 'https://chat.flisk.si/s/abc' }; }, ask: async () => { throw new Error('the model must not be asked'); }, ...extra });
  const body = await (await answer(req({ question: '@askflisk make me crm', asker: '5' }), { X_BOT_KEY: KEY }, d())).json();
  expect(body.link).toBe('https://chat.flisk.si/s/abc');
  expect(built).toEqual(['make me crm']);
  expect(body.image).toBeUndefined();
  const shot = await (await answer(req({ question: '@askflisk make me crm', asker: '5' }), { X_BOT_KEY: KEY }, d({ build: async () => ({ url: 'https://chat.flisk.si/s/abc', image: 'data:image/jpeg;base64,AAAA' }) }))).json();
  expect(shot.image).toBe('data:image/jpeg;base64,AAAA');
  expect(shot.link).toBe('https://chat.flisk.si/s/abc');
  expect((await (await answer(req({ question: 'build a todo app', asker: '5' }), { X_BOT_KEY: KEY }, d({ build: async () => ({ error: 'x' }) }))).json()).text).toContain('could not build');
  const capped = await (await answer(req({ question: 'build a todo app', asker: '5' }), { X_BOT_KEY: KEY }, d({ over: async (s) => s === 'x-build-asker' }))).json();
  expect(capped.link).toBeUndefined();
  expect(capped.text).toContain('enough builds');
  expect(extractHtml('Here:\n```html\n<!doctype html><html><body>hi</body></html>\n```\nenjoy')).toBe('<!doctype html><html><body>hi</body></html>');
  expect(extractHtml('no page here')).toBe('');
  expect(BUILD.test('what is a crm?')).toBe(false);
});

test('a picture in the post is read and the answer is made from it', async () => {
  const { seeImages, imageUrls } = await import('../src/see.js');
  expect(imageUrls(['https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/V.jpg', 'https://pbs.twimg.com/media/AbC-1.jpg?format=jpg&name=large', 'https://evil.test/a.jpg', 'http://pbs.twimg.com/media/x.jpg'])).toEqual(['https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/V.jpg', 'https://pbs.twimg.com/media/AbC-1.jpg?format=jpg&name=large']);
  const bsky = ['https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:abc123/bafkreiabc@jpeg', 'https://video.bsky.app/watch/did%3Aplc%3Aabc123/bafkreivid/thumbnail.jpg'];
  expect(imageUrls([...bsky, 'https://cdn.bsky.app.evil.test/img/feed_thumbnail/plain/did:plc:a/b@jpeg', 'https://cdn.bsky.app/img/avatar/plain/did:plc:a/b@jpeg', 'http://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:a/b@jpeg'])).toEqual(bsky);
  const seenWith = [];
  const asked = [];
  const d = deps({ see: async (urls, q) => (seenWith.push(urls, q), 'Tier C: Claude Code, Cline'), ask: async (m) => (asked.push(m[0].content), { text: 'It is not on the list.' }) });
  const body = await (await answer(req({ question: '@askflisk missing askflisk', asker: '9', images: ['https://pbs.twimg.com/media/AbC-1.jpg', 'https://evil.test/x.png'] }), { X_BOT_KEY: KEY }, d)).json();
  expect(body.text).toBe('It is not on the list.');
  expect(seenWith[0]).toEqual(['https://pbs.twimg.com/media/AbC-1.jpg']);
  expect(asked[0]).toContain('Tier C: Claude Code, Cline');
  const fakeAI = { run: async (model) => (model.includes('11b') ? {} : { description: 'a chart' }) };
  const f = async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  expect(await seeImages({ AI: fakeAI }, ['https://pbs.twimg.com/media/a.jpg'], 'what', f)).toBe('a chart');
  expect(await seeImages({}, ['https://pbs.twimg.com/media/a.jpg'], 'what', f)).toBe('');
});

test('pageShot renders html to a jpeg data URL and gives up quietly', async () => {
  const { pageShot } = await import('../src/shot.js');
  const env = { CF_ACCOUNT_ID: 'acc', CF_BROWSER_TOKEN: 'tok' };
  const calls = [];
  const ok = async (u, init) => (calls.push([u, init]), new Response(new Uint8Array([255, 216, 255, 217]), { headers: { 'content-type': 'image/jpeg' } }));
  expect(await pageShot(env, '<h1>hi</h1>', { fetchImpl: ok })).toBe('data:image/jpeg;base64,/9j/2Q==');
  expect(calls[0][0]).toBe('https://api.cloudflare.com/client/v4/accounts/acc/browser-rendering/screenshot');
  expect(calls[0][1].headers.authorization).toBe('Bearer tok');
  expect(JSON.parse(calls[0][1].body).html).toBe('<h1>hi</h1>');
  expect(await pageShot({}, '<h1>hi</h1>', { fetchImpl: ok })).toBe('');
  expect(await pageShot(env, '<h1>hi</h1>', { fetchImpl: async () => new Response('no', { status: 500 }) })).toBe('');
  expect(await pageShot(env, '<h1>hi</h1>', { fetchImpl: async () => { throw new Error('x'); } })).toBe('');
});

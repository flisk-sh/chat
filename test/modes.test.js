import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { handle } from '../src/index.js';
import { parseAction, runTask } from '../src/loop.js';
import { bm25Rank, cleanMode, cleanQuery, parseDuckDuckGo, relevant, searchWeb } from '../src/search.js';
import { makeSession } from '../src/session.js';
import { fakeD1 } from './d1.js';

const SCHEMA = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const ORIGIN = 'https://chat.test';
const env = () => ({ DB: fakeD1(SCHEMA), PUBLIC_ORIGIN: ORIGIN, SESSION_SECRET: 's', FLEET_URL: 'https://fleet.test', FLEET_SERVICE_SECRET: 'x'.repeat(40), INFERENCE_KEY: 'ik', INFERENCE_URL: 'https://inf.test/v1/chat/completions' });

// A model that plays a script and records every prompt it was sent.
const scripted = (replies) => {
  const seen = [];
  return { seen, ask: async (messages) => { seen.push(messages); return { text: replies.shift() ?? '{"say":"out of script"}' }; } };
};
const fakeComputer = () => {
  const calls = [];
  return {
    calls,
    start: async () => { calls.push('start'); return { data: { id: 'pod1', provider: 'daytona' } }; },
    run: async (_id, command) => { calls.push(`run:${command}`); return { data: { stdout: 'ok\n', stderr: '', exitCode: 0 } }; },
    write: async () => ({ data: {} }),
    read: async () => ({ data: { encoding: 'utf8', content: '' } }),
    stop: async () => { calls.push('stop'); return { status: 200 }; },
  };
};
const RESULTS = [
  { title: 'Bun 1.3 released', url: 'https://bun.sh/blog/bun-v1.3', snippet: 'Bun 1.3 ships a full-stack runtime.' },
  { title: 'Bun docs', url: 'https://bun.sh/docs', snippet: 'Documentation.' },
];

describe('mode and search helpers', () => {
  test('cleanMode keeps the five modes and falls back to chat for anything else', () => {
    for (const m of ['chat', 'build', 'create', 'search', 'computer']) expect(cleanMode(m)).toBe(m);
    for (const bad of [undefined, null, '', 'turbo', 'SEARCH', 42, {}]) expect(cleanMode(bad)).toBe('chat');
  });

  test('cleanQuery flattens control characters and caps the length', () => {
    expect(cleanQuery('  latest\n\tbun   release  ')).toBe('latest bun release');
    expect(cleanQuery('x'.repeat(500)).length).toBe(200);
    expect(cleanQuery(null)).toBe('');
  });

  test('parseAction knows {"search": ...}', () => {
    expect(parseAction('{"search": "bun release date"}')).toEqual({ type: 'search', query: 'bun release date' });
    expect(parseAction('{"search": "  "}').type).toBe('bad'); // an empty search is asked again, like an empty run
  });

  test('parseDuckDuckGo unwraps the redirect link and drops non-http links', () => {
    const html = `<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fbun.sh%2Fdocs&amp;rut=x">Bun <b>docs</b></a><a class="result__snippet" href="x">The fast runtime.</a>
<a class="result__a" href="javascript:alert(1)">evil</a><a class="result__snippet" href="x">no</a>`;
    const r = parseDuckDuckGo(html);
    expect(r).toEqual([{ title: 'Bun docs', url: 'https://bun.sh/docs', snippet: 'The fast runtime.' }]);
  });

  const internet = (down = []) => async (url) => {
    const u = new URL(url);
    if (down.includes(u.host)) throw new Error('down');
    if (u.host === 'hn.algolia.com') return Response.json({ hits: [{ title: 'Bun 1.3 released', url: 'https://bun.sh/blog/bun-v1.3?utm=x', points: 900, num_comments: 300, objectID: '1' }, { title: 'Show HN: my garden', url: null, points: 3, objectID: '2' }] });
    if (u.host === 'api.github.com') return Response.json({ items: [{ full_name: 'oven-sh/bun', html_url: 'https://github.com/oven-sh/bun', description: 'Incredibly fast JavaScript runtime, bundler, test runner', stargazers_count: 80000 }] });
    if (u.host === 'api.stackexchange.com') return Response.json({ items: [{ title: 'How do I install bun &amp; node?', link: 'https://stackoverflow.com/q/1', is_answered: true, score: 5, tags: ['bun'] }] });
    if (u.host === 'en.wikipedia.org') return Response.json({ query: { search: [{ title: 'Bun (software)', snippet: 'Bun is a <span>JavaScript</span> runtime' }, { title: 'Cinnamon roll', snippet: 'a sweet pastry' }] } });
    if (u.host === 'export.arxiv.org') return new Response('<feed><entry><id>https://arxiv.org/abs/1</id><title>A study of cats</title><summary>felines</summary></entry></feed>');
    return new Response('blocked', { status: 202 }); // duckduckgo
  };
  const memoryCache = () => {
    const m = new Map();
    return { m, match: async (req) => (m.has(req.url) ? new Response(m.get(req.url)) : undefined), put: async (req, res) => { m.set(req.url, await res.text()); } };
  };

  test('our own engine: asks several free sources, merges, ranks by bm25, drops results that do not match, dedupes', async () => {
    const r = await searchWeb('bun javascript runtime', { fetch: internet(), cache: memoryCache() });
    const urls = r.results.map((x) => x.url);
    expect(urls).toContain('https://github.com/oven-sh/bun');
    expect(urls).toContain('https://en.wikipedia.org/wiki/Bun_(software)');
    expect(urls).not.toContain('https://en.wikipedia.org/wiki/Cinnamon_roll');
    expect(r.results.some((x) => /garden|cats/.test(x.title))).toBe(false);
    expect(new Set(urls).size).toBe(urls.length);
    expect(JSON.stringify(r.results)).not.toContain('&amp;');
  });

  test('one source being down or blocked does not break the search', async () => {
    const r = await searchWeb('bun javascript runtime', { fetch: internet(['api.github.com', 'hn.algolia.com', 'api.stackexchange.com', 'export.arxiv.org']), cache: memoryCache() });
    expect(r.results.map((x) => x.url)).toEqual(['https://en.wikipedia.org/wiki/Bun_(software)']);
  });

  test('snippets are cleaned: nested tags and double-encoded entities cannot survive', async () => {
    const fetch = async (url) => {
      if (new URL(url).host !== 'hn.algolia.com') return new Response('no', { status: 404 });
      return Response.json({ hits: [{ title: 'bun <<b>script</b>>alert(1)</b> &amp;lt;i&amp;gt; &lt;img onerror=x&gt;', url: 'https://bun.sh/x', points: 1, objectID: '1' }] });
    };
    const r = await searchWeb('bun alert', { fetch, cache: memoryCache() });
    const title = r.results[0].title;
    expect(title).not.toMatch(/[<>]/);
    expect(title).toContain('&lt;i&gt;'); // decoded once, not twice
  });

  test('bm25 puts the result that matches more of the question first, and drops the ones that match nothing', () => {
    const docs = [
      { title: 'Cats', url: 'a', snippet: 'about cats' },
      { title: 'Bun runtime', url: 'b', snippet: 'fast javascript runtime' },
      { title: 'Bun', url: 'c', snippet: 'a pastry' },
    ];
    expect(bm25Rank('bun javascript runtime', docs).map((x) => x.url)).toEqual(['b', 'c']);
  });

  test('a repeated question is answered from the cache with no request to any source', async () => {
    const cache = memoryCache();
    let calls = 0;
    const counting = async (u, i) => { calls++; return internet()(u, i); };
    const first = await searchWeb('Bun JavaScript runtime', { fetch: counting, cache });
    expect(calls).toBeGreaterThan(0);
    const before = calls;
    const again = await searchWeb('bun javascript runtime', { fetch: counting, cache });
    expect(calls).toBe(before);
    expect(again.cached).toBe(true);
    expect(again.results).toEqual(first.results);
  });

  test('a failed search is not cached, and a broken cache never breaks the search', async () => {
    const cache = memoryCache();
    await searchWeb('zzzz nothing', { fetch: async () => new Response('no', { status: 404 }), cache });
    expect(cache.m.size).toBe(0);
    const broken = { match: async () => { throw new Error('cache down'); }, put: async () => { throw new Error('cache down'); } };
    expect((await searchWeb('bun javascript runtime', { fetch: internet(), cache: broken })).results.length).toBeGreaterThan(1);
  });

  test('a DuckDuckGo bot challenge (HTTP 202) adds nothing, and an unrelated Wikipedia page is not used', async () => {
    const fetch = async (url) => {
      const u = new URL(url);
      if (u.host === 'en.wikipedia.org') return Response.json({ query: { search: [{ title: 'The Latest', snippet: 'an album' }] } });
      if (u.host === 'html.duckduckgo.com') return new Response('<a class="result__a" href="https://x.com/">anomaly</a>', { status: 202 });
      return new Response('no', { status: 404 });
    };
    const r = await searchWeb('latest bun release', { fetch, cache: memoryCache() });
    expect(r.results).toBeUndefined();
    expect(r.error).toContain('no web results');
    expect(relevant('who won the 2022 world cup', { title: '2022 FIFA World Cup final', snippet: 'who won' })).toBe(true);
    expect(relevant('latest bun release', { title: 'Android 17', snippet: 'Cinnamon Bun' })).toBe(false);
  });

  test('searchWeb reports an error when every source is empty or down', async () => {
    const r = await searchWeb('zzzz', { fetch: async () => { throw new Error('down'); } });
    expect(r.error).toContain('no web results');
    expect((await searchWeb('   ', { fetch: async () => null })).error).toContain('words');
  });
});

describe('Search mode in the task loop', () => {
  test('searches, feeds numbered sources to the model, answers with citations, and never starts a computer', async () => {
    const model = scripted(['{"search":"bun release"}', '{"say":"Bun 1.3 is out [1]."}']);
    const computer = fakeComputer();
    const ev = [];
    const asked = [];
    const r = await runTask({ task: 'what is new in bun?', mode: 'search', model: model.ask, computer, search: async (q) => { asked.push(q); return { results: RESULTS }; }, emit: (e) => ev.push(e) });
    expect(asked).toEqual(['bun release']);
    expect(r.answer).toBe('Bun 1.3 is out [1].');
    expect(computer.calls).toEqual([]); // no computer for a web answer
    expect(ev.find((e) => e.type === 'sources').results).toEqual(RESULTS);
    // The first prompt turns search on; the second carries the numbered results.
    expect(model.seen[0][0].content).toContain('SEARCH MODE is on');
    const second = JSON.stringify(model.seen[1]);
    expect(second).toContain('[1] Bun 1.3 released');
    expect(second).toContain('https://bun.sh/docs');
  });

  test('a failed search is reported to the model, which can still answer', async () => {
    const model = scripted(['{"search":"x"}', '{"say":"Nothing found."}']);
    const ev = [];
    const r = await runTask({ task: 't', mode: 'search', model: model.ask, computer: fakeComputer(), search: async () => ({ error: 'no web results for "x"' }), emit: (e) => ev.push(e) });
    expect(r.answer).toBe('Nothing found.');
    expect(JSON.stringify(model.seen[1])).toContain('no web results');
  });

  test('stops after 2 searches and asks for the answer', async () => {
    const model = scripted(Array(4).fill('{"search":"again"}').concat('{"say":"done [1]"}'));
    let n = 0;
    const r = await runTask({ task: 't', mode: 'search', model: model.ask, computer: fakeComputer(), maxSteps: 12, search: async () => { n++; return { results: RESULTS }; } });
    expect(n).toBe(2);
    expect(r.answer).toBe('done [1]');
  });

  test('outside Search mode a search action is refused and nothing is fetched', async () => {
    const model = scripted(['{"search":"bun"}', '{"say":"ok"}']);
    let n = 0;
    await runTask({ task: 't', mode: 'chat', model: model.ask, computer: fakeComputer(), search: async () => { n++; return { results: RESULTS }; } });
    expect(n).toBe(0);
    expect(JSON.stringify(model.seen[1])).toContain('Web search is off');
    expect(model.seen[0][0].content).not.toContain('SEARCH MODE');
  });
});

describe('Computer mode in the task loop', () => {
  test('an answer with no computer used is sent back once, then the computer does the work', async () => {
    const model = scripted(['{"say":"2+2 is 4"}', '{"run":"python3 -c \\"print(2+2)\\""}', '{"say":"It printed 4."}']);
    const computer = fakeComputer();
    const r = await runTask({ task: 'compute 2+2', mode: 'computer', model: model.ask, computer });
    expect(model.seen[0][0].content).toContain('COMPUTER MODE is on');
    expect(JSON.stringify(model.seen[1])).toContain('Computer mode is on');
    expect(computer.calls[0]).toBe('start');
    expect(computer.calls.some((c) => c.startsWith('run:'))).toBe(true);
    expect(computer.calls.at(-1)).toBe('stop');
    expect(r.answer).toBe('It printed 4.');
  });

  test('chat mode still answers straight away with no computer (unchanged behaviour)', async () => {
    const model = scripted(['{"say":"4"}']);
    const computer = fakeComputer();
    const r = await runTask({ task: '2+2', mode: 'chat', model: model.ask, computer });
    expect(r.answer).toBe('4');
    expect(computer.calls).toEqual([]);
    expect(model.seen[0][0].content).not.toContain('COMPUTER MODE');
  });
});

describe('/api/run with modes', () => {
  const run = async (body, { connected, replies = ['{"search":"bun"}', '{"say":"From the web [1]."}'] }) => {
    const e = env();
    const cookie = (await makeSession(e, 'octo')).split(';')[0];
    const modelPrompts = [];
    const fetchImpl = async (url, init = {}) => {
      const u = new URL(url);
      if (u.host === 'inf.test') {
        modelPrompts.push(JSON.parse(init.body).messages);
        return Response.json({ choices: [{ message: { content: replies.shift() ?? '{"say":"x"}' } }] });
      }
      if (u.host === 'fleet.test') return Response.json({ connections: connected ? { daytona: { hint: 'abcd' } } : {} });
      if (u.host === 'hn.algolia.com') return Response.json({ hits: [{ title: 'Bun docs', url: 'https://bun.sh/docs', points: 10, objectID: '9' }] });
      return Response.json({}, { status: 404 });
    };
    const res = await handle(new Request(`${ORIGIN}/api/run`, { method: 'POST', headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ task: 'what is new in bun', ...body }) }), e, { fetchImpl });
    return { res, modelPrompts };
  };

  test('Search mode works with NO computer connected and streams sources + answer', async () => {
    const { res, modelPrompts } = await run({ mode: 'search' }, { connected: false });
    expect(res.status).toBe(200);
    const ev = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
    expect(ev.find((e) => e.type === 'sources').results.map((x) => x.url)).toContain('https://bun.sh/docs');
    expect(ev.find((e) => e.type === 'answer').text).toBe('From the web [1].');
    expect(modelPrompts[0][0].content).toContain('SEARCH MODE is on');
  });

  test('Computer mode with no computer connected: the model is held to the computer, and the page is asked to start one', async () => {
    const { res, modelPrompts } = await run({ mode: 'computer' }, { connected: false, replies: ['{"say":"it is 4"}', '{"run":"echo 4"}', '{"say":"4"}'] });
    expect(res.status).toBe(200);
    const ev = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
    expect(modelPrompts[0][0].content).toContain('COMPUTER MODE is on');
    expect(JSON.stringify(modelPrompts[1])).toContain('Computer mode is on'); // the answer with no computer was sent back
    expect(ev.some((e) => e.type === 'needcomputer')).toBe(true);
  });

  test('an unknown mode is treated as chat: neither mode prompt is sent', async () => {
    const { res, modelPrompts } = await run({ mode: 'ultra' }, { connected: false, replies: ['{"say":"hi"}'] });
    expect(res.status).toBe(200);
    await res.text();
    const sys = modelPrompts[0][0].content;
    expect(sys).not.toContain('SEARCH MODE');
    expect(sys).not.toContain('COMPUTER MODE');
  });
});

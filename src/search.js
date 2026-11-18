// Search mode: the model asks for a web search, the Worker runs it, the model answers from the numbered sources.
// No computer is started for a search. This is our own engine, with no paid search API and no key:
//   1. a fan-out to free public APIs that do not block Workers (Wikipedia, Hacker News, GitHub, Stack Overflow, arXiv,
//      DuckDuckGo's page as one best-effort source);
//   2. our own bm25 ranking over all of it, with junk dropped (a result must match the question), dedupe by address;
//   3. the answer is kept for an hour in the Cache API (free, no database, no KV), so a repeated question costs nothing.
// Serverless and free-plan friendly: no D1, no KV writes, no hosted service.

export const MODES = ['chat', 'build', 'create', 'search', 'computer'];
export const cleanMode = (m) => (MODES.includes(String(m)) ? String(m) : 'chat');

export const MAX_RESULTS = 6;
export const MAX_QUERY = 200;

export const cleanQuery = (q) => String(q ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY);

// Plain text from a snippet that may hold HTML: tags are removed until none are left, entities are decoded in ONE pass
// (so "&amp;lt;" stays "&lt;" and is never decoded twice), and any angle bracket that is left is dropped.
const ENTITIES = { amp: '&', quot: '"', lt: '<', gt: '>', apos: "'" };
const decodeEntity = (_, e) => {
  if (e[0] !== '#') return ENTITIES[e.toLowerCase()] ?? _;
  const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
  return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : _;
};
const text = (s, n) => {
  let t = String(s ?? '');
  for (let prev = ''; prev !== t; ) {
    prev = t;
    t = t.replace(/<[^>]*>/g, '');
  }
  return t.replace(/&(amp|quot|lt|gt|apos|#\d{1,7}|#[xX][0-9a-fA-F]{1,6});/g, decodeEntity).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
};

// Only http(s) links, so a result can never become a javascript: link on the page.
const safeUrl = (u) => {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : '';
  } catch {
    return '';
  }
};

// DuckDuckGo wraps each link as //duckduckgo.com/l/?uddg=<real url>.
export function parseDuckDuckGo(html) {
  const out = [];
  // One block per result: from one result link to the next, so a missing snippet cannot leak into the neighbour.
  const blocks = String(html).split(/(?=<a[^>]*class="result__a")/);
  for (const b of blocks) {
    if (out.length >= MAX_RESULTS) break;
    const a = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(b);
    if (!a) continue;
    let href = a[1].replace(/&amp;/g, '&');
    if (href.startsWith('//')) href = `https:${href}`;
    try {
      const u = new URL(href);
      if (u.searchParams.get('uddg')) href = u.searchParams.get('uddg');
    } catch {}
    const url = safeUrl(href);
    const snip = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/.exec(b);
    if (url) out.push({ title: text(a[2], 120), url, snippet: text(snip?.[1], 300) });
  }
  return out;
}

// Words that say nothing about the topic ("latest", "how", "the"): they never count as a match.
const GENERIC = new Set('is in of to on at be by it as or do if we me my up so no an us you your i am he she they them his her its tell give show find the and for with from about what who whom when where why how which that this are was were has have had can will would should could does did into over latest new newest best top news today now current recent'.split(' '));
const topicWords = (q) => [...new Set(String(q).toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [])].filter((w) => !GENERIC.has(w));

// Some sources (Wikipedia, GitHub) always answer with their closest page, even a wrong one ("latest bun release" ->
// "The Latest", a repo that says "bundle"). A wrong source is worse than none: keep a result only when whole words of
// the question (not generic ones) appear in it, at least 60% of them.
// A page named by its subject (Wikipedia, a GitHub repo) has the subject in its title: "Android 17" is not an answer to
// "bun release" because its text says "Cinnamon Bun" somewhere.
export function titled(q, r) {
  const words = topicWords(q);
  if (!words.length) return true;
  const have = new Set(String(r.title).toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []);
  return words.some((w) => have.has(w));
}

export function relevant(q, r) {
  const words = topicWords(q);
  if (!words.length) return true;
  const have = new Set(String(`${r.title} ${r.snippet}`).toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []);
  return words.filter((w) => have.has(w)).length >= Math.max(1, Math.ceil(words.length * 0.6));
}


const TIMEOUT_MS = 4000;
const RELEASE_WORDS = new Set(['release', 'releases', 'version', 'versions', 'changelog', 'changes', 'update', 'updates']);
const RELEASE_Q = /\b(release|releases|version|changelog|changes|update|updates|new in)\b/i;
const UA = { 'user-agent': 'flisk-chat/1.0 (+https://chat.flisk.si)' };
const json = async (fetch, url, init) => {
  const r = await fetch(url, { ...init, headers: { ...UA, accept: 'application/json', ...(init?.headers || {}) } });
  return r.ok ? r.json().catch(() => null) : null;
};

// Each source: (query, fetch) -> [{ title, url, snippet }]. A source that fails or is blocked just returns nothing.
const SOURCES = {
  wikipedia: async (q, fetch) => {
    const j = await json(fetch, `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=${MAX_RESULTS}&srsearch=${encodeURIComponent(q)}`);
    return (j?.query?.search || []).map((x) => ({ title: text(x.title, 120), url: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(x.title).replace(/ /g, '_'))}`, snippet: text(x.snippet, 300) }))  .filter((x) => relevant(q, x) && titled(q, x)); // it always answers with its closest page, even a wrong one
  },
  hackernews: async (q, fetch) => {
    const j = await json(fetch, `https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=${MAX_RESULTS}&query=${encodeURIComponent(q)}`);
    return (j?.hits || []).map((x) => ({ title: text(x.title, 120), url: safeUrl(x.url) || `https://news.ycombinator.com/item?id=${x.objectID}`, snippet: text(`${x.points ?? 0} points, ${x.num_comments ?? 0} comments on Hacker News. ${x.story_text || ''}`, 300) }));
  },
  github: async (q, fetch) => {
    // GitHub's repo search matches names and descriptions: "latest bun release" finds nothing, "bun" finds the repo.
    const subject = topicWords(q).filter((w) => !RELEASE_WORDS.has(w)).join(' ') || q;
    const j = await json(fetch, `https://api.github.com/search/repositories?per_page=${MAX_RESULTS - 2}&q=${encodeURIComponent(subject)}`);
    const repos = (j?.items || []).map((x) => ({ full: x.full_name, title: text(x.full_name, 120), url: safeUrl(x.html_url), snippet: text(`${x.stargazers_count ?? 0} stars. ${x.description || ''}`, 300) })).filter((x) => relevant(subject, x) && titled(subject, x));
    // "latest bun release": the answer is the top repo's latest release, so read it (one more request).
    if (repos[0] && RELEASE_Q.test(q)) {
      const rel = await json(fetch, `https://api.github.com/repos/${repos[0].full}/releases/latest`);
      if (rel?.html_url) repos.unshift({ title: text(`${repos[0].full} latest release: ${rel.name || rel.tag_name}`, 120), url: safeUrl(rel.html_url), snippet: text(`Released ${String(rel.published_at || '').slice(0, 10)}. ${rel.body || ''}`, 300) });
    }
    return repos.map(({ full, ...r }) => r);
  },
  stackoverflow: async (q, fetch) => {
    const j = await json(fetch, `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&site=stackoverflow&pagesize=${MAX_RESULTS - 2}&q=${encodeURIComponent(q)}`);
    return (j?.items || []).map((x) => ({ title: text(x.title, 120), url: safeUrl(x.link), snippet: text(`${x.is_answered ? 'Answered' : 'Unanswered'}, ${x.score ?? 0} votes. Tags: ${(x.tags || []).join(', ')}`, 300) }));
  },
  arxiv: async (q, fetch) => {
    const r = await fetch(`https://export.arxiv.org/api/query?max_results=3&search_query=all:${encodeURIComponent(q)}`, { headers: UA });
    if (!r.ok) return [];
    const xml = await r.text();
    return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => ({
      title: text(/<title>([\s\S]*?)<\/title>/.exec(m[1])?.[1], 120),
      url: safeUrl(text(/<id>([\s\S]*?)<\/id>/.exec(m[1])?.[1], 200)),
      snippet: text(/<summary>([\s\S]*?)<\/summary>/.exec(m[1])?.[1], 300),
    }));
  },
  duckduckgo: async (q, fetch) => {
    const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; flisk-chat)' } });
    // 202 is DuckDuckGo's bot challenge page: a failure, not "no results".
    return r.status === 200 ? parseDuckDuckGo(await r.text()) : [];
  },
};
// A small prior for how much to trust a source when two results score the same.
const PRIOR = { wikipedia: 0.3, github: 0.1, stackoverflow: 0.1, hackernews: 0, arxiv: 0, duckduckgo: 0.4 };

const tokens = (s) => String(s ?? '').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];

// bm25 over the candidate set (title counts three times). Documents with no query word at all score 0 and are dropped.
export function bm25Rank(query, docs) {
  const q = [...new Set(tokens(query))];
  if (!q.length || !docs.length) return [];
  const bags = docs.map((d) => tokens(`${d.title} ${d.title} ${d.title} ${d.snippet}`));
  const avg = bags.reduce((n, b) => n + b.length, 0) / bags.length || 1;
  const df = (w) => bags.filter((b) => b.includes(w)).length;
  const k1 = 1.5;
  const b = 0.75;
  return docs
    .map((d, i) => {
      let score = 0;
      for (const w of q) {
        const f = bags[i].filter((t) => t === w).length;
        if (!f) continue;
        const n = df(w);
        const idf = Math.log(1 + (docs.length - n + 0.5) / (n + 0.5));
        score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * bags[i].length) / avg)));
      }
      // The more of the question's words a title carries, the more it is about that subject: bm25 alone sees only the fragment.
      const inTitle = new Set(tokens(d.title));
      const cover = topicWords(query).filter((w) => inTitle.has(w)).length / (topicWords(query).length || 1);
      return { ...d, score: score ? score + (PRIOR[d.source] || 0) + 2 * cover : 0 };
    })
    .filter((d) => d.score > 0)
    .sort((x, y) => y.score - x.score);
}

// "https://www.x.com/a/?utm=1#top" and "http://x.com/a" are the same page.
const sameUrl = (u) => String(u).toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '').replace(/\/+$/, '');

// ---- cache: the Cache API of the Worker's data centre (free, no binding, nothing to create) ----
const CACHE_SECONDS = 3600;
const cacheKey = (q) => new Request(`https://search.chat.flisk.si/v3?q=${encodeURIComponent(q.toLowerCase())}`);
async function cacheGet(cache, q) {
  try {
    const hit = await cache?.match(cacheKey(q));
    return hit ? await hit.json() : null;
  } catch {
    return null;
  }
}
async function cachePut(cache, q, results) {
  try {
    await cache?.put(cacheKey(q), new Response(JSON.stringify(results), { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_SECONDS}` } }));
  } catch {}
}

// Returns { results: [{ title, url, snippet, source }] } or { error }. `cache` defaults to the data centre's Cache API.
export async function searchWeb(query, { fetch = globalThis.fetch, only = null, cache = globalThis.caches?.default } = {}) {
  const q = cleanQuery(query);
  if (!q) return { error: 'the search needs words to look for' };
  const saved = await cacheGet(cache, q);
  if (saved?.length) return { results: saved, cached: true };
  const timed = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const names = (only || Object.keys(SOURCES)).filter((n) => SOURCES[n]);
  const live = await Promise.all(names.map((n) => SOURCES[n](q, timed).then((rs) => rs.filter((x) => x.url && x.title).map((x) => ({ ...x, source: n }))).catch(() => [])));
  const seen = new Set();
  const merged = live.flat().filter((r) => {
    const k = sameUrl(r.url);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  // Every source but a real search engine (DuckDuckGo) answers with its closest items, right or wrong: an item is kept only
  // when a topic word is in its title.
  const ranked = bm25Rank(q, merged.filter((r) => r.source === 'duckduckgo' || titled(q, r))).slice(0, MAX_RESULTS);
  if (!ranked.length) return { error: `no web results for "${q}"` };
  const results = ranked.map(({ title, url, snippet, source }) => ({ title, url, snippet, source }));
  // A search snippet is a fragment ("The 2022 FIFA World Cup was the 22nd..."); the answer is in the page's opening
  // paragraph. Read it for the best three Wikipedia pages (Wikipedia's summary API: free, no key).
  await Promise.all(results.filter((r) => r.source === 'wikipedia').slice(0, 3).map(async (r) => {
    const name = decodeURIComponent(r.url.split('/wiki/')[1] || '');
    const j = name ? await json(timed, `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`).catch(() => null) : null;
    const extract = text(j?.extract, 600);
    if (extract.length > r.snippet.length) r.snippet = extract;
  }));
  await cachePut(cache, q, results);
  return { results };
}

// No AI is available (every free model is busy or out of budget): the answer is what the web says, straight from the best
// results, with the sources. Better than an error when the search already found the page.
export function answerFromWeb(results) {
  const top = results.slice(0, 3).filter((r) => r.snippet);
  const body = top.map((r, i) => `**${r.title}** [${i + 1}]\n${r.snippet}`).join('\n\n');
  const sources = results.map((r, i) => `- [${i + 1}] [${r.title}](${r.url})`).join('\n');
  return `${body || 'These are the best matches I found.'}\n\n**Sources**\n${sources}\n\n_The free AI is busy right now, so this comes straight from the web without it writing an answer. Try again in a minute for a written one._`;
}

// What the model reads back: numbered, so the answer can cite [1], [2].
export const formatResults = (results) => results.map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`).join('\n\n');

// Extra instructions per mode. chat/build/create keep the normal prompt.
export const modeNote = (mode, maxSteps) => {
  if (mode === 'search') {
    return `\n\nSEARCH MODE is on. You can search the web with one more action shape: {"search": "<short query>"}. Search first for anything about facts, news, prices, people, products or "latest". Search again with different words if the first results do not answer it (at most 2 searches). Then "say" the answer in your own words and cite the sources as [1], [2] matching the numbered results. Do not start a computer unless the user asks you to build or run something.`;
  }
  if (mode === 'computer') {
    return `\n\nCOMPUTER MODE is on. The user wants real work done on the computer. Your FIRST action must be "run" or "write" on the computer, not "say". Check results by running them, do the work in up to ${Math.max(1, maxSteps - 1)} actions, and "say" what you did and the result.`;
  }
  return '';
};

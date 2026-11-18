import { asksAnalysis } from './analysis-style.js';
import { sayStreamer } from './say-stream.js';
import { BAD_REPLIES } from './model.js';
import { MAX_STEPS, asksToBuild, githubSourceIn, isBigApp, taskPrompt } from './prompt.js';
import { parseWidget } from './widgets.js';
import { cleanVideo, makeVideo } from './video.js';
import { cleanSystem, makeSystem } from './system.js';
import { cleanShare, KEEP_DAYS, shareApp } from './share.js';
import { cleanSite, LAYOUTS, photoPrompt, renderSite } from './sites.js';
import { scrub, setupGithub } from './github.js';
import { searchWords, sourcesNote, splitPoints, wantsLookup, withSources } from './lookup.js';
import { cleanQuery, formatResults, modeNote, searchWeb } from './search.js';

export { MAX_STEPS };
// A layout page carries its fonts and a photo, so it may be bigger than a hand-written page.
export const MAX_LAYOUT_BYTES = 1536 * 1024;
// One task: a model plans, a computer from fleet does the work, the answer comes back. One task = one computer,
// started on the first action and always stopped at the end.
// A "say" that gives up or hands the problem back to the user.
const GIVE_UP = /\b(api key|apikey|access token|please provide|provide a valid|you need to (provide|sign|log)|i (can't|cannot|couldn't|could not|am unable|was unable|'m unable)|unable to|failed to|not able to|could not be|couldn't be|cannot be|can't be|is not available|isn't available|not available right now|try again later|check your internet)\b/i;
// The visitor's own key pays for its own steps, so a bigger app (install, write several files, start, check) fits.
export const BYO_STEPS = 16;
export const MAX_WORKER = 100_000;
export const GITHUB_STEPS = 20; // a fork-to-PR run needs more than 16 actions, but Workers Free stops at 50 subrequests per run (a 32-action run died at 25)
export const MAX_TASK = 2000;
const OUT_CHARS = 1500;


// The first complete {...} in `s` from `start`, or '' when it never closes. Braces inside strings do not count.
function firstObject(s, start) {
  let depth = 0;
  let inString = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return s.slice(start, i + 1);
  }
  return '';
}

// Models guess the home folder (/home/user, /home/ubuntu, /root), but it differs per computer (Upstash: /home/boxuser,
// where /home/user cannot be made). A path under a guessed home folder goes to the real one: ~ is expanded on the computer.
// A published page is one file. A site written as index.html plus its own styles.css and app.js (the user asked for
// separate files) is bundled here: each stylesheet <link> and <script src> that names a file next to the page is
// replaced by that file's text. Links to other sites, to / paths and to data: stay as they are.
const IMAGE_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml' };
const LOCAL = (href) => href && !/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(href);
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(1).find((v) => v != null);
export async function inlineLocal(html, pagePath, read) {
  const dir = String(pagePath).includes('/') ? String(pagePath).replace(/\/[^/]*$/, '/') : '';
  const files = new Map();
  const missing = [];
  const deferred = [];
  const load = async (href) => {
    const path = dir + href.replace(/^\.\//, '').replace(/[?#].*$/, '');
    if (!files.has(path)) {
      const r = await read(path);
      files.set(path, r.error || r.data?.encoding !== 'utf8' ? null : r.data.content);
      if (files.get(path) == null) missing.push(href);
    }
    return files.get(path);
  };
  // A picture next to the page (the model saved cat.jpg and wrote <img src="cat.jpg">) goes into the page as data:
  // a published page is one file, so a picture left beside it would show as a broken image.
  const picture = async (src) => {
    const path = dir + src.replace(/^\.\//, '').replace(/[?#].*$/, '');
    const type = IMAGE_TYPES[path.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]];
    const r = type ? await read(path) : { error: 'not a picture' };
    const content = r.error ? '' : r.data?.content;
    // Only an SVG is text: any other picture read as text has lost its bytes.
    const data = !content ? '' : r.data.encoding === 'base64' ? String(content).replace(/\s+/g, '') : type === 'image/svg+xml' ? btoa(String.fromCharCode(...new TextEncoder().encode(content))) : '';
    if (!data) missing.push(src);
    return data ? `data:${type};base64,${data}` : '';
  };
  const tags = [...html.matchAll(/<link\b[^>]*>|<script\b[^>]*>\s*<\/script[^>]*>|<img\b[^>]*>/gi)];
  let out = '';
  let at = 0;
  let pictures = 0;
  for (const m of tags) {
    const tag = m[0];
    if (/^<img/i.test(tag)) {
      const src = attr(tag, 'src');
      if (!LOCAL(src)) continue;
      const uri = await picture(src);
      if (!uri) continue;
      pictures++;
      out += html.slice(at, m.index) + tag.replace(/(\ssrc\s*=\s*)(?:"[^"]*"|'[^']*'|[^\s>]+)/i, `$1"${uri}"`);
      at = m.index + tag.length;
      continue;
    }
    const isLink = /^<link/i.test(tag);
    const href = attr(tag, isLink ? 'href' : 'src');
    if (!LOCAL(href) || (isLink && !/stylesheet/i.test(attr(tag, 'rel') || ''))) continue;
    const text = await load(href);
    if (text == null) continue;
    const open = isLink ? '' : tag.match(/^<script\b([^>]*)>/i)[1];
    const keep = open.replace(/\s(?:src|defer|async)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, '');
    const block = isLink ? `<style>\n${text.replace(/<\/style/gi, '<\\/style')}\n</style>` : `<script${keep}>\n${text.replace(/<\/script/gi, '<\\/script')}\n</script>`;
    // An inline script cannot be deferred, so a deferred one moves to the end of the body, where it runs at the same point.
    const later = !isLink && /\sdefer\b/i.test(open) && !/type\s*=\s*["']?module/i.test(open);
    out += html.slice(at, m.index) + (later ? '' : block);
    if (later) deferred.push(block);
    at = m.index + tag.length;
  }
  out += html.slice(at);
  if (deferred.length) {
    const end = out.search(/<\/body\s*>(?![\s\S]*<\/body\s*>)/i);
    out = end < 0 ? `${out}\n${deferred.join('\n')}` : `${out.slice(0, end)}${deferred.join('\n')}\n${out.slice(end)}`;
  }
  return { html: out, missing, pictures };
}

// Pictures a page shows that are not in the page and not on the web: each is a broken image for the visitor.
export function localImages(html) {
  return [...String(html ?? '').matchAll(/<img\b[^>]*>/gi)].map((m) => attr(m[0], 'src')).filter((src) => src == null || src === '' || LOCAL(src));
}

// Files Flisk writes itself (the same list as flisk's cli/src/utils/generated-paths.ts). Flisk rewrites them on the
// next `flisk up`, so an edit there is lost or blocks the start: refuse it and say which input to change instead.
export function fliskGenerated(path) {
  const parts = String(path).split('/').filter(Boolean);
  const name = parts[parts.length - 1] || '';
  const gen = parts.indexOf('.autogenerated');
  if (gen > 0) return `${parts.slice(0, gen).join('/')}/service.json`;
  if (gen === 0) return 'service.json';
  const p = parts.join('/');
  if (parts.some((x) => x.startsWith('product_autogenerated_')) || /(^|\/)\.flisk\/\.flisk-out(\/|$)/.test(p) || /(^|\/)shared-platform-engineering\/docker-templates(\/|$)/.test(p)) return 'the service.json files';
  if (name === 'Tiltfile' || name === '.tiltignore' || /^TILT_[^/]+\.star$/.test(name)) return 'the service.json files';
  return null;
}

export function homePath(path) {
  return String(path).replace(/^\/(?:home\/[^/]+|root)(?=\/|$)/, '~');
}

export function parseAction(text) {
  let s = String(text ?? '').trim();

  // Strip common tool-call / DSML / XML wrappers the free model sometimes emits.
  s = s
    .replace(/<\|DSML\|>[\s\S]*?<\|\/DSML\|>/gi, '')
    .replace(/<\/?invoke[^>]*>/gi, '')
    .replace(/<\/?parameter[^>]*>/gi, '')
    .replace(/<\|[^|]+\|>/g, '')
    .trim();

  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      let a;
      try {
        a = JSON.parse(s.slice(start, end + 1));
      } catch (e) {
        // Several actions in one reply (write, then publish, then an invented link): do the first, the loop asks for the next.
        const first = firstObject(s, start);
        if (!first || first.length === end + 1 - start) throw e;
        a = JSON.parse(first);
        if (typeof a?.say === 'string') throw e;
      }
      if (typeof a?.run === 'string' && a.run.trim()) return { type: 'run', command: a.run.trim() };
      if (a?.write && typeof a.write.path === 'string' && typeof a.write.content === 'string') return { type: 'write', path: a.write.path, content: a.write.content };
      if (typeof a?.read === 'string' && a.read.trim()) return { type: 'read', path: a.read.trim() };
      if (typeof a?.publish === 'string' && a.publish.trim()) return { type: 'publish', path: a.publish.trim() };
      if (typeof a?.worker === 'string' && a.worker.trim()) return { type: 'worker', path: a.worker.trim() };
      if (a?.video) {
        const spec = cleanVideo(a.video);
        if (spec) return { type: 'video', spec };
      }
      if (a?.system) {
        const spec = cleanSystem(a.system);
        if (spec) return { type: 'system', spec };
      }
      if (a?.site) {
        const spec = cleanSite(a.site);
        if (spec) return { type: 'site', spec };
        return { type: 'bad', text: s, why: `A "site" needs "layout" (one of ${LAYOUTS.join(', ')}) and a "title". Send it again with both, or write and publish an index.html if no layout fits.` };
      }
      if (a?.image) {
        const spec = cleanImage(a.image);
        if (spec) return { type: 'image', spec };
        return { type: 'bad', text: s, why: 'An "image" needs a "prompt": what the picture shows. Send it again.' };
      }
      if (a?.share !== undefined) {
        const spec = cleanShare(a.share);
        if (spec) return { type: 'share', spec };
      }
      if (typeof a?.search === 'string' && a.search.trim()) return { type: 'search', query: a.search.trim() };
      if (a?.widget && typeof a.widget === 'object') return { type: 'widget', raw: a.widget };
      if (typeof a?.say === 'string') return { type: 'say', text: a.say };
    } catch {}
  }
  // An action that starts but never closes (the answer was cut off at the length limit, often a long file with no } in
  // it) is a bad reply to retry, never an answer to show.
  if (start >= 0 && /^\s*\{\s*"(run|write|read|publish|worker|image|site|video|system|share|search|widget)"\s*:/.test(s.slice(start))) return { type: 'bad', text: s };

  // If it still looks like a tool call or XML, force a retry.
  if (/DSML|<invoke|<parameter|tool_call|function_call/i.test(String(text))) {
    return { type: 'bad', text: String(text) };
  }

  return { type: 'say', text: s || '(no answer)' };
}

const IMAGE_SITE = /pollinations|picsum\.photos|source\.unsplash|loremflickr|placekitten|placeimg/i;

// A picture the user asked for: drawn by Workers AI and shown in the chat, the way ChatGPT and Claude show one.
export function cleanImage(raw) {
  const o = typeof raw === 'string' ? { prompt: raw } : raw && typeof raw === 'object' ? raw : {};
  const prompt = String(o.prompt || o.description || '').replace(/\s+/g, ' ').trim().slice(0, 1500);
  if (!prompt) return null;
  const caption = String(o.caption || '').replace(/\s+/g, ' ').trim().slice(0, 300) || 'Here is your picture.';
  return { prompt, caption };
}

// "generate a photo of a cat taking a mirror selfie", "draw me a dragon": a picture and nothing else. Chat draws these at
// once, without asking the model first, so the picture comes in seconds even when the free model is busy. Anything about a
// website, a page, a video or a chart goes to the model as before.
const IMG_WORD = '(?:photos?|photographs?|pictures?|pics?|images?|drawings?|illustrations?|paintings?|portraits?|wallpapers?|avatars?|sketch(?:es)?|artworks?)';
const ASK_IMAGE = new RegExp(`^\\s*(?:(?:please|pls|hey|can you|could you|would you|i want|i'd like)\\s+)*(?:generate|create|make|draw|paint|render|imagine|give me|show me|produce)\\s+(?:me\\s+|us\\s+)?(?:(?:a|an|the|one|some)\\s+)?(?:[\\w-]+\\s+){0,3}?${IMG_WORD}\\s+(?:of|showing|with|where)\\s+(.+)$`, 'i');
const ASK_DRAW = /^\s*(?:please\s+)?(?:draw|paint|sketch)\s+(?:me\s+|us\s+)?(.+)$/i;
const NOT_IMAGE = /\b(web ?sites?|web ?pages?|landing|pages?|site|videos?|clips?|apps?|html|charts?|graphs?|diagrams?|plots?|tables?|stat|stats|statistics|data|numbers|metrics|figures|trends?|dashboards?|infographics?|slides?|deck|logo for (?:my|our|the) (?:site|website|app))\b/i;
export function asksImage(task) {
  const t = String(task || '').trim();
  if (!t || t.length > 600 || t.includes('\n') || NOT_IMAGE.test(t)) return null;
  const m = ASK_IMAGE.exec(t) || ASK_DRAW.exec(t);
  const what = m ? m[1].replace(/[\s.!?]+$/, '').trim() : '';
  if (what.length < 3) return null;
  const real = /\b(photo|photograph|realistic|selfie)/i.test(t);
  return { prompt: `${what}, ${real ? 'a photorealistic photo, natural light, sharp detail' : 'high detail'}`, caption: `Here is ${what}.` };
}
// The hack for when the drawing model has no budget left: the chat model writes the picture as SVG code (gradients, shadows,
// highlights, layered shapes), which costs no drawing budget. The SVG is cleaned before it is kept: no script, no outside links.
export const SVG_ASK = 'Draw the picture the user asks for as ONE SVG image, and reply with only the SVG code: no words, no code fence. Make it look realistic and three-dimensional, not flat: viewBox="0 0 800 800", a background with a gradient, every main shape filled with a linearGradient or radialGradient that goes from a light to a dark shade, soft shadows under objects (feGaussianBlur filter), bright highlights, darker shaded sides, fine detail such as fur strands, texture or reflections, and 40 or more shapes. No text, no script, no outside links.';
export function cleanSvg(raw) {
  const m = /<svg[\s>][\s\S]*<\/svg>/i.exec(String(raw || ''));
  if (!m) return null;
  let svg = m[0];
  // One pass can leave a new tag or attribute behind (<scr<script>ipt>), so clean until nothing changes.
  for (let prev = ''; prev !== svg;) {
    prev = svg;
    svg = svg
      .replace(/<(script|foreignObject|iframe|image|a|style)\b[\s\S]*?<\/\1[^>]*>/gi, '')
      .replace(/<(script|foreignObject|iframe|image|use)\b[^>]*\/?>/gi, '')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\s(?:xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, '')
      .replace(/(?:javascript|vbscript|data):/gi, '');
  }
  if (!/<svg[^>]*\sxmlns=/i.test(svg)) svg = svg.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  if (!/<svg[^>]*\sviewBox=/i.test(svg)) svg = svg.replace(/<svg/i, '<svg viewBox="0 0 800 800"');
  if (svg.length < 400 || svg.length > 300_000 || (svg.match(/<(path|circle|ellipse|rect|polygon|polyline|line)\b/gi) || []).length < 4) return null;
  return svg;
}
const svgDataUrl = (svg) => {
  const bytes = new TextEncoder().encode(svg);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/svg+xml;base64,${btoa(bin)}`;
};
const imageAlt = (s) => String(s).replace(/[[\]()\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'picture';
export const imageAnswer = (spec, url) => `![${imageAlt(spec.caption)}](${url})\n\n${spec.caption}`;

const clip = (s, n = OUT_CHARS) => {
  const t = String(s ?? '');
  return t.length > n ? `${t.slice(0, n)}\n…(${t.length - n} more characters cut)` : t;
};



export const MAX_FILES = 3;
export const MAX_FILE_BYTES = 150 * 1024;
// Files the visitor attached: text, or base64 for anything else. Names are flattened so nothing escapes the folder.
export function cleanFiles(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_FILES).flatMap((f) => {
    const path = String(f?.name || '').split(/[\\/]/).pop().replace(/[^A-Za-z0-9._ -]/g, '_').replace(/^\.+/, '').slice(0, 80);
    const content = typeof f?.content === 'string' ? f.content : '';
    if (!path || !content || content.length > MAX_FILE_BYTES * 1.4) return [];
    const b64 = !!f.b64;
    if (b64 && !/^[A-Za-z0-9+/=\s]+$/.test(content)) return [];
    const image = b64 && /^image\/(png|jpeg|gif|webp)$/.test(String(f.type || '')) ? String(f.type) : null;
    return [{ path: path.replace(/ /g, '_'), content: b64 ? content.replace(/\s/g, '') : content, b64, ...(image ? { image } : {}) }];
  });
}

// Addresses on the task's own computer stop working when it stops at the end of the task: say so under the answer.
export function noteDeadLinks(text, hadComputer) {
  if (!hadComputer || !/\b(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?\b/.test(String(text))) return text;
  return `${text}\n\n(The localhost addresses above were on this task's computer, which has stopped now, so they will not open for you. Ask me to publish the page if you want a link.)`;
}

export function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string')
    .slice(-6)
    .map((m) => {
      // A file attached on an earlier turn was on that turn's computer only; say so, so the model asks for it again.
      const names = Array.isArray(m.files) ? m.files.filter((n) => typeof n === 'string').slice(0, 3).map((n) => n.slice(0, 80)) : [];
      const note = m.role === 'user' && names.length ? `\n[Attached then: ${names.join(', ')}. Not on this computer any more: ask the user to attach it again if you need it.]` : '';
      return { role: m.role, content: m.content.slice(0, 1500) + note };
    });
}

// computer: { start, run, write, read, share, stop } (fleet.js, or the visitor's browser: browserpod.js). note: extra instructions about that computer. track: optional { started(podId), kept(podId, url), stopped(podId) }. publish(html, { limit }) -> url. photo(prompt) -> a data: URL or ''. emit(event) gets every step.
const SCAFFOLD = /\bflisk\s+create\b|flisk\.sh\/install\.sh/;

// Kinds picked in the chat that make something other than a picture: the name is what the model is told.
export const BUILD_KINDS = { website: 'a website to build', build: 'a website, app or system to build', app: 'a small app to build', system: 'a system to build' };
export async function runTask({ grade = null, stream = false, decision = null, classify = null, task, history = [], github = undefined, origin = 'https://chat.flisk.si', model, computer, publish, photo = async () => '', saveImage = null, track = {}, saveVideo = async () => ({ error: 'videos are not set up here' }), lookupFacts = null, mode = 'chat', search = null, fetchImpl = fetch, citable = null, order = [], files = [], vision = false, modelName = '', note = '', lang = '', kind = '', memo = '', emit = () => {}, maxSteps = MAX_STEPS, wait = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const where = files.length ? `\n\nThe user attached ${files.length} file(s), already on the computer in the current folder: ${files.map((f) => f.path).join(', ')}. Use them.` : '';
  // A model that sees images gets the attached pictures themselves, not only the file on the computer.
  const pics = vision ? files.filter((f) => f.image) : [];
  const first = pics.length
    ? [{ type: 'text', text: `${task}${where} The picture${pics.length > 1 ? 's are' : ' is'} also shown to you here: look at ${pics.length > 1 ? 'them' : 'it'} to answer.` }, ...pics.map((f) => ({ type: 'image_url', image_url: { url: `data:${f.image};base64,${f.content}` } }))]
    : task + where;
  // The page sends the new task as the last history entry too: drop it so the model gets the task once.
  const past = Array.isArray(history) ? history.slice() : [];
  const lastPast = past[past.length - 1];
  if (lastPast?.role === 'user' && String(lastPast.content || '').trim() === String(task).trim()) past.pop();
  // The kind the person picked in the + menu or the Build / Create mode. What they type is a description of that thing, however vague
  // ("something cool"), so it is never drawn as a picture and the model is told what was picked.
  const picked = BUILD_KINDS[String(kind || '').toLowerCase()] || '';
  const system = taskPrompt({ task, maxSteps, modelName, github, origin, note: note + modeNote(mode, maxSteps) + (picked ? `\nThe person picked "${picked}" in the chat, so what they type describes ${picked}, even if it is vague. Make it now and publish it; do not draw a picture instead and do not ask what they meant.` : ''), lang, memo });
  const token = github?.token || '';
  const building = asksToBuild(task, history);
  const analysis = asksAnalysis(task);
  // A plain question about the world: chat looks the subject up first, so the model has facts to take instead of inventing them.
  let direct = files.length || picked ? null : asksImage(task);
  // The wording match above only nominates a message. A small model decides: anything but a clear "picture" (or a failed
  // call) sends the message to the main model, so a text that merely mentions a picture is never drawn by mistake.
  if (decision?.type && decision.type !== 'image') direct = null; // Jev read the ask as something else: never draw it
  else if (direct && classify) direct = (await Promise.resolve(classify(task)).catch((e) => { console.warn('image classifier failed:', String(e?.message || e).slice(0, 200)); return null; })) === 'image' ? direct : null;
  let sources = [];
  const noLookup = ['image', 'video', 'code', 'website', 'chat'].includes(decision?.type);
  if (!direct && !noLookup && lookupFacts && (wantsLookup(task, { building, files: files.length }) || (decision?.type === 'fact' && !building && !files.length))) {
    sources = await Promise.resolve(lookupFacts(task)).catch(() => []) || [];
    if (sources.length) emit({ type: 'sources', sources: sources.map((x) => ({ title: x.title, url: x.url })) });
  }
  // Search mode: chat runs the first search itself, before the model answers. A small model does not reliably choose to search
  // (it reaches for a computer), so it gets the numbered web results up front and only searches again if they fall short.
  let webNote = '';
  let prefetched = false;
  if (mode === 'search' && !files.length) {
    const q = cleanQuery(searchWords(task) || task);
    emit({ type: 'search', query: q });
    const found = q ? await Promise.resolve(search ? search(q) : searchWeb(q, { fetch: fetchImpl })).catch(() => null) : null;
    prefetched = true;
    if (found?.results?.length) {
      emit({ type: 'websources', query: q, results: found.results });
      webNote = `\n\nWEB RESULTS for "${q}" (chat searched the web for you just now). Answer from these and cite them as [1], [2]. Send {"search": "<other words>"} only if they do not answer the question:\n\n${formatResults(found.results)}`;
    }
  }
  const messages = [{ role: 'system', content: system + sourcesNote(sources) + webNote }, ...cleanHistory(past), { role: 'user', content: first }];
  let podId = null;
  let provider = null;
  const steps = [];
  const links = [];
  // What went wrong or right, counted for the build analytics (src/index.js recordRun): why a build came out weak.
  const stats = { big: isBigApp(task), bad: 0, empty: 0, provider: 0, errors: 0, refused: 0, refusedWhy: null, podMs: 0, system: false, shared: false, copy: false, firstAction: null, failed: null };
  let refusedImage = 0;
  let gradeRetried = false;
  const t0 = Date.now();
  const finish = async (answer, error = null) => {
    if (podId && kept) {
      emit({ type: 'pod_kept', url: kept.url, days: kept.expiresAt ? 0 : KEEP_DAYS, until: kept.expiresAt || null });
    } else if (podId) {
      const s = await computer.stop(podId).catch(() => null);
      emit({ type: 'pod_stopped', ok: s?.status === 200 });
      if (s?.status === 200) await Promise.resolve(track.stopped?.(podId)).catch(() => {});
    }
    return { answer, error, steps, links, provider, ms: Date.now() - t0, stats, ...(picked ? { picked: String(kind).toLowerCase(), refusedImage } : {}) };
  };
  let emptyRetries = 0;
  let giveUps = 0;
  let providerRetries = 0;
  let kept = null; // the public URL of the running app: the computer is kept, not stopped
  let startedServer = false;
  let builtSystem = false; // a bigger app was built by chat: its generated page must not be replaced by a stub
  let ranApp = false; // flisk up or a bigger app runs: the answer is a shared live link, never a published copy
  let appPort = null; // the website port a bigger app answered with
  let shareRefused = false; // the provider cannot give this computer a public link
  let askedForLink = false;
  let askedForComputer = false; // computer mode: a first answer with no computer used is sent back once
  let searches = prefetched ? 1 : 0;
  let askedNoComputer = false; // search mode: a computer action is sent back once
  const MAX_SEARCHES = 2; // each search asks several sources, and Workers Free stops at 50 subrequests per run
  // Draws the picture and keeps it at its own link (saveImage), so the chat history holds a short link, not the picture.
  const drawImage = async (spec) => {
    emit({ type: 'image_start', prompt: spec.prompt });
    let pic = await Promise.resolve(photo(spec.prompt)).catch(() => '');
    if (!pic) {
      const r = await Promise.race([model([{ role: 'system', content: SVG_ASK }, { role: 'user', content: spec.prompt.replace(/,\s*(a photorealistic photo.*|high detail)$/i, '') }]), new Promise((_, no) => setTimeout(() => no(new Error('svg took too long')), 60_000))]).catch((e) => { console.warn('svg picture failed:', String(e?.message || e).slice(0, 200)); return null; });
      const svg = cleanSvg(r?.text);
      if (svg) pic = svgDataUrl(svg);
    }
    if (!pic) return { error: 'the picture could not be drawn right now: the daily picture limit is used up or the drawing model is busy. Try again later' };
    const saved = saveImage ? await Promise.resolve(saveImage(pic, spec.prompt)).catch((e) => ({ error: String(e?.message || e) })) : { url: pic };
    if (saved?.error || !saved?.url) return { error: saved?.error || 'the picture could not be saved' };
    links.push(saved.url);
    return { url: saved.url };
  };
  if (direct) {
    stats.firstAction = 'image';
    const r = await drawImage(direct);
    const text = r.error ? `Sorry, ${r.error}.` : imageAnswer(direct, r.url);
    emit({ type: 'answer', text });
    return await finish(text);
  }
  try {
    for (let step = 1; step <= maxSteps; step++) {
      emit({ type: 'thinking', step });
      const last = step === maxSteps;
      if (last) messages.push({ role: 'user', content: 'That was the last action. Reply with {"say": ...} now.' });
      // Words go out as the model writes them (Workers AI streams); the finished answer then replaces them on the page.
      const say = stream ? sayStreamer(emit) : null;
      const reply = await model(messages, lang || say ? { ...(lang ? { lang } : {}), ...(say ? { onDelta: say } : {}) } : undefined);
      // An empty reply is usually a one-off (a long command output, a reasoning model that only thought): ask again, twice at most,
      // without using up a step.
      if (reply.kind === 'empty' && emptyRetries < 2) {
        emptyRetries++;
        stats.empty++;
        emit({ type: 'retry' });
        messages.push({ role: 'user', content: 'Your last reply was empty. Reply now with the next action as one short JSON object.' });
        step--;
        continue;
      }
      // A provider hiccup (HTTP 5xx, overloaded, a dropped connection) is nearly always gone a few seconds later. Without a
      // retry one bad answer ended a build halfway and stopped its computer, so wait and ask again, twice per task at most.
      if (reply.kind === 'provider' && providerRetries < 2) {
        providerRetries++;
        stats.provider++;
        emit({ type: 'retry' });
        await wait(providerRetries * 3000);
        step--;
        continue;
      }
      if (reply.error) {
        emit({ type: 'error', error: reply.error, kind: reply.kind });
        return await finish(null, reply.error);
      }
      messages.push({ role: 'assistant', content: reply.text });
      const action = parseAction(reply.text);
      if (typeof action.path === 'string') action.path = homePath(action.path);
      if (action.type === 'bad') stats.bad++;
      if (stats.firstAction === null && action.type !== 'bad') stats.firstAction = action.type;
      if (action.type === 'bad' && !last) {
        emit({ type: 'retry' });
        messages.push({ role: 'user', content: reply.cut
          ? 'That reply was cut off: it was longer than the answer limit, so the action was lost. Send a shorter action: "write" a smaller file (under about 12 KB) and put the rest in other files (styles in styles.css, scripts in app.js), one "write" at a time.'
          : action.why || 'That reply is not valid JSON. Send the same action again as one valid JSON object only (no tags, no XML, no explanations). Escape " as \\" inside strings.' });
        continue;
      }
      // A server was started on the computer but nothing was published: the computer stops with this answer, so the user
      // would get an app they cannot open and have to ask for the link. Ask for the published copy once.
      if (action.type === 'say' && !last && podId && startedServer && !links.length && !askedForLink && !shareRefused) {
        askedForLink = true;
        emit({ type: 'retry' });
        messages.push({ role: 'user', content: `No public link yet, and the computer stops when you answer unless the app is shared. Send {"share": ${appPort || '<the website port>'}} so the running app gets a public link. Never make a copy of the app. Next action as JSON only.` });
        continue;
      }
      // The model gave up or asked the user for a key: make it try another way (twice per task) instead of failing in front of the user.
      if (action.type === 'say' && !last && giveUps < 3 && GIVE_UP.test(String(action.text || ''))) {
        giveUps++;
        emit({ type: 'retry' });
        const hint = [
          'Do not give up and do not ask the user for a key or a login. Find another way now: a keyless source (an RSS feed, a public API without a key, another website), a different command, or another URL.',
          'Still not done. Install what you need (pip install -q <pkg>, npm i -g <pkg>, or apt-get install -y <pkg>) or use a different public source, and try again.',
          'Last try: pick the simplest keyless source you know (an RSS feed or a plain web page through curl) and give the user a real result, even a partial one.',
        ][giveUps - 1];
        messages.push({ role: 'user', content: `${hint} Next action as JSON only.` });
        step--; // a retry for a give-up does not use up a step
        continue;
      }
      // Computer mode: the user asked for real work, so an answer with no computer used yet is sent back once.
      if (mode === 'computer' && action.type === 'say' && !last && !podId && !askedForComputer) {
        askedForComputer = true;
        emit({ type: 'retry' });
        messages.push({ role: 'user', content: 'Computer mode is on: do the work on the computer first. Send a "run" or "write" action as JSON only.' });
        continue;
      }
      // Search mode answers from the web: a computer action with no computer started yet is sent back once.
      if (mode === 'search' && (action.type === 'run' || action.type === 'write') && !podId && !askedNoComputer) {
        askedNoComputer = true;
        emit({ type: 'retry' });
        messages.push({ role: 'user', content: 'Search mode is on: do not use a computer. Answer with "say" from the web results above, citing [1], [2]. If they do not answer it, send {"search": "<other words>"}. Next action as JSON only.' });
        continue;
      }
      // Search mode: a web search runs in the Worker (no computer), and the numbered sources go back to the model.
      if (action.type === 'search') {
        if (mode !== 'search') {
          messages.push({ role: 'user', content: 'Web search is off in this mode. Use the computer or answer with "say".\n\nNext action as JSON only.' });
          continue;
        }
        if (searches >= MAX_SEARCHES) {
          messages.push({ role: 'user', content: `That is ${MAX_SEARCHES} searches. Answer now with "say" from the sources you have, citing [1], [2].` });
          continue;
        }
        searches++;
        emit({ type: 'search', query: action.query });
        const found = await (search ? search(action.query) : searchWeb(action.query, { fetch: fetchImpl }));
        if (found.error) {
          emit({ type: 'output', error: found.error });
          steps.push({ action, error: found.error });
          messages.push({ role: 'user', content: `Error: ${found.error}\n\nTry other words once, or "say" what you know and that the search found nothing.` });
        } else {
          emit({ type: 'websources', query: action.query, results: found.results });
          steps.push({ action, sources: found.results.length });
          messages.push({ role: 'user', content: `Web results for "${action.query}":\n\n${formatResults(found.results)}\n\nNext action as JSON only (usually "say", citing [1], [2]).` });
        }
        continue;
      }
      if (action.type === 'say' || last) {
        // Out of steps with an action still planned: never show that raw JSON as the answer.
        const text = action.type === 'say' ? withSources(splitPoints(noteDeadLinks(action.text, !!podId)), sources) : `I ran out of steps (${maxSteps}) before finishing. What I did is in the steps above; the computer is stopped now, so its files are gone. Ask again with a smaller first part${maxSteps < BYO_STEPS ? `, or pick a model with your own key for ${BYO_STEPS} steps` : ''}.`;
        // Jev reads the reply before it is final. A reply nobody saw yet and judged bad is asked again once, with the reason; words
        // already streamed stay (the page replaces them), so then the verdict is only traced.
        const g = grade && action.type === 'say' && !last ? await Promise.resolve(grade(task, text)).catch(() => null) : null;
        if (g && g.verdict !== 'good') stats.graded = { verdict: g.verdict, confidence: g.confidence, retried: false };
        if (g?.bad && !say?.sent() && !gradeRetried) {
          gradeRetried = true;
          stats.graded.retried = true;
          emit({ type: 'retry' });
          messages.push({ role: 'user', content: `That reply was judged bad (${BAD_REPLIES[g.verdict]}). Answer the ask again properly as {"say": ...}, in the language of the ask.` });
          step--;
          continue;
        }
        emit({ type: 'answer', text });
        return await finish(text);
      }
      let widget = null;
      if (action.type === 'widget') {
        const w = parseWidget(action.raw);
        if (w.error) {
          messages.push({ role: 'user', content: `Error: ${w.error}\n\nNext action as JSON only.` });
          continue;
        }
        widget = w;
        if (!w.widget.needsComputer) {
          const r = await w.widget.run(w.input, { fetch: fetchImpl, citable });
          if (r.error) {
            emit({ type: 'output', error: r.error });
            messages.push({ role: 'user', content: `Error: ${r.error}\n\nNext action as JSON only.` });
          } else {
            emit({ type: 'widget', kind: w.widget.id, data: r.data });
            steps.push({ action, widget: w.widget.id });
            messages.push({ role: 'user', content: `${r.summary}\n\nNext action as JSON only (usually "say").` });
          }
          continue;
        }
      }
      // A research question never needs a computer: refuse run and write, so no computer starts and the model answers from the page it read.
      if (analysis && (action.type === 'run' || action.type === 'write')) {
        messages.push({ role: 'user', content: 'Refused: this is a research question and needs no computer. Read the site with the web widget, then reply with "say" in the full report format. Next action as JSON only.' });
        continue;
      }
      // A layout page is made on the Worker: it needs no computer.
      if (!podId && action.type !== 'site' && action.type !== 'image') {
        emit({ type: 'pod_starting' });
        const podT0 = Date.now();
        const made = await computer.start(order);
        stats.podMs = Date.now() - podT0;
        if (made.error) {
          emit({ type: 'error', error: made.error, kind: 'computer' });
          return await finish(null, made.error);
        }
        podId = made.data.id;
        provider = made.data.provider;
        await Promise.resolve(track.started?.(podId)).catch(() => {});
        emit({ type: 'pod_started', provider });
        if (token) {
          const g = await setupGithub({ computer, podId, github }).catch((e) => ({ error: String(e?.message || e) }));
          emit({ type: 'github', ok: !!g.ok, error: g.error ? scrub(g.error, token) : null });
          if (g.error) messages.push({ role: 'user', content: `Note: signing GitHub in on this computer failed (${scrub(g.error, token)}), so push and gh may not work.` });
        }
        for (const f of files) {
          const r = f.b64 ? await computer.write(podId, `${f.path}.b64`, f.content) : await computer.write(podId, f.path, f.content);
          if (!r.error && f.b64) await computer.run(podId, `base64 -d '${f.path}.b64' > '${f.path}' && rm '${f.path}.b64'`);
          emit({ type: 'file', path: f.path, error: r.error || null });
        }
      }
      let shown;
      let ours = false; // chat itself refused the action (a rule, not a broken computer or file)
      if (action.type === 'image' && picked) {
        refusedImage++;
        shown = { error: `Refused: the person picked ${picked}, not a picture. Build it: send a "site" action (or write and publish an index.html), then "say".` };
        ours = true;
      } else if (action.type === 'image') {
        // The picture is the answer: show it with its caption at once, with no further step.
        const r = await drawImage(action.spec);
        if (!r.error) {
          steps.push({ action, image: r.url });
          const text = imageAnswer(action.spec, r.url);
          emit({ type: 'answer', text });
          return await finish(text);
        }
        shown = { error: r.error };
      } else if (widget) {
        const r = await widget.widget.run(widget.input, { fetch: fetchImpl, citable, computer, podId });
        if (r.error) shown = { error: r.error };
        else {
          emit({ type: 'widget', kind: widget.widget.id, data: r.data });
          shown = { widget: widget.widget.id, summary: r.summary };
        }
      } else if (action.type === 'run' && IMAGE_SITE.test(action.command)) {
        shown = { error: 'Refused: do not fetch pictures from an image website, it cannot be controlled and once returned a person for a cat. Send an "image" action and chat draws the picture itself.' };
        ours = true;
      } else if (action.type === 'run' && !building && SCAFFOLD.test(action.command)) {
        shown = { error: 'Refused: the user asked a question, not for an app, so do not install Flisk or make a project. Answer the question itself (curl, gh api or a widget), then "say".' };
        ours = true;
      } else if (action.type === 'run') {
        emit({ type: 'run', command: action.command });
        if (/\b(flisk up|nohup)\b/.test(action.command)) startedServer = true;
        if (/\bflisk up\b/.test(action.command)) ranApp = true;
        const r = await computer.run(podId, action.command);
        shown = r.error ? { error: scrub(r.error, token) } : { exitCode: r.data.exitCode, stdout: clip(scrub(r.data.stdout, token)), stderr: clip(scrub(r.data.stderr, token), 600) };
      } else if (action.type === 'write') {
        emit({ type: 'write', path: action.path, bytes: action.content.length });
        // A short stub over the generated page leaves the live link blank; keep the working page.
        if (builtSystem && /(^|\/)app\/web\/index\.html$/.test(action.path) && action.content.length < 1500) {
          ours = true;
          shown = { error: 'Refused: that is far shorter than the working page already there, so it would blank the website. Keep the generated page and go straight to share, or write the whole page.' };
          emit({ type: 'output', error: shown.error });
          steps.push({ action, output: shown });
          messages.push({ role: 'user', content: `${JSON.stringify(shown)}\n\nNext action as JSON only.` });
          continue;
        }
        const source = fliskGenerated(action.path);
        if (source) {
          ours = true;
          shown = { error: `Refused: ${action.path} is generated by Flisk, and flisk up writes it again, so this edit would be lost. Change ${source} (then run flisk up) or your own code in src/ instead.` };
          emit({ type: 'output', error: shown.error });
          steps.push({ action, output: shown });
          messages.push({ role: 'user', content: `${JSON.stringify(shown)}\n\nNext action as JSON only.` });
          continue;
        }
        const r = await computer.write(podId, action.path, action.content);
        shown = r.error ? { error: r.error } : { written: action.path };
      } else if (action.type === 'video') {
        emit({ type: 'video_start', title: action.spec.title, scenes: action.spec.scenes.length });
        const made = await makeVideo({ computer, podId, spec: action.spec, save: saveVideo, emit });
        if (made.error) shown = { error: made.error };
        else {
          links.push(made.url);
          shown = { video: made.url };
        }
      } else if (action.type === 'system') {
        emit({ type: 'system_plan', title: action.spec.title, services: action.spec.services.map((x) => x.name) });
        const made = await makeSystem({ computer, podId, spec: action.spec, emit });
        shown = made.error ? { error: made.error } : { exitCode: 0, stdout: made.summary, stderr: '' };
        // The app runs on a computer that stops with the answer unless it is shared (see the nudge above).
        if (!made.error) {
          startedServer = ranApp = builtSystem = stats.system = true;
          appPort = made.web;
        }
      } else if (action.type === 'share') {
        emit({ type: 'share', port: action.spec.port });
        const r = await shareApp({ computer, podId, spec: action.spec, fetchImpl, provider });
        if (r.refused) shareRefused = true;
        if (r.error) shown = { error: r.error };
        else {
          kept = r;
          stats.shared = true;
          links.push(r.url);
          await Promise.resolve(track.kept?.(podId, r.url, r.expiresAt)).catch(() => {});
          emit({ type: 'live', url: r.url });
          const mins = r.expiresAt ? Math.max(1, Math.round((Date.parse(r.expiresAt) - Date.now()) / 60000)) : 0;
          const lasts = !r.expiresAt
            ? `it sleeps when idle and wakes on a visit, deleted after ${KEEP_DAYS} days`
            : `it works until ${new Date(r.expiresAt).toUTCString()} (about ${mins > 90 ? `${Math.round(mins / 60)} hours` : `${mins} minutes`}), when ${provider || 'the provider'} ends the computer${r.wakesOnVisit ? ' (until then it sleeps when idle and a visit wakes it)' : ''}; tell the user how long it lasts`;
          shown = { live: r.url, note: `This is the running app (website and API), kept running after you answer; ${lasts}. Say this link first.` };
        }
      } else if (action.type === 'site' && !ranApp) {
        stats.copy = true;
        emit({ type: 'site', layout: action.spec.layout, title: action.spec.title });
        // The photo is a nice extra: when it cannot be drawn the page is published with its plain hero.
        emit({ type: 'photo', title: action.spec.title });
        const pic = await photo(photoPrompt(action.spec)).catch(() => '');
        const made = await publish(renderSite(action.spec, pic || ''), { limit: MAX_LAYOUT_BYTES });
        if (made.error) shown = { error: made.error };
        else {
          links.push(made.url);
          shown = { published: made.url };
        }
      } else if ((action.type === 'publish' || action.type === 'site') && ranApp) {
        // An app with a running API is never shipped as a page: a copy of it cannot save anything.
        ours = true;
        shown = { error: shareRefused
          ? 'do not publish a copy of the app. This computer cannot have a public link, so "say" that plainly: the app was built and checked here, and a provider that can share (for example Upstash Box) gives a live link next time.'
          : `this task runs an app with an API, so do not publish a copy of it. Send {"share": ${appPort || '<the website port>'}} for a live link to the real app.` };
      } else if (action.type === 'worker') {
        // A Cloudflare Worker (one ES module) that runs in the visitor's own tab (cfworker2browser): nothing is deployed.
        emit({ type: 'read', path: action.path });
        const r = await computer.read(podId, action.path);
        if (r.error) shown = { error: scrub(r.error, token) };
        else if (r.data.encoding !== 'utf8' || !/export\s+default/.test(r.data.content)) shown = { error: 'a Worker is one text file that has `export default { async fetch(request, env) { ... } }` (module syntax, no imports from packages)' };
        else if (r.data.content.length > MAX_WORKER) shown = { error: `the Worker is over ${MAX_WORKER} characters: make it smaller` };
        else {
          emit({ type: 'worker', path: action.path, code: r.data.content });
          shown = { summary: 'The Worker now runs in the user\'s own browser tab: a card in the chat lets them send requests to it. Reply with "say" now: what it does and which paths to try (for example GET /api/items).' };
        }
      } else if (action.type === 'publish') {
        stats.copy = true;
        emit({ type: 'publish', path: action.path });
        const r = await computer.read(podId, action.path);
        const page = r.error || r.data.encoding !== 'utf8' ? null : await inlineLocal(r.data.content, action.path, (p) => computer.read(podId, p));
        if (r.error) shown = { error: r.error };
        else if (!page) shown = { error: 'that file is not text' };
        else if (page.missing.length) shown = { error: `the page links ${page.missing.join(', ')}, which could not be read next to it: write ${page.missing.length === 1 ? 'that file' : 'those files'} first, then publish again` };
        else {
          // A page that carries its pictures is bigger than a plain one: it gets the room a layout page with a photo has.
          const made = await publish(page.html, page.pictures ? { limit: MAX_LAYOUT_BYTES } : undefined);
          if (made.error) shown = { error: made.error };
          else {
            links.push(made.url);
            shown = { published: made.url };
          }
        }
      } else {
        emit({ type: 'read', path: action.path });
        const r = await computer.read(podId, action.path);
        shown = r.error ? { error: scrub(r.error, token) } : { content: clip(scrub(r.data.content, token)) };
      }
      if (shown.error || shown.exitCode > 0) stats.errors++;
      if (ours && shown.error) { stats.refused++; if (!stats.refusedWhy) stats.refusedWhy = String(shown.error).replace(/\s+/g, ' ').slice(0, 120); }
      // The first action the computer or the site could not do (a write, read, publish or share that failed), for the alert.
      // A command that exits non-zero is normal trial and error and is not one.
      if (shown.error && !ours && !stats.failed) stats.failed = `${action.type} ${action.path || ''}: ${String(shown.error)}`.replace(/\s+/g, ' ').slice(0, 300);
      steps.push({ action, ...shown });
      if (!shown.widget) emit({ type: 'output', ...shown });
      const note = shown.error
        ? `Error: ${shown.error}`
        : shown.summary
          ? shown.summary
        : shown.live
          ? `Shared. The running app's public link is ${shown.live}. ${shown.note}`
        : shown.published
          ? `Published. The live link is ${shown.published}`
          : shown.video
            ? `The video is ready. Its link is ${shown.video}`
          : shown.exitCode !== undefined
            ? `Exit code ${shown.exitCode}\nstdout:\n${shown.stdout || '(empty)'}${shown.stderr ? `\nstderr:\n${shown.stderr}` : ''}`
            : shown.written
              ? `Wrote ${shown.written}`
              : `Content:\n${shown.content}`;
      messages.push({ role: 'user', content: `${note}\n\nNext action as JSON only.` });
    }
    return await finish(null, 'ran out of steps');
  } catch (e) {
    const why = String(e?.message || e).slice(0, 200);
    emit({ type: 'error', error: why });
    return await finish(null, why);
  }
}

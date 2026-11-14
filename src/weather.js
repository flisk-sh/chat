// Live weather for voice talk. The model has no internet, so when someone asks about the weather chat looks it up
// (open-meteo.com: free, no key, no account) and hands the model the numbers to say.
const WORDS = /(weather|forecast|temperature|rain|snow|погод|температур|дощ|дождь|прогноз|тепло|холодно|clima|tiempo|temperatura|lluvia|wetter|temperatur|regen|météo|meteo|temps|pluie|tempo|pioggia|pogoda|hava)/i;
export const asksWeather = (text) => WORDS.test(String(text || ''));

const SKIP = new Set(['what', 'whats', "what's", 'the', 'today', 'tomorrow', 'now', 'like', 'will', 'does', 'how', 'is', 'in', 'at', 'for', 'tell', 'me', 'about', 'weather', 'forecast', 'сьогодні', 'завтра', 'зараз', 'яка', 'який', 'що', 'там', 'погода', 'погоду', 'погоди', 'прогноз', 'скажи', 'яку', 'сегодня', 'какая', 'погода', 'сейчас', 'как', 'qué', 'que', 'tiempo', 'hace', 'hoy', 'cómo', 'como', 'wie', 'ist', 'das', 'please', 'pls', 'мне', 'тут', 'будь', 'ласка', 'пожалуйста', 'por', 'favor', 'bitte', 'merci', 'wetter', 'heute', 'quel', 'quelle', 'temps', 'fait', 'aujourd']);

// Words that could be a place, best guesses first: a word that follows "in/в/у/en/à/in" comes before the rest.
const after = new Set();
export function placeGuesses(text) {
  after.clear();
  const words = String(text || '').split(/[^\p{L}'-]+/u).filter((w) => w.length >= 3 && !SKIP.has(w.toLowerCase()) && !WORDS.test(w));
  const toks = String(text || '').split(/[^\p{L}'-]+/u);
  toks.forEach((w, i) => { if (/^(in|at|в|во|у|en|à|a|in|für|для|для|na)$/i.test(w) && toks[i + 1]) after.add(toks[i + 1]); });
  return [...new Set([...after, ...words])].filter((w) => w.length >= 3).slice(0, 4);
}

const CODES = [[0, 'clear sky'], [1, 'mostly clear'], [2, 'partly cloudy'], [3, 'overcast'], [45, 'fog'], [48, 'fog'], [51, 'light drizzle'], [55, 'drizzle'], [61, 'light rain'], [63, 'rain'], [65, 'heavy rain'], [71, 'light snow'], [73, 'snow'], [75, 'heavy snow'], [80, 'rain showers'], [82, 'heavy showers'], [95, 'thunderstorm']];
export const sky = (c) => ([...CODES].reverse().find(([k]) => c >= k) || [0, 'unknown'])[1];

const ALIAS = [[/^киев/i, 'Київ'], [/^харьков/i, 'Харків'], [/^днепр/i, 'Дніпро'], [/^львов/i, 'Львів'], [/^одесс/i, 'Одеса']];

// Answers are kept 10 minutes (places for a day), so a second question about the same city, or the early draft the
// talk page sends at your first pause, answers at once. In memory per Worker, plus the edge cache when there is one.
const mem = new Map();
const edge = () => (typeof caches !== 'undefined' && caches.default) || null;
async function cachedJson(url, fetchImpl, ttl, timeout) {
  const hit = mem.get(url);
  if (hit && Date.now() - hit.at < ttl * 1000) return hit.v;
  const c = fetchImpl === fetch ? edge() : null;
  let v = null;
  try {
    const old = c && (await c.match(url));
    if (old) v = await old.json();
  } catch {}
  if (!v) {
    v = await fetchImpl(url, { signal: AbortSignal.timeout(timeout) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (v && c) c.put(url, new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json', 'cache-control': `max-age=${ttl}` } })).catch(() => {});
  }
  if (v) {
    if (mem.size > 500) mem.clear();
    mem.set(url, { at: Date.now(), v });
  }
  return v;
}
export const clearWeatherCache = () => mem.clear();

async function geocode(name, fetchImpl, minPop = 0) {
  const cyr = /\p{Script=Cyrillic}/u.test(name);
  const lang = cyr ? 'uk' : 'en';
  const q = (n) => cachedJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(n)}&count=10&language=${lang}`, fetchImpl, 86400, 2000);
  // "Львові" is not in any list, but its start is: ask for the word and for the word shortened (all at once, not one
  // after another), then take the biggest place (a city, not a village that happens to start the same way).
  // Russian spellings of Ukrainian cities are aliased.
  const word = (ALIAS.find(([re]) => re.test(name)) || [])[1] || name;
  const names = [word, word.slice(0, -1), word.slice(0, -2), word.slice(0, -3)].filter((n) => n.length >= (cyr ? 3 : 4));
  const found = (await Promise.all(names.map(q))).flatMap((j) => j?.results || []);
  found.sort((a, b) => (b.population || 0) - (a.population || 0));
  const best = found.find((r) => r.latitude != null);
  return best && (best.population || 0) >= minPop ? best : null;
}

const forecast = (p, fetchImpl) =>
  cachedJson(`https://api.open-meteo.com/v1/forecast?latitude=${(+p.latitude).toFixed(2)}&longitude=${(+p.longitude).toFixed(2)}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`, fetchImpl, 600, 2500);

const line = (p, j, mine) => {
  const c = j?.current, d = j?.daily;
  if (!c) return '';
  return `Live weather from a weather service for ${p.name}, ${p.country || ''}${mine ? " (where the person is now, found from their connection; say the city's name)" : ''}: now ${Math.round(c.temperature_2m)}°C (feels like ${Math.round(c.apparent_temperature)}°C), ${sky(c.weather_code)}, wind ${Math.round(c.wind_speed_10m)} km/h. Today ${Math.round(d?.temperature_2m_min?.[0])} to ${Math.round(d?.temperature_2m_max?.[0])}°C, chance of rain ${d?.precipitation_probability_max?.[0] ?? 0}%. These numbers are real and live. Say this in your own words, in the person's language.`;
};

// Where the visitor is, from Cloudflare's request.cf (city and coordinates of their connection), or null.
export function placeFrom(cf) {
  const lat = Number(cf?.latitude), lng = Number(cf?.longitude);
  if (!cf?.city || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { name: String(cf.city), country: String(cf.country || ''), latitude: lat, longitude: lng };
}

// Fetches the visitor's own weather ahead of time (the talk page asks when it opens), so "what's the weather?" with
// no city answers from the cache.
export async function warmWeather(here, fetchImpl = fetch) {
  if (here) await forecast(here, fetchImpl);
}

// The line handed to the model, or '' when there is no weather question. Every guessed place is looked up at the
// same time; the best guess that names a real place wins. No place named: the visitor's own city, if known.
export async function weatherNote(text, fetchImpl = fetch, here = null) {
  if (!asksWeather(text)) return '';
  const guesses = placeGuesses(text);
  const sure = new Set(after);
  // A word right after "in" / "в" is a place for sure; any other word must name a real city, not a village.
  const places = await Promise.all(guesses.map((g) => geocode(g, fetchImpl, sure.has(g) ? 0 : 100000).catch(() => null)));
  for (const p of places) {
    if (!p) continue;
    const l = line(p, await forecast(p, fetchImpl), false);
    if (l) return l;
  }
  if (here) {
    const l = line(here, await forecast(here, fetchImpl), true);
    if (l) return l;
  }
  return 'The person asked about the weather but did not say where. Ask which city, in one short sentence.';
}

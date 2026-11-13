// Widgets: cards the chat draws from data, instead of one paragraph of text.
//
// One widget = one entry in WIDGETS below. The task loop (loop.js) lists them in the model's prompt, validates what the
// model sends, runs the entry, and emits { type: 'widget', kind, data } for the page, which draws it (page.js, WIDGET_DRAW).
// The model only ever sends data (JSON), never HTML or script, so a widget cannot inject anything into the page.
//
// Entry:
//   id        the "kind" the model sends:  {"widget": {"kind": "<id>", ...}}
//   title     what the user sees on the card header fallback
//   prompt    one line for the model: the shape to send and when to use it
//   needsComputer  true when run() needs the Linux computer (ctx.computer, ctx.podId); the loop starts one first
//   clean(input)   -> the cleaned input, or null when it is not valid (the model is told and tries again)
//   run(input, ctx) -> { data, summary } or { error }. data goes to the page; summary (a short text) goes back to the
//                      model so its final "say" can talk about what the card shows.
//   ctx = { fetch, computer, podId }

const WEATHER = {
  0: ['Clear', 'sun'], 1: ['Mostly clear', 'sun'], 2: ['Partly cloudy', 'partly'], 3: ['Overcast', 'cloud'],
  45: ['Fog', 'cloud'], 48: ['Fog', 'cloud'],
  51: ['Light drizzle', 'rain'], 53: ['Drizzle', 'rain'], 55: ['Heavy drizzle', 'rain'],
  61: ['Light rain', 'rain'], 63: ['Rain', 'rain'], 65: ['Heavy rain', 'rain'],
  66: ['Freezing rain', 'rain'], 67: ['Freezing rain', 'rain'],
  71: ['Light snow', 'snow'], 73: ['Snow', 'snow'], 75: ['Heavy snow', 'snow'], 77: ['Snow grains', 'snow'],
  80: ['Light showers', 'rain'], 81: ['Showers', 'rain'], 82: ['Heavy showers', 'rain'],
  85: ['Snow showers', 'snow'], 86: ['Snow showers', 'snow'],
  95: ['Thunderstorm', 'storm'], 96: ['Thunderstorm with hail', 'storm'], 99: ['Thunderstorm with hail', 'storm'],
};
const sky = (code) => WEATHER[code] || ['Unknown', 'cloud'];

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

// Open-Meteo: free, no key. One call finds the place, one gets the forecast. Runs in the Worker, so no computer is needed.
async function weather({ place, units }, { fetch }) {
  const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name=${encodeURIComponent(place)}`).then((r) => r.json()).catch(() => null);
  const g = geo?.results?.[0];
  if (!g) return { error: `I could not find a place called "${place}"` };
  const f = units === 'f';
  const url = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
    latitude: g.latitude, longitude: g.longitude, timezone: 'auto', forecast_days: '7',
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code',
    hourly: 'temperature_2m', daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    temperature_unit: f ? 'fahrenheit' : 'celsius', wind_speed_unit: f ? 'mph' : 'kmh',
  });
  const w = await fetch(url).then((r) => r.json()).catch(() => null);
  if (!w?.current || !w?.daily) return { error: 'the weather service did not answer' };
  const [now, icon] = sky(w.current.weather_code);
  const days = w.daily.time.map((t, i) => {
    const [text, ic] = sky(w.daily.weather_code[i]);
    return { date: t, sky: text, icon: ic, high: num(w.daily.temperature_2m_max[i]), low: num(w.daily.temperature_2m_min[i]), rain: num(w.daily.precipitation_probability_max[i]) };
  });
  // The next 24 hours, every 3rd hour, for the line under the big number.
  const from = Math.max(0, w.hourly.time.findIndex((t) => t >= w.current.time.slice(0, 13)));
  const hours = [];
  for (let i = from; i < from + 24 && i < w.hourly.time.length; i += 3) hours.push({ time: w.hourly.time[i].slice(11, 16), temp: num(w.hourly.temperature_2m[i]) });
  const data = {
    place: [g.name, g.admin1, g.country].filter(Boolean).join(', '), unit: f ? '°F' : '°C', wind: f ? 'mph' : 'km/h',
    now: { temp: num(w.current.temperature_2m), feels: num(w.current.apparent_temperature), humidity: num(w.current.relative_humidity_2m), wind: num(w.current.wind_speed_10m), sky: now, icon },
    hours, days,
  };
  const d0 = days[0];
  return { data, summary: `Weather card shown for ${data.place}: now ${data.now.temp}${data.unit} and ${now.toLowerCase()}, today ${d0.low} to ${d0.high}${data.unit}, rain chance ${d0.rain}%. The next 7 days are on the card.` };
}

function chartClean(i) {
  const type = i.type === 'bar' ? 'bar' : 'line';
  const labels = Array.isArray(i.labels) ? i.labels.slice(0, 60).map((l) => str(l, 24)) : [];
  const series = (Array.isArray(i.series) ? i.series : []).slice(0, 4).map((s) => ({ name: str(s?.name, 40), values: Array.isArray(s?.values) ? s.values.slice(0, 60).map(num) : [] }));
  if (labels.length < 2 || !series.length || series.some((s) => s.values.length !== labels.length || s.values.every((v) => v === null))) return null;
  return { type, title: str(i.title, 80), unit: str(i.unit, 12), labels, series };
}

// flisk status only sees a project from inside its folder, and the computer starts in the home folder: go to the
// project first (the Flisk recipe's ~/app, the system action's /tmp/flisk-system, or any folder under home that has
// a .flisk folder or service.json files), then ask.
export const SERVICES_CMD = [
  'export PATH=$HOME/.local/bin:$PATH',
  'for d in "$HOME/app" /tmp/flisk-system "$HOME"/*/; do',
  '  if [ -d "$d/.flisk" ] || [ -f "$d/service.json" ] || ls "$d"/*/service.json >/dev/null 2>&1; then cd "$d" && break; fi',
  'done',
  'flisk status --json 2>/dev/null || true',
].join('\n');

// The services of a Flisk project running on the computer. flisk status --json lists them; the widget keeps the useful fields.
async function services(_input, { computer, podId }) {
  const r = await computer.run(podId, SERVICES_CMD);
  if (r.error) return { error: r.error };
  let j;
  try { j = JSON.parse(r.data.stdout); } catch { return { error: 'there is no running Flisk project on this computer yet (run flisk up first)' }; }
  const d = j?.data || j;
  const native = d?.runtime === 'native';
  const list = (Array.isArray(d?.resources) ? d.resources : []).slice(0, 30).map((x) => ({
    name: str(x.name, 40), type: str(x.type, 24), stack: str(x.stack, 24),
    status: str(x.status || x.state || (d?.tilt?.readiness?.ready ? 'ready' : 'starting'), 24),
    port: num(x.port) ?? num(Array.isArray(x.ports) ? x.ports[0] : null),
  })).filter((x) => x.name);
  if (!list.length) return { error: 'flisk status shows no services' };
  return { data: { runtime: native ? 'local processes' : 'containers', ready: !!d?.tilt?.readiness?.ready, services: list }, summary: `Services card shown: ${list.map((x) => `${x.name} (${x.status})`).join(', ')}.` };
}

export const WIDGETS = {
  weather: {
    id: 'weather', title: 'Weather',
    prompt: '{"widget": {"kind": "weather", "place": "<city>", "units": "c"}} for the weather or a forecast anywhere ("units": "f" for Fahrenheit and mph). Draws a card with now, the next hours and 7 days. No computer is needed. Then "say" two or three bullets on what it means (a coat, rain, a good day for a walk); do not repeat the numbers.',
    clean: (i) => (str(i.place, 80) ? { place: str(i.place, 80), units: i.units === 'f' ? 'f' : 'c' } : null),
    run: weather,
  },
  chart: {
    id: 'chart', title: 'Chart',
    prompt: '{"widget": {"kind": "chart", "type": "line", "title": "<title>", "unit": "<unit>", "labels": ["Mon", "Tue"], "series": [{"name": "<name>", "values": [1, 2]}]}} to draw a line or bar ("type": "bar") chart of numbers you have already (up to 60 points, 4 series, every series as long as labels). For big data compute it on the computer first and send only the points to plot. Then "say" what the chart shows in one or two sentences.',
    clean: chartClean,
    run: (input) => ({ data: input, summary: `Chart "${input.title}" shown with ${input.labels.length} points.` }),
  },
  services: {
    id: 'services', title: 'Services', needsComputer: true,
    prompt: '{"widget": {"kind": "services"}} after "flisk up" has started a project on the computer: draws each service with its state. Then "say" which one to open or what is not ready.',
    clean: () => ({}),
    run: services,
  },
};

// The widget lines for the model's prompt, built from the registry so a new entry shows up with no other edit.
export const widgetPrompt = () => Object.values(WIDGETS).map((w) => `- ${w.prompt}`).join('\n');

// The action the model sent -> { widget, input } or { error } (the model is told the error and tries again).
export function parseWidget(raw) {
  const w = WIDGETS[raw?.kind];
  if (!w) return { error: `there is no widget called "${str(raw?.kind, 30)}". Use one of: ${Object.keys(WIDGETS).join(', ')}` };
  const input = w.clean(raw);
  if (!input) return { error: `the ${w.id} widget needs different data. Send it like this: ${w.prompt}` };
  return { widget: w, input };
}

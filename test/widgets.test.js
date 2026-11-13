import { describe, expect, test } from 'bun:test';
import { WIDGETS, parseWidget, widgetPrompt } from '../src/widgets.js';
import { parseAction, runTask, SYSTEM } from '../src/loop.js';
import { appPage } from '../src/page.js';

const hours = Array.from({ length: 48 }, (_, i) => `2026-11-13T${String(i % 24).padStart(2, '0')}:00`);
const forecast = {
  current: { time: '2026-11-13T15:00', temperature_2m: 7, apparent_temperature: 5.5, relative_humidity_2m: 55, wind_speed_10m: 5, weather_code: 0 },
  hourly: { time: hours, temperature_2m: hours.map((_, i) => 4 + (i % 5)) },
  daily: { time: ['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19'], weather_code: [0, 2, 61, 63, 61, 61, 2], temperature_2m_max: [8, 9, 11, 12, 12, 12, 9], temperature_2m_min: [-2, -2, 4, 4, 8, 7, 2], precipitation_probability_max: [0, 10, 60, 55, 55, 25, 45] },
};
const calls = [];
const fakeFetch = async (url) => {
  calls.push(String(url));
  const u = new URL(url);
  if (u.host === 'geocoding-api.open-meteo.com') return Response.json(u.searchParams.get('name') === 'Nowhereville' ? {} : { results: [{ name: 'London', admin1: 'England', country: 'United Kingdom', latitude: 51.5, longitude: -0.12 }] });
  return Response.json(forecast);
};

describe('widgets registry', () => {
  test('every widget is listed in the model prompt', () => {
    for (const w of Object.values(WIDGETS)) expect(SYSTEM).toContain(w.prompt);
    expect(widgetPrompt().split('\n').length).toBe(Object.keys(WIDGETS).length);
  });
  test('parseWidget rejects unknown kinds and bad data, with a hint for the model', () => {
    expect(parseWidget({ kind: 'nope' }).error).toContain('weather');
    expect(parseWidget({ kind: 'weather' }).error).toContain('weather');
    expect(parseWidget({ kind: 'chart', labels: ['a'], series: [] }).error).toContain('chart');
    expect(parseWidget({ kind: 'weather', place: 'Kyiv', units: 'f' }).input).toEqual({ place: 'Kyiv', units: 'f' });
  });
  test('parseAction turns a widget reply into a widget action', () => {
    expect(parseAction('{"widget":{"kind":"weather","place":"London"}}')).toEqual({ type: 'widget', raw: { kind: 'weather', place: 'London' } });
    expect(parseAction('{"widget": nonsense').type).not.toBe('widget');
  });
  test('weather: finds the place, shapes the card, needs no computer', async () => {
    const r = await WIDGETS.weather.run({ place: 'London', units: 'c' }, { fetch: fakeFetch });
    expect(r.data.place).toBe('London, England, United Kingdom');
    expect(r.data.days).toHaveLength(7);
    expect(r.data.days[2]).toMatchObject({ sky: 'Light rain', icon: 'rain', high: 11, low: 4, rain: 60 });
    expect(r.data.now).toMatchObject({ temp: 7, sky: 'Clear', humidity: 55 });
    expect(r.data.hours.length).toBeGreaterThan(5);
    expect(r.summary).toContain('London');
    expect((await WIDGETS.weather.run({ place: 'Nowhereville', units: 'c' }, { fetch: fakeFetch })).error).toContain('Nowhereville');
    expect(calls.some((c) => c.includes('fahrenheit'))).toBe(false);
  });
  test('chart: validates length, caps series, keeps numbers', () => {
    const ok = parseWidget({ kind: 'chart', type: 'bar', title: 'Sales', labels: ['Mon', 'Tue', 'Wed'], series: [{ name: 'a', values: [1, 2, 3] }] });
    expect(ok.input.type).toBe('bar');
    expect(parseWidget({ kind: 'chart', labels: ['Mon', 'Tue'], series: [{ name: 'a', values: [1] }] }).error).toBeTruthy();
    expect(parseWidget({ kind: 'chart', labels: ['Mon', 'Tue'], series: [{ name: 'a', values: ['x', 'y'] }] }).error).toBeTruthy();
  });
  test('services: reads flisk status --json from the computer', async () => {
    const computer = { run: async () => ({ data: { exitCode: 0, stdout: JSON.stringify({ data: { runtime: 'native', tilt: { readiness: { ready: true } }, resources: [{ name: 'api', type: 'backend' }, { name: 'web', type: 'frontend' }] } }), stderr: '' } }) };
    const r = await WIDGETS.services.run({}, { computer, podId: 'p1' });
    expect(r.data).toMatchObject({ runtime: 'local processes', ready: true });
    expect(r.data.services.map((s) => s.name)).toEqual(['api', 'web']);
    const none = await WIDGETS.services.run({}, { computer: { run: async () => ({ data: { stdout: '' } }) }, podId: 'p1' });
    expect(none.error).toContain('flisk up');
  });
});

describe('runTask with widgets', () => {
  const script = (replies) => { let i = 0; return async () => ({ text: replies[i++] }); };
  test('a weather widget runs with no computer and the answer follows', async () => {
    const events = [];
    const computer = { start: async () => { throw new Error('no computer should start'); } };
    const r = await runTask({ task: 'weather in london', model: script(['{"widget":{"kind":"weather","place":"London"}}', '{"say":"- Cold but bright."}']), computer, fetchImpl: fakeFetch, publish: null, emit: (e) => events.push(e) });
    expect(r.answer).toBe('- Cold but bright.');
    const w = events.find((e) => e.type === 'widget');
    expect(w.kind).toBe('weather');
    expect(events.some((e) => e.type === 'pod_starting')).toBe(false);
  });
  test('a bad widget is sent back to the model, which tries again', async () => {
    const sent = [];
    const model = async (m) => { sent.push(m[m.length - 1].content); return { text: sent.length === 1 ? '{"widget":{"kind":"zzz"}}' : '{"say":"ok"}' }; };
    const r = await runTask({ task: 't', model, computer: {}, fetchImpl: fakeFetch, emit: () => {} });
    expect(r.answer).toBe('ok');
    expect(sent[1]).toContain('no widget called');
  });
  test('the services widget starts a computer first', async () => {
    const events = [];
    const computer = {
      start: async () => ({ data: { id: 'p1', provider: 'daytona' } }), stop: async () => ({ status: 200 }),
      run: async () => ({ data: { exitCode: 0, stdout: JSON.stringify({ data: { runtime: 'native', resources: [{ name: 'api' }] } }), stderr: '' } }),
    };
    const r = await runTask({ task: 't', model: script(['{"widget":{"kind":"services"}}', '{"say":"api is up"}']), computer, emit: (e) => events.push(e) });
    expect(r.answer).toBe('api is up');
    expect(events.find((e) => e.type === 'widget')?.kind).toBe('services');
  });
});

describe('page', () => {
  test('has a drawer for every widget kind', () => {
    const html = appPage({ login: 'x' });
    for (const id of Object.keys(WIDGETS)) expect(html).toMatch(new RegExp(`\\b${id}\\(d\\)\\{`));
  });
});

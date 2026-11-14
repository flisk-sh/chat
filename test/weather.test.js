import { expect, test } from 'bun:test';
import { asksWeather, clearWeatherCache, placeFrom, placeGuesses, sky, weatherNote } from '../src/weather.js';

test('weather questions in several languages are recognised', () => {
  for (const q of ["What's the weather in Kyiv?", 'Яка погода у Львові?', 'Какая погода сегодня', '¿Qué tiempo hace en Madrid?', 'Wie ist das Wetter in Berlin']) expect(asksWeather(q)).toBe(true);
  expect(asksWeather('Write me a poem')).toBe(false);
});

test('the place is the word after "in", then the other words', () => {
  expect(placeGuesses("What's the weather in Kyiv today?")[0]).toBe('Kyiv');
  expect(placeGuesses('Яка погода у Львові сьогодні?')[0]).toBe('Львові');
});

test('sky codes become words', () => { expect(sky(0)).toBe('clear sky'); expect(sky(63)).toBe('rain'); expect(sky(96)).toBe('thunderstorm'); });

const fakeNet = (places) => async (u) => {
  u = String(u);
  if (u.includes('geocoding')) { const n = decodeURIComponent(new URL(u).searchParams.get('name')); return Response.json({ results: places[n] || undefined }); }
  return Response.json({ current: { temperature_2m: 6.2, apparent_temperature: 3.1, weather_code: 3, wind_speed_10m: 11 }, daily: { temperature_2m_max: [8], temperature_2m_min: [2], precipitation_probability_max: [20] } });
};

test('a place that is inflected is found by shortening the word', async () => {
  const net = fakeNet({ 'Харк': [{ name: 'Харків', country: 'Ukraine', latitude: 49.8, longitude: 24, population: 700000 }] });
  const note = await weatherNote('Яка погода в Харкові сьогодні?', net);
  expect(note).toMatch(/Харків, Ukraine: now 6°C/);
  expect(note).toMatch(/overcast/);
});

test('no place named: the model is told to ask which city', async () => {
  expect(await weatherNote('What is the weather like', fakeNet({}))).toMatch(/did not say where/);
});

test('not a weather question: nothing is looked up', async () => {
  let called = false;
  expect(await weatherNote('Write me a poem', async () => { called = true; return Response.json({}); })).toBe('');
  expect(called).toBe(false);
});

test('every spelling of a place is asked for at once, and a second ask comes from the cache', async () => {
  clearWeatherCache();
  let calls = 0, open = 0, most = 0;
  const base = fakeNet({ 'Харк': [{ name: 'Харків', country: 'Ukraine', latitude: 49.99, longitude: 36.23, population: 1400000 }] });
  const net = async (u) => { calls++; open++; most = Math.max(most, open); await new Promise((r) => setTimeout(r, 5)); open--; return base(u); };
  expect(await weatherNote('Яка погода в Харкові?', net)).toMatch(/Харків/);
  expect(most).toBeGreaterThan(1);
  const first = calls;
  expect(await weatherNote('Яка погода в Харкові?', net)).toMatch(/Харків/);
  expect(calls).toBe(first);
});

test('no place named: the weather where the person is, from their connection', async () => {
  clearWeatherCache();
  const here = placeFrom({ city: 'London', country: 'GB', latitude: '51.51', longitude: '-0.13' });
  const note = await weatherNote("What's the weather like?", fakeNet({}), here);
  expect(note).toMatch(/London, GB \(where the person is now/);
  expect(note).toMatch(/real and live/);
  expect(placeFrom({})).toBe(null);
});

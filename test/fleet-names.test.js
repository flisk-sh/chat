import { expect, test } from 'bun:test';
import { loadFleetNames, resetFleetNames } from '../src/index.js';
import { PROVIDER_NAMES } from '../src/page.js';

const prices = (rows) => async () => new Response(JSON.stringify({ size: 'small', prices: rows }), { headers: { 'content-type': 'application/json' } });

test('fleet names fall back to the built-in list when fleet is down', async () => {
  resetFleetNames();
  const down = async () => { throw new Error('offline'); };
  expect(await loadFleetNames({}, down, 1)).toEqual(PROVIDER_NAMES);
});

test('a provider added to fleet shows by its fleet label, built-in names win, demo is left out', async () => {
  resetFleetNames();
  const names = await loadFleetNames({}, prices([
    { provider: 'paperpod', label: 'PaperPod' },
    { provider: 'e2b', label: 'something else' },
    { provider: 'demo', label: 'Demo' },
  ]), 1_000_000);
  expect(names.paperpod).toBe('PaperPod');
  expect(names.e2b).toBe(PROVIDER_NAMES.e2b);
  expect(names.demo).toBe(PROVIDER_NAMES.demo);
  expect(names.anona).toBe('Anona Compute');
});

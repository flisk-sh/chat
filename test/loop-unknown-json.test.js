import { test, expect } from 'bun:test';
import { parseAction, guardAnswer } from '../src/loop.js';
import { chatPage } from '../src/app-page.js';

const curl = '{"curl": "https://api.duckduckgo.com/?q=%D0%B2&format=json"}';

test('a bare JSON object that is no known action is sent back, never shown as the answer', () => {
  const a = parseAction(curl);
  expect(a.type).toBe('bad');
  expect(a.why).toContain('{"say"');
  expect(parseAction('{"say": "hi"}')).toEqual({ type: 'say', text: 'hi' });
  expect(parseAction('The set {a, b} has two items.').type).toBe('say');
});

test('the last guard drops a bare JSON object without words', () => {
  expect(guardAnswer(curl).empty).toBe(true);
  expect(guardAnswer('Hello {"x": 1} there').text).toBe('Hello {"x": 1} there');
});

test('the new app page carries the Ukrainian dictionary and the visitor country', () => {
  const ua = chatPage({ geo: 'UA' });
  expect(ua).toContain('window.__GEO="UA"');
  expect(ua).toContain('Запускаю комп’ютер');
  expect(chatPage({})).not.toContain('Запускаю комп’ютер'); // an English visit keeps the small page
  expect(chatPage({ acceptLanguage: 'uk-UA,uk;q=0.9,en;q=0.8' })).toContain('Запускаю комп’ютер');
  expect(chatPage({ acceptLanguage: 'en-US,en;q=0.9' })).not.toContain('Запускаю комп’ютер');
});

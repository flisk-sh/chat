// Pure helpers for the answer modes (docs/adr/0002), kept free of React so they can be tested directly.
export const ASK_QUESTIONS = ['Who is it for?', 'What do you already have?', 'What counts as a win?'];

// The task text that goes to the server. `fast` is the person's words, untouched.
export function frame(task, answer, context = []) {
  const t = String(task || '').trim();
  if (answer === 'long') return t + '\n\nTake your time: plan first, then do the whole job and say what you checked.';
  if (answer === 'ask') {
    const known = context.map((c, i) => [ASK_QUESTIONS[i], String(c || '').trim()]).filter(([, a]) => a);
    return known.length ? t + '\n\nWhat I know:\n' + known.map(([q, a]) => '- ' + q + ' ' + a).join('\n') : t;
  }
  return t;
}

// `/fast`, `/ask` or `/long` at the start of the box picks the mode and is removed from the task.
export function readSlash(text) {
  const m = /^\s*\/(fast|ask|long)\b\s*/i.exec(String(text || ''));
  return m ? {answer: m[1].toLowerCase(), rest: String(text).slice(m[0].length)} : null;
}

// What you say or type to the Studio plugin. Returns {cmd, ...} for a request Studio can do, or null for anything else (that goes to the chat as usual).
// Two commands for now: remove the background, and crop (to a shape, when one is named).
const WORDS = {one: 1, two: 2, three: 3, four: 4, nine: 9, sixteen: 16};
const SHAPES = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2'];
// "16:9", "16x9", "16 by 9", "sixteen to nine", or "square".
function shapeOf(t) {
  if (/\bsquare\b/.test(t)) return '1:1';
  const n = t.replace(/\b(one|two|three|four|nine|sixteen)\b/g, (w) => WORDS[w]);
  const m = n.match(/\b(\d+) ?(?:[:x]|by|to) ?(\d+)\b/);
  const id = m && m[1] + ':' + m[2];
  return SHAPES.includes(id) ? id : null;
}

export function parseStudioCommand(text) {
  const t = String(text || '').toLowerCase().replace(/[.,!?]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 80) return null;
  if (/\b(remove|delete|erase|clear|cut out|get rid of|take off|take out|drop)\b.*\b(background|backdrop)\b/.test(t) || /\bcut out (the |this )?(subject|person|object)\b/.test(t) || /\b(background|backdrop) (remover|removal)\b/.test(t)) return {cmd: 'removeBackground'};
  if (/\bcrop\b/.test(t)) {
    return {cmd: 'crop', ratio: shapeOf(t)};
  }
  return null;
}

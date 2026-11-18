// Words reach the page as the model writes them. A model answers one JSON action, {"say": "..."}, so the text of "say" is cut out of
// the half-written JSON after every token and the new part is sent on as { type: 'delta' }. Any other action sends nothing.
export function sayStreamer(emit) {
  let raw = '', sent = 0;
  const feed = (tok) => {
    raw += String(tok ?? '');
    const m = /"say"\s*:\s*"/.exec(raw);
    if (!m) return;
    let out = '', esc = false;
    for (let i = m.index + m[0].length; i < raw.length; i++) {
      const c = raw[i];
      if (esc) {
        if (c === 'u') { if (i + 4 >= raw.length) break; out += String.fromCharCode(parseInt(raw.slice(i + 1, i + 5), 16) || 63); i += 4; }
        else out += c === 'n' ? '\n' : c === 't' ? '\t' : c;
        esc = false;
      } else if (c === '\\') esc = true;
      else if (c === '"') break;
      else out += c;
    }
    if (out.length > sent) { emit({ type: 'delta', text: out.slice(sent) }); sent = out.length; }
  };
  feed.sent = () => sent > 0;
  return feed;
}

// Workers AI streams "data: {"response":"tok"}" lines (older models) or OpenAI-style choices deltas, ending "data: [DONE]".
export async function readAiStream(stream, onDelta) {
  const rd = stream.getReader(), dec = new TextDecoder();
  let buf = '', text = '';
  const line = (l) => {
    l = l.trim();
    if (!l.startsWith('data:')) return;
    const d = l.slice(5).trim();
    if (!d || d === '[DONE]') return;
    try { const j = JSON.parse(d); let t = j.response ?? j.choices?.[0]?.delta?.content ?? ''; if (typeof t === 'number') t = String(t); /* Workers AI sends a digit-only token as a JSON number: {"response":2022} */ if (typeof t === 'string' && t) { text += t; onDelta?.(t); } } catch { /* a half line */ }
  };
  for (;;) {
    const { value, done } = await rd.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { line(buf.slice(0, i)); buf = buf.slice(i + 1); }
  }
  line(buf);
  return text;
}

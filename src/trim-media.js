// GIF or video trim plugin (studio.trim-media): parses clip/trim requests with start/end timestamps.
const QUESTION = /^(?:what|why|how|who|when|where|explain)\b/;
const NON_EDIT = /\b(?:write|build|create|code|script|program|app|application|website|clone|guide|tutorial|library|package|api)\b/;

export function parseTrimMediaCommand(text) {
  const t = String(text || '').toLowerCase().replace(/[.,!?]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 100 || QUESTION.test(t) || NON_EDIT.test(t)) return null;

  const trimMatch = t.match(/^(?:please\s+|can you\s+|could you\s+)?(?:trim|cut|clip)\s+(?:this|the|my)?\s*(?:video|gif|clip)(?:\s+from\s+(\d+(?:s|:?\d+)?)\s+to\s+(\d+(?:s|:?\d+)?))?$/);
  if (trimMatch) {
    return {
      cmd: 'trim-media',
      start: trimMatch[1] ?? null,
      end: trimMatch[2] ?? null,
    };
  }

  return null;
}

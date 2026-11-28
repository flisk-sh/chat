// Blur or erase an object plugin (studio.blur-erase): parses blur/erase/redact object requests.
const QUESTION = /^(?:what|why|how|who|when|where|explain)\b/;
const NON_EDIT = /\b(?:write|build|create|code|script|program|app|application|website|clone|guide|tutorial|library|package|api)\b/;

export function parseBlurEraseCommand(text) {
  const t = String(text || '').toLowerCase().replace(/[.,!?]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 100 || QUESTION.test(t) || NON_EDIT.test(t)) return null;

  const blurMatch = t.match(/^(?:please\s+|can you\s+|could you\s+)?blur\s+(?:the\s+)?(.+?)(?:\s+(?:in|from|on)\s+(?:this|the|my)?\s*(?:photo|picture|image|pic))?$/);
  if (blurMatch && blurMatch[1]) {
    return { cmd: 'blur', target: blurMatch[1].trim() };
  }

  const eraseMatch = t.match(/^(?:please\s+|can you\s+|could you\s+)?(?:erase|remove)\s+(?:the\s+)?(.+?)(?:\s+(?:in|from|on)\s+(?:this|the|my)?\s*(?:photo|picture|image|pic))?$/);
  if (eraseMatch && eraseMatch[1]) {
    return { cmd: 'erase', target: eraseMatch[1].trim() };
  }

  return null;
}

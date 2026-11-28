// Split or extract PDF pages plugin (studio.split-pdf): parses page extraction and split requests.
const QUESTION = /^(?:what|why|how|who|when|where|explain)\b/;
const NON_PDF = /\b(?:write|build|create|code|script|program|app|application|website|clone|guide|tutorial|library|package|api)\b/;

export function parseSplitPdfCommand(text) {
  const t = String(text || '').toLowerCase().replace(/[.,!?]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 100 || QUESTION.test(t) || NON_PDF.test(t)) return null;

  const rangeMatch = t.match(/^(?:please\s+|can you\s+|could you\s+)?(?:extract|split)\s+pages?\s+(\d+)\s*(?:-|to|through)\s*(\d+)(?:\s+(?:from|of)\s+(?:this|the|my)?\s*pdf)?$/);
  if (rangeMatch) {
    const start = Number.parseInt(rangeMatch[1], 10);
    const end = Number.parseInt(rangeMatch[2], 10);
    if (start > 0 && end >= start) return { cmd: 'extract-range', start, end };
  }

  if (/^(?:please\s+|can you\s+|could you\s+)?split\s+(?:this|the|my)?\s*pdf(?:\s+into\s+pages)?$/.test(t)) {
    return { cmd: 'split-all' };
  }

  return null;
}

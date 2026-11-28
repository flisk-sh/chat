// Reorder or delete PDF pages plugin (studio.reorder-pdf): parses page deletion and reordering requests.
const QUESTION = /^(?:what|why|how|who|when|where|explain)\b/;
const NON_PDF = /\b(?:write|build|create|code|script|program|app|application|website|clone|guide|tutorial|library|package|api)\b/;

export function parseReorderPdfCommand(text) {
  const t = String(text || '').toLowerCase().replace(/[.,!?]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 100 || QUESTION.test(t) || NON_PDF.test(t)) return null;

  const delMatch = t.match(/^(?:please\s+|can you\s+|could you\s+)?(?:delete|remove|drop)\s+pages?\s+([\d,\s-]+)(?:\s+(?:from|in|of)\s+(?:this|the|my)?\s*pdf)?$/);
  if (delMatch) {
    const pages = delMatch[1].split(/[\s,]+/).map((n) => Number.parseInt(n, 10)).filter((n) => Number.isFinite(n) && n > 0);
    if (pages.length > 0) return { cmd: 'delete-pages', pages };
  }

  const reorderMatch = t.match(/^(?:please\s+|can you\s+|could you\s+)?(?:reorder|rearrange)\s+(?:the\s+)?(?:pdf\s+)?pages?\s+(?:to\s+)?([\d,\s]+)$/);
  if (reorderMatch) {
    const order = reorderMatch[1].split(/[\s,]+/).map((n) => Number.parseInt(n, 10)).filter((n) => Number.isFinite(n) && n > 0);
    if (order.length > 0) return { cmd: 'reorder-pages', order };
  }

  return null;
}

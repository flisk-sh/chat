// Google Drive integration plugin: parses file search and read requests.
const QUESTION = /^(?:what|why|how|who|when|where|explain)\b/;
const NON_INTENT = /\b(?:write|build|create|code|script|program|app|application|website|clone|guide|tutorial|library|package|api)\b/;

export function parseGdriveCommand(text) {
  const t = String(text || '').toLowerCase().replace(/[.,!?]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 120 || QUESTION.test(t) || NON_INTENT.test(t)) return null;

  const searchMatch = t.match(/^(?:please\s+|can you\s+|could you\s+)?(?:search|find|look up)\s+(?:google\s+)?drive\s+(?:for\s+)?(.+)$/);
  if (searchMatch && searchMatch[1]) return { cmd: 'search-drive', query: searchMatch[1].trim() };

  const openMatch = t.match(/^(?:please\s+|can you\s+|could you\s+)?(?:open|read|show)\s+(?:google\s+)?drive\s+file\s+(.+)$/);
  if (openMatch && openMatch[1]) return { cmd: 'open-file', target: openMatch[1].trim() };

  return null;
}

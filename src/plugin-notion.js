// Notion integration plugin: parses page search and creation requests.
const QUESTION = /^(?:what|why|how|who|when|where|explain)\b/;
const NON_INTENT = /\b(?:write|build|code|script|program|app|application|website|clone|guide|tutorial|library|package|api)\b/;

export function parseNotionCommand(text) {
  const t = String(text || '').toLowerCase().replace(/[.,!?]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 120 || QUESTION.test(t) || NON_INTENT.test(t)) return null;

  const searchMatch = t.match(/^(?:please\s+|can you\s+|could you\s+)?(?:search|find|open)\s+notion\s+(?:for\s+)?(.+)$/);
  if (searchMatch && searchMatch[1]) return { cmd: 'search-notion', query: searchMatch[1].trim() };

  const createMatch = t.match(/^(?:please\s+|can you\s+|could you\s+)?(?:create|add)\s+(?:a\s+)?notion\s+page\s+(?:for\s+|titled\s+)?(.+)$/);
  if (createMatch && createMatch[1]) return { cmd: 'create-page', title: createMatch[1].trim() };

  return null;
}

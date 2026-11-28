// Linear integration plugin: parses issue lookup, creation, and status update requests.
const QUESTION = /^(?:what|why|how|who|when|where|explain)\b/;
const NON_INTENT = /\b(?:write|build|code|script|program|app|application|website|clone|guide|tutorial|library|package|api)\b/;

export function parseLinearCommand(text) {
  const t = String(text || '').toLowerCase().replace(/[.,!?]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 120 || QUESTION.test(t) || NON_INTENT.test(t)) return null;

  const issueMatch = t.match(/^(?:please\s+|can you\s+|could you\s+)?(?:open|show|check|get|find)\s+(?:linear\s+)?(?:issue\s+)?([a-z]+-\d+)$/);
  if (issueMatch) return { cmd: 'get-issue', key: issueMatch[1].toUpperCase() };

  const createMatch = t.match(/^(?:please\s+|can you\s+|could you\s+)?(?:create|file|add)\s+(?:a\s+)?linear\s+issue\s+(?:for\s+|about\s+|titled\s+)?(.+)$/);
  if (createMatch && createMatch[1]) return { cmd: 'create-issue', title: createMatch[1].trim() };

  return null;
}

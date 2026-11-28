// Slack integration plugin: parses channel message and search requests.
const QUESTION = /^(?:what|why|how|who|when|where|explain)\b/;
const NON_INTENT = /\b(?:write|build|code|script|program|app|application|website|clone|guide|tutorial|library|package|api)\b/;

export function parseSlackCommand(text) {
  const t = String(text || '').toLowerCase().replace(/[.,!?]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 120 || QUESTION.test(t) || NON_INTENT.test(t)) return null;

  const postMatch = t.match(/^(?:please\s+|can you\s+|could you\s+)?(?:post|send)\s+(.+?)\s+to\s+slack\s+#?([a-z0-9_-]+)$/);
  if (postMatch) return { cmd: 'post-message', channel: postMatch[2], message: postMatch[1].trim() };

  const searchMatch = t.match(/^(?:please\s+|can you\s+|could you\s+)?(?:search|check)\s+slack\s+(?:for\s+)?(.+)$/);
  if (searchMatch && searchMatch[1]) return { cmd: 'search-slack', query: searchMatch[1].trim() };

  return null;
}

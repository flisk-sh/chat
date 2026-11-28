// GitHub integration plugin: parses PR, issue, and repo status requests.
const QUESTION = /^(?:what|why|how|who|when|where|explain)\b/;
const NON_INTENT = /\b(?:write|build|code|script|program|app|application|website|clone|guide|tutorial|library|package|api)\b/;

export function parseGithubPluginCommand(text) {
  const t = String(text || '').toLowerCase().replace(/[.,!?]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 120 || QUESTION.test(t) || NON_INTENT.test(t)) return null;

  const prMatch = t.match(/^(?:please\s+|can you\s+|could you\s+)?(?:check|open|show|review)\s+(?:github\s+)?pr\s+#?(\d+)$/);
  if (prMatch) return { cmd: 'get-pr', number: Number.parseInt(prMatch[1], 10) };

  const issueMatch = t.match(/^(?:please\s+|can you\s+|could you\s+)?(?:check|open|show)\s+(?:github\s+)?issue\s+#?(\d+)$/);
  if (issueMatch) return { cmd: 'get-issue', number: Number.parseInt(issueMatch[1], 10) };

  return null;
}

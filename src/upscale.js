// Upscale a photo plugin (studio.upscale): parses photo/image upscale requests.
const QUESTION = /^(?:what|why|how|who|when|where|explain)\b/;
const NON_EDIT = /\b(?:write|build|create|code|script|program|app|application|website|clone|guide|tutorial|library|package|api)\b/;

export function parseUpscaleCommand(text) {
  const t = String(text || '').toLowerCase().replace(/[.,!?]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 100 || QUESTION.test(t) || NON_EDIT.test(t)) return null;

  const scaleMatch = t.match(/^(?:please\s+|can you\s+|could you\s+)?(?:upscale|enlarge|enhance)\s+(?:this|the|my)?\s*(?:photo|picture|image|pic)(?:\s+(?:by\s+)?(\d+)x)?$/);
  if (scaleMatch) {
    const scale = scaleMatch[1] ? Number.parseInt(scaleMatch[1], 10) : 2;
    return { cmd: 'upscale', scale };
  }

  return null;
}

// Photo to PDF plugin (studio.photo-to-pdf): parses image-to-PDF conversion requests.
const QUESTION = /^(?:what|why|how|who|when|where|explain)\b/;
const NON_PDF = /\b(?:write|build|create|code|script|program|app|application|website|clone|guide|tutorial|library|package|api)\b/;

export function parsePhotoToPdfCommand(text) {
  const t = String(text || '').toLowerCase().replace(/[.,!?]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 100 || QUESTION.test(t) || NON_PDF.test(t)) return null;

  if (
    /^(?:please\s+|can you\s+|could you\s+)?(?:convert|turn|save|export|make)\s+(?:this|the|my|these)?\s*(?:photo|photos|picture|pictures|image|images|pic|pics|scan|scans)\s+(?:to|into)\s+(?:a\s+)?pdf$/.test(t)
    || /^(?:please\s+|can you\s+|could you\s+)?photo\s+to\s+pdf$/.test(t)
  ) {
    return { cmd: 'photo-to-pdf' };
  }

  return null;
}

// The answer shape every system returns, and a tolerant parser for the model's JSON reply.
export interface Usage { inputTokens: number; outputTokens: number }
export interface SystemAnswer {
  status: 'answered' | 'not_covered';
  answer: string;
  /** URLs the system says it relied on. */
  citedUrls: string[];
  /** URLs the retrieval step actually returned (empty for model-alone). */
  retrievedUrls: string[];
  usage: Usage;
  ms: number;
}

export interface ParsedReply { status: 'answered' | 'not_covered'; answer: string; sources: string[] }

/** Pull the first JSON object out of a reply (models sometimes wrap it in fences or prose). */
export function parseReply(text: string): ParsedReply {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const o = JSON.parse(text.slice(start, end + 1));
      const status = o.status === 'not_covered' ? 'not_covered' : 'answered';
      const sources = Array.isArray(o.sources) ? o.sources.filter((s: unknown): s is string => typeof s === 'string') : [];
      return { status, answer: String(o.answer ?? '').trim(), sources };
    } catch { /* fall through */ }
  }
  return { status: 'answered', answer: text.trim(), sources: [] };
}

export const normaliseUrl = (u: string) => u.trim().replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();

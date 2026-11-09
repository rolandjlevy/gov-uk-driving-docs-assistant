// Scoring. Retrieval/citation/refusal are plain code; answer correctness is an LLM judge over the golden key_facts.
import type Anthropic from '@anthropic-ai/sdk';
import type { GoldenQuestion } from './golden.js';
import { normaliseUrl, type SystemAnswer, type Usage } from './answer.js';

export interface Scores {
  /** Share of expected pages among the retrieved ones. null when not applicable. */
  retrieval: number | null;
  /** Cited URLs that were really retrieved (no invented links). null for model-alone. */
  citationValid: number | null;
  /** Share of expected pages that were cited. */
  citationRecall: number | null;
  /** not_covered questions: did it decline? Other questions: did it wrongly decline? */
  refusalCorrect: boolean;
  /** Share of key facts the judge found stated correctly. null for not_covered. */
  facts: number | null;
  factResults: boolean[];
  /** True when the judge's reply could not be read twice; facts is then null and the row is not scored. */
  judgeFailed?: boolean;
}

const share = (num: number, den: number) => (den === 0 ? null : num / den);

export function scoreCode(q: GoldenQuestion, a: SystemAnswer): Omit<Scores, 'facts' | 'factResults'> {
  const expected = q.expected_urls.map(normaliseUrl);
  const retrieved = new Set(a.retrievedUrls.map(normaliseUrl));
  const cited = new Set(a.citedUrls.map(normaliseUrl));
  const hasRetrieval = a.retrievedUrls.length > 0;
  return {
    retrieval: hasRetrieval ? share(expected.filter((u) => retrieved.has(u)).length, expected.length) : null,
    citationValid: hasRetrieval ? share([...cited].filter((u) => retrieved.has(u)).length, cited.size) : null,
    citationRecall: expected.length ? share(expected.filter((u) => cited.has(u)).length, expected.length) : null,
    refusalCorrect: q.type === 'not_covered' ? a.status === 'not_covered' : a.status === 'answered',
  };
}

const JUDGE_SYSTEM = `You mark answers to UK driving questions. You get a numbered list of required facts and an answer.
For each fact say true only if the answer states it correctly (same figure, deadline or condition; wording may differ). Missing, vague or contradicted = false.
Reply with only a JSON array of booleans, one per fact, in order.`;

/** null means the reply could not be read: the caller must retry or record a judge failure, never score it as a miss. */
export function parseJudge(text: string, n: number): boolean[] | null {
  const m = text.match(/\[[\s\S]*\]/);
  if (m) {
    try {
      const arr = JSON.parse(m[0]);
      if (Array.isArray(arr) && arr.length === n) return arr.map((x) => x === true);
    } catch { /* fall through */ }
  }
  return null;
}

export interface Judged { results: boolean[] | null; usage: Usage; raw: string }

export async function judgeFacts(
  client: Pick<Anthropic, 'messages'>,
  model: string,
  q: GoldenQuestion,
  answer: string,
): Promise<Judged> {
  const usage: Usage = { inputTokens: 0, outputTokens: 0 };
  if (!q.key_facts.length) return { results: [], usage, raw: '' };
  const facts = q.key_facts.map((f, i) => `${i + 1}. ${f}`).join('\n');
  let raw = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const msg = await client.messages.create({
      model,
      max_tokens: 1000,
      system: JUDGE_SYSTEM,
      messages: [{ role: 'user', content: `Question: ${q.question}\n\nRequired facts:\n${facts}\n\nAnswer:\n${answer || '(empty)'}` }],
    });
    usage.inputTokens += msg.usage.input_tokens;
    usage.outputTokens += msg.usage.output_tokens;
    raw = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    const results = parseJudge(raw, q.key_facts.length);
    if (results) return { results, usage, raw };
  }
  return { results: null, usage, raw };
}

export interface Summary {
  n: number;
  retrieval: number | null;
  citationValid: number | null;
  facts: number | null;
  refusalCorrect: number;
  meanMs: number;
  inputTokens: number;
  outputTokens: number;
}

const mean = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export function summarise(rows: { scores: Scores; answer: SystemAnswer }[]): Summary {
  return {
    n: rows.length,
    retrieval: mean(rows.map((r) => r.scores.retrieval)),
    citationValid: mean(rows.map((r) => r.scores.citationValid)),
    facts: mean(rows.map((r) => r.scores.facts)),
    refusalCorrect: rows.filter((r) => r.scores.refusalCorrect).length / (rows.length || 1),
    meanMs: rows.reduce((a, r) => a + r.answer.ms, 0) / (rows.length || 1),
    inputTokens: rows.reduce((a, r) => a + r.answer.usage.inputTokens, 0),
    outputTokens: rows.reduce((a, r) => a + r.answer.usage.outputTokens, 0),
  };
}

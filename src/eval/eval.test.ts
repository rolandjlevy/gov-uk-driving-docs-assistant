import { describe, expect, it } from 'vitest';
import { parseReply } from './answer.js';
import { parseJudge, scoreCode, summarise } from './score.js';
import { formatExtracts, modelAlone, oneSearchRag } from './systems.js';
import type { GoldenQuestion } from './golden.js';

const q = (o: Partial<GoldenQuestion>): GoldenQuestion => ({ id: 'x', type: 'single_page', question: 'q', key_facts: ['a'], expected_urls: ['https://www.gov.uk/a'], checked_on: null, ...o });
const ans = (o: any = {}) => ({ status: 'answered', answer: 'x', citedUrls: [], retrievedUrls: [], usage: { inputTokens: 1, outputTokens: 1 }, ms: 10, ...o });
const fakeClient = (text: string) => ({ messages: { create: async () => ({ content: [{ type: 'text', text }], usage: { input_tokens: 5, output_tokens: 3 } }) } }) as any;

describe('parseReply', () => {
  it('reads fenced JSON', () => expect(parseReply('```json\n{"status":"not_covered","answer":"no","sources":[]}\n```').status).toBe('not_covered'));
  it('falls back to plain text as an answer', () => expect(parseReply('just text')).toEqual({ status: 'answered', answer: 'just text', sources: [] }));
});

describe('scoreCode', () => {
  it('scores retrieval, invented citations and recall', () => {
    const s = scoreCode(q({}), ans({ retrievedUrls: ['https://www.gov.uk/a/', 'https://www.gov.uk/b'], citedUrls: ['https://www.gov.uk/a', 'https://www.gov.uk/zzz'] }));
    expect(s.retrieval).toBe(1);
    expect(s.citationValid).toBe(0.5);
    expect(s.citationRecall).toBe(1);
  });
  it('has no retrieval score without retrieval', () => expect(scoreCode(q({}), ans()).retrieval).toBeNull());
  it('checks refusals both ways', () => {
    expect(scoreCode(q({ type: 'not_covered', expected_urls: [] }), ans({ status: 'not_covered' })).refusalCorrect).toBe(true);
    expect(scoreCode(q({}), ans({ status: 'not_covered' })).refusalCorrect).toBe(false);
  });
});

describe('parseJudge', () => {
  it('parses a matching array', () => expect(parseJudge('[true,false]', 2)).toEqual([true, false]));
  it('marks all false on a bad reply', () => expect(parseJudge('nope', 2)).toEqual([false, false]));
  it('marks all false on a wrong length', () => expect(parseJudge('[true]', 2)).toEqual([false, false]));
});

describe('systems', () => {
  it('modelAlone has no retrieved urls', async () => {
    const a = await modelAlone({ client: fakeClient('{"status":"answered","answer":"£62","sources":[]}'), model: 'm' }, 'cost?');
    expect(a.answer).toBe('£62');
    expect(a.retrievedUrls).toEqual([]);
    expect(a.usage).toEqual({ inputTokens: 5, outputTokens: 3 });
  });
  it('oneSearchRag records what was retrieved', async () => {
    const hit = { url: 'https://www.gov.uk/a', pageTitle: 'A', heading: 'H', text: 't', score: 0.7 };
    const a = await oneSearchRag({ client: fakeClient('{"status":"answered","answer":"y","sources":["https://www.gov.uk/a"]}'), model: 'm', search: async () => [hit, hit] }, 'q');
    expect(a.retrievedUrls).toEqual(['https://www.gov.uk/a']);
    expect(formatExtracts([hit])).toContain('[1] https://www.gov.uk/a');
  });
});

describe('summarise', () => {
  it('averages and sums', () => {
    const row = (facts: number) => ({ answer: ans(), scores: { retrieval: null, citationValid: null, citationRecall: null, refusalCorrect: true, facts, factResults: [] } });
    const s = summarise([row(1), row(0)]);
    expect(s.facts).toBe(0.5);
    expect(s.inputTokens).toBe(2);
  });
});

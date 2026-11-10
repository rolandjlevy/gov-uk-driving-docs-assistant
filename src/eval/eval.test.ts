import { describe, expect, it } from 'vitest';
import { normaliseUrl, parseReply } from './answer.js';
import { judgeDecline, judgeFacts, parseDecline, parseJudge, scoreCode, summarise } from './score.js';
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
  it('returns null on a bad reply, not all-false', () => expect(parseJudge('nope', 2)).toBeNull());
  it('returns null on a wrong length', () => expect(parseJudge('[true]', 2)).toBeNull());
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

describe('judgeFacts', () => {
  const two = q({ key_facts: ['a', 'b'] });
  it('retries once on an unreadable reply', async () => {
    const replies = ['sorry', '[true,false]'];
    const client = { messages: { create: async () => ({ content: [{ type: 'text', text: replies.shift() }], usage: { input_tokens: 1, output_tokens: 1 } }) } } as any;
    const j = await judgeFacts(client, 'm', two, 'ans');
    expect(j.results).toEqual([true, false]);
    expect(j.usage.inputTokens).toBe(2);
  });
  it('reports failure (null) when both replies are unreadable', async () => {
    const client = { messages: { create: async () => ({ content: [{ type: 'text', text: 'no' }], usage: { input_tokens: 1, output_tokens: 1 } }) } } as any;
    expect((await judgeFacts(client, 'm', two, 'ans')).results).toBeNull();
  });
});

describe('normaliseUrl', () => {
  it('ignores protocol, www, query, fragment, slash and case', () => {
    expect(normaliseUrl('HTTP://gov.uk/Diabetes-Driving/?a=1#x')).toBe(normaliseUrl('https://www.gov.uk/diabetes-driving'));
  });
});

describe('parseDecline', () => {
  it('finds the word anywhere', () => {
    expect(parseDecline('**True**')).toBe(true);
    expect(parseDecline('Answer: false.')).toBe(false);
    expect(parseDecline('')).toBeNull();
  });
});

describe('judgeDecline', () => {
  const mk = (t: string) => ({ messages: { create: async () => ({ content: [{ type: 'text', text: t }], usage: { input_tokens: 1, output_tokens: 1 } }) } }) as any;
  it('reads true, false and unreadable', async () => {
    expect((await judgeDecline(mk('True.'), 'm', 'q', 'a')).declined).toBe(true);
    expect((await judgeDecline(mk('false'), 'm', 'q', 'a')).declined).toBe(false);
    expect((await judgeDecline(mk('hmm'), 'm', 'q', 'a')).declined).toBeNull();
    const empty = (await judgeDecline(mk(''), 'm', 'q', 'a'));
    expect(empty.declined).toBeNull();
    expect(empty.usage.inputTokens).toBe(2); // retried once
  });
});

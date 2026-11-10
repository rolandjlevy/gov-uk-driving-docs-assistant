import { describe, expect, it } from 'vitest';
import { coerceSources, runAgent } from './agent.js';

const hit = { url: 'https://www.gov.uk/a', pageTitle: 'A', heading: 'H', text: 't', score: 0.7 };
const use = (id: string, name: string, input: unknown) => ({ type: 'tool_use', id, name, input });
function scripted(replies: any[][]) {
  const calls: any[] = [];
  let i = 0;
  return {
    calls,
    client: { messages: { create: async (req: any) => { calls.push(JSON.parse(JSON.stringify(req.messages))); return { content: replies[i++] ?? [], usage: { input_tokens: 10, output_tokens: 5 } }; } } } as any,
  };
}
const deps = (client: any, over: any = {}) => ({ client, model: 'm', search: async () => [hit], readPage: async () => ({ title: 'A', chunks: [{ heading: 'H', text: 'full' }] }), ...over });

describe('runAgent', () => {
  it('searches, then finishes with a retrieved citation', async () => {
    const s = scripted([[use('1', 'search_docs', { query: 'q' })], [use('2', 'finish', { status: 'answered', answer: '£62', sources: ['https://www.gov.uk/a'] })]]);
    const r = await runAgent(deps(s.client), 'cost?');
    expect(r.status).toBe('answered');
    expect(r.citedUrls).toEqual(['https://www.gov.uk/a']);
    expect(r.searches).toBe(1);
    expect(r.usage).toEqual({ inputTokens: 20, outputTokens: 10 });
  });

  it('returns every tool_result for parallel tool calls in one message', async () => {
    const s = scripted([[use('1', 'search_docs', { query: 'a' }), use('2', 'search_docs', { query: 'b' })], [use('3', 'finish', { status: 'not_covered', answer: 'no', sources: [] })]]);
    await runAgent(deps(s.client), 'q');
    const last = s.calls[1].at(-1);
    expect(last.role).toBe('user');
    expect(last.content.map((c: any) => c.tool_use_id)).toEqual(['1', '2']);
  });

  it('caps searches at 4', async () => {
    const five = Array.from({ length: 5 }, (_, i) => use(String(i), 'search_docs', { query: `q${i}` }));
    const s = scripted([five, [use('f', 'finish', { status: 'not_covered', answer: 'x', sources: [] })]]);
    let n = 0;
    const r = await runAgent(deps(s.client, { search: async () => (n++, [hit]) }), 'q');
    expect(n).toBe(4);
    expect(r.searches).toBe(4);
  });

  it('rejects an answer citing nothing retrieved once, then refuses if it persists', async () => {
    const bad = { status: 'answered', answer: 'x', sources: ['https://www.gov.uk/invented'] };
    const s = scripted([[use('1', 'finish', bad)], [use('2', 'finish', bad)]]);
    const r = await runAgent(deps(s.client), 'q');
    expect(r.status).toBe('not_covered');
    expect(r.invalidCitations).toEqual(['https://www.gov.uk/invented']);
  });

  it('drops invented citations but keeps valid ones', async () => {
    const s = scripted([[use('1', 'search_docs', { query: 'q' })], [use('2', 'finish', { status: 'answered', answer: 'x', sources: ['https://www.gov.uk/a', 'https://www.gov.uk/zzz'] })]]);
    const r = await runAgent(deps(s.client), 'q');
    expect(r.citedUrls).toEqual(['https://www.gov.uk/a']);
    expect(r.invalidCitations).toEqual(['https://www.gov.uk/zzz']);
  });

  it('read_page makes a page citable and reports unknown URLs as errors', async () => {
    const s = scripted([[use('1', 'read_page', { url: 'https://www.gov.uk/a' })], [use('2', 'finish', { status: 'answered', answer: 'x', sources: ['https://www.gov.uk/a'] })]]);
    const r = await runAgent(deps(s.client), 'q');
    expect(r.status).toBe('answered');
    const s2 = scripted([[use('1', 'read_page', { url: 'https://www.gov.uk/nope' })], [use('2', 'finish', { status: 'not_covered', answer: 'x', sources: [] })]]);
    await runAgent(deps(s2.client, { readPage: async () => null }), 'q');
    expect(s2.calls[1].at(-1).content[0].is_error).toBe(true);
  });

  it('gives up cleanly if the model never finishes', async () => {
    const s = scripted([]);
    const r = await runAgent(deps(s.client), 'q');
    expect(r.status).toBe('not_covered');
    expect(r.turns).toBe(10);
  });
});

describe('coerceSources', () => {
  it('accepts arrays, strings, comma lists and objects', () => {
    expect(coerceSources(['https://www.gov.uk/a'])).toEqual(['https://www.gov.uk/a']);
    expect(coerceSources('https://www.gov.uk/a')).toEqual(['https://www.gov.uk/a']);
    expect(coerceSources('https://www.gov.uk/a, https://www.gov.uk/b')).toEqual(['https://www.gov.uk/a', 'https://www.gov.uk/b']);
    expect(coerceSources([{ url: 'https://www.gov.uk/a' }])).toEqual(['https://www.gov.uk/a']);
    expect(coerceSources(undefined)).toEqual([]);
    expect(coerceSources('see the page')).toEqual([]);
  });
});

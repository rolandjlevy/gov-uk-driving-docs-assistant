import { describe, expect, it, vi } from 'vitest';
import { discover, keepResult } from './discover.js';

const res = (results: any[]) => new Response(JSON.stringify({ results }), { status: 200 });

describe('discover', () => {
  it('keeps guidance formats and drops news, publications and external links', () => {
    expect(keepResult({ link: '/vehicle-tax', format: 'transaction' })).toBe(true);
    expect(keepResult({ link: '/government/news/x', format: 'news_article' })).toBe(false);
    expect(keepResult({ link: '/government/publications/y', format: 'guide' })).toBe(false);
    expect(keepResult({ link: 'https://example.com', format: 'guide' })).toBe(false);
  });

  it('merges duplicates across queries and lists the most-found pages first', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(res([{ link: '/b', title: 'B', format: 'guide' }, { link: '/a', title: 'A', format: 'answer' }]))
      .mockResolvedValueOnce(res([{ link: '/b', title: 'B', format: 'guide' }, { link: '/news', title: 'N', format: 'news_article' }]));
    const out = await discover(['one', 'two'], fetchFn as any);
    expect(out.map((c) => c.path)).toEqual(['/b', '/a']);
    expect(out[0].queries).toEqual(['one', 'two']);
  });

  it('fails clearly on an API error', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));
    await expect(discover(['q'], fetchFn as any)).rejects.toThrow('500');
  });
});

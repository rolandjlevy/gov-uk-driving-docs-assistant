import { describe, expect, it, vi } from 'vitest';
import { embedTexts } from './voyage.js';

const ok = (n: number, offset = 0) =>
  new Response(JSON.stringify({ data: Array.from({ length: n }, (_, i) => ({ index: i, embedding: [offset + i, 0] })), usage: { total_tokens: n * 10 } }), { status: 200 });

describe('embedTexts', () => {
  it('batches at 64 inputs and keeps order', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(ok(64)).mockResolvedValueOnce(ok(6, 100));
    const r = await embedTexts(Array.from({ length: 70 }, (_, i) => `t${i}`), { inputType: 'document', apiKey: 'k', fetchFn: fetchFn as any });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(r.embeddings).toHaveLength(70);
    expect(r.embeddings[64][0]).toBe(100);
    expect(r.tokens).toBe(700);
  });

  it('sends the model, input type and key', async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok(1));
    await embedTexts(['a'], { inputType: 'query', apiKey: 'secret', model: 'voyage-4', fetchFn: fetchFn as any });
    const [, init] = fetchFn.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ input: ['a'], model: 'voyage-4', input_type: 'query' });
    expect(init.headers.authorization).toBe('Bearer secret');
  });

  it('retries a 429 and then succeeds', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(new Response('slow down', { status: 429 })).mockResolvedValueOnce(ok(1));
    const sleep = vi.fn().mockResolvedValue(undefined);
    await embedTexts(['a'], { inputType: 'document', apiKey: 'k', fetchFn: fetchFn as any, sleep });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('does not retry a 401', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('bad key', { status: 401 }));
    await expect(embedTexts(['a'], { inputType: 'document', apiKey: 'k', fetchFn: fetchFn as any })).rejects.toThrow('401');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('fails clearly without a key', async () => {
    const saved = process.env.VOYAGE_API_KEY;
    delete process.env.VOYAGE_API_KEY;
    await expect(embedTexts(['a'], { inputType: 'document' })).rejects.toThrow('VOYAGE_API_KEY');
    if (saved) process.env.VOYAGE_API_KEY = saved;
  });
});

import { describe, expect, it } from 'vitest';
import { checkLimits, memoryCounter, upstashCounter, validateQuestion } from './limits.js';

const cfg = { perIpPerHour: 2, dailyCap: 3, maxQuestionChars: 20 };
const fresh = () => { const m = new Map<string, number>(); return async (k: string) => { m.set(k, (m.get(k) ?? 0) + 1); return m.get(k)!; }; };

describe('checkLimits', () => {
  it('limits one caller per hour', async () => {
    const c = fresh();
    expect((await checkLimits('1.1.1.1', c, cfg)).ok).toBe(true);
    expect((await checkLimits('1.1.1.1', c, cfg)).ok).toBe(true);
    const r = await checkLimits('1.1.1.1', c, cfg);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe('ip');
  });
  it('stops everyone at the daily cap', async () => {
    const c = fresh();
    for (const ip of ['a', 'b', 'c']) expect((await checkLimits(ip, c, cfg)).ok).toBe(true);
    const r = await checkLimits('d', c, cfg);
    expect(!r.ok && r.reason).toBe('daily');
  });
  it('memory counter counts up', async () => {
    expect(await memoryCounter('k', 60)).toBe(1);
    expect(await memoryCounter('k', 60)).toBe(2);
  });
});

describe('upstashCounter', () => {
  it('reads the INCR result from the pipeline reply', async () => {
    const f = (async () => ({ ok: true, json: async () => [{ result: 7 }, { result: 1 }] })) as any;
    expect(await upstashCounter('https://x', 't', f)('k', 10)).toBe(7);
  });
  it('throws on an HTTP error', async () => {
    const f = (async () => ({ ok: false, status: 500 })) as any;
    await expect(upstashCounter('https://x', 't', f)('k', 10)).rejects.toThrow();
  });
});

describe('validateQuestion', () => {
  it('trims, collapses whitespace and enforces the cap', () => {
    expect(validateQuestion('  how   much? ', 20)).toEqual({ ok: true, question: 'how much?' });
    expect(validateQuestion('x'.repeat(21), 20).ok).toBe(false);
    expect(validateQuestion(' ', 20).ok).toBe(false);
    expect(validateQuestion(42 as any, 20).ok).toBe(false);
  });
});

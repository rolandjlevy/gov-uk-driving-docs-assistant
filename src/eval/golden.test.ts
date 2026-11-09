import { describe, expect, it } from 'vitest';
import { validateGolden, type GoldenQuestion } from './golden.js';

const q = (over: Partial<GoldenQuestion>): GoldenQuestion => ({
  id: 'q1', type: 'single_page', question: 'How?', key_facts: ['A fact'],
  expected_urls: ['https://www.gov.uk/a'], checked_on: '2026-11-09', ...over,
});
const slice = ['/a', '/b'];

describe('validateGolden', () => {
  it('accepts a good question', () => {
    expect(validateGolden([q({})], slice).errors).toEqual([]);
  });

  it('flags pages outside the slice, duplicates and empty questions', () => {
    const r = validateGolden([q({ expected_urls: ['https://www.gov.uk/zzz'] }), q({ question: '' })], slice);
    expect(r.errors.join('\n')).toMatch(/not in data\/slice.json/);
    expect(r.errors.join('\n')).toMatch(/duplicate id/);
    expect(r.errors.join('\n')).toMatch(/empty question/);
  });

  it('requires not_covered to have no expected pages but allows a closest page', () => {
    expect(validateGolden([q({ type: 'not_covered', expected_urls: [], key_facts: [], closest_urls: ['https://www.gov.uk/b'] })], slice).errors).toEqual([]);
    expect(validateGolden([q({ type: 'not_covered' })], slice).errors.join()).toMatch(/no expected_urls/);
  });

  it('needs two pages for multi_page', () => {
    expect(validateGolden([q({ type: 'multi_page' })], slice).errors.join()).toMatch(/two or more/);
  });

  it('counts types, unchecked questions and reports missing planned counts', () => {
    const r = validateGolden([q({ checked_on: null })], slice);
    expect(r.unchecked).toBe(1);
    expect(r.counts.single_page).toBe(1);
    expect(r.warnings.join()).toMatch(/single_page: 1 of 24/);
  });
});

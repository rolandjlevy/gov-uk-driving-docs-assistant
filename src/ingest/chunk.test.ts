import { describe, expect, it } from 'vitest';
import { toPage } from '../gov-uk/content-api.js';
import { chunkPage } from './chunk.js';

const guide = {
  title: 'Sample guide',
  public_updated_at: '2026-01-01T00:00:00Z',
  details: {
    parts: [
      { title: 'Overview', slug: 'overview', body: '<p>Intro text.</p><h2>Cost</h2><p>It is free.</p><h3>Exceptions</h3><p>None.</p>' },
      { title: 'Apply', slug: 'apply', body: '<p>Apply online.</p>' },
    ],
  },
};

describe('chunkPage', () => {
  const chunks = chunkPage(toPage('/sample', guide));

  it('splits at h2/h3 and keeps a heading trail', () => {
    expect(chunks.map((c) => c.heading)).toEqual([
      'Sample guide > Overview',
      'Sample guide > Overview > Cost',
      'Sample guide > Overview > Exceptions',
      'Sample guide > Apply',
    ]);
  });

  it('keeps the page URL and text on every chunk', () => {
    expect(chunks.every((c) => c.url === 'https://www.gov.uk/sample')).toBe(true);
    expect(chunks[1].text).toBe('It is free.');
  });

  it('handles body-only pages and empty pages', () => {
    expect(chunkPage(toPage('/x', { title: 'X', details: { body: '<p>Hi</p>' } }))).toHaveLength(1);
    expect(chunkPage(toPage('/y', { title: 'Y', details: {} }))).toHaveLength(0);
  });

  it('splits very long sections on paragraph boundaries', () => {
    const long = Array.from({ length: 40 }, (_, i) => `<p>${'word '.repeat(30)}${i}</p>`).join('');
    const out = chunkPage(toPage('/z', { title: 'Z', details: { body: long } }));
    expect(out.length).toBeGreaterThan(1);
    expect(out.every((c) => c.text.length <= 1800 + 200)).toBe(true);
  });
});

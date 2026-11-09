import { describe, expect, it, vi } from 'vitest';
import { ingest, embeddingInput } from './ingest.js';
import { toPage } from '../gov-uk/content-api.js';

const page = (title: string) => toPage('/' + title, { title, details: { body: '<p>Intro.</p><h2>Cost</h2><p>Free.</p>' } });

function fakePool() {
  const queries: string[] = [];
  const client = { query: vi.fn(async (sql: string) => { queries.push(sql.trim().split(/\s+/)[0]); return { rows: [] }; }), release: vi.fn() };
  const pool = {
    query: vi.fn(async (sql: string) => (sql.includes('atttypmod') ? { rows: [{ dim: 2 }] } : { rows: [] })),
    connect: vi.fn(async () => client),
  };
  return { pool: pool as any, client, queries };
}

describe('ingest', () => {
  it('dry run fetches and chunks but never embeds or touches the database', async () => {
    const embed = vi.fn();
    const s = await ingest({ paths: ['/a'], pool: null, fetchPage: async () => page('a'), embed });
    expect(s).toMatchObject({ pages: 1, chunks: 2, failed: [] });
    expect(embed).not.toHaveBeenCalled();
  });

  it('replaces a page inside one transaction', async () => {
    const { pool, client, queries } = fakePool();
    const embed = vi.fn(async (t: string[]) => ({ embeddings: t.map(() => [0.1, 0.2]), tokens: 5, model: 'm' }));
    const s = await ingest({ paths: ['/a'], pool, fetchPage: async () => page('a'), embed });
    expect(s).toMatchObject({ pages: 1, chunks: 2, tokens: 5 });
    expect(queries).toEqual(['BEGIN', 'DELETE', 'INSERT', 'INSERT', 'COMMIT']);
    expect(client.release).toHaveBeenCalled();
  });

  it('rolls back and carries on when one page fails', async () => {
    const { pool, client, queries } = fakePool();
    let n = 0;
    client.query.mockImplementation(async (sql: string) => {
      const verb = sql.trim().split(/\s+/)[0];
      queries.push(verb);
      if (verb === 'INSERT' && n++ === 0) throw new Error('boom');
      return { rows: [] };
    });
    const embed = async (t: string[]) => ({ embeddings: t.map(() => [0, 0]), tokens: 1, model: 'm' });
    const s = await ingest({ paths: ['/a', '/b'], pool, fetchPage: async (p) => page(p.slice(1)), embed });
    expect(s.failed).toEqual(['/a']);
    expect(s.pages).toBe(1);
    expect(queries).toContain('ROLLBACK');
  });

  it('reports a page with no text as failed', async () => {
    const s = await ingest({ paths: ['/x'], pool: null, fetchPage: async () => toPage('/x', { title: 'X', details: {} }), embed: vi.fn() });
    expect(s.failed).toEqual(['/x']);
  });

  it('puts the heading before the text in what gets embedded', () => {
    expect(embeddingInput('Guide > Cost', 'Free.')).toBe('Guide > Cost\n\nFree.');
  });
});

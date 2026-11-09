import { describe, expect, it, vi } from 'vitest';
import { searchDocs } from './search.js';

describe('searchDocs', () => {
  it('embeds the query and returns ranked hits', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ url: 'u', page_title: 'T', heading: 'T > H', text: 'x', score: '0.83' }] });
    const embed = vi.fn().mockResolvedValue({ embeddings: [[0.5, 0.25]] });
    const hits = await searchDocs({ query } as any, 'q', 3, embed);
    expect(embed).toHaveBeenCalledWith(['q']);
    expect(query.mock.calls[0][1]).toEqual(['[0.5,0.25]', 3]);
    expect(hits).toEqual([{ url: 'u', pageTitle: 'T', heading: 'T > H', text: 'x', score: 0.83 }]);
  });
});

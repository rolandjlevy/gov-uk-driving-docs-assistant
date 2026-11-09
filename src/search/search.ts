import type { Pool } from '../db/db.js';
import { toVectorLiteral } from '../db/db.js';
import { embedTexts } from '../embed/voyage.js';

export interface SearchHit {
  url: string;
  pageTitle: string;
  heading: string;
  text: string;
  /** Cosine similarity, higher is closer. */
  score: number;
}

type Embedder = (texts: string[]) => Promise<{ embeddings: number[][] }>;

export async function searchDocs(
  pool: Pick<Pool, 'query'>,
  query: string,
  k = 5,
  embed: Embedder = (t) => embedTexts(t, { inputType: 'query' }),
): Promise<SearchHit[]> {
  const { embeddings } = await embed([query]);
  const { rows } = await pool.query(
    `SELECT url, page_title, heading, text, 1 - (embedding <=> $1::vector) AS score
       FROM chunks
      ORDER BY embedding <=> $1::vector
      LIMIT $2`,
    [toVectorLiteral(embeddings[0]), k],
  );
  return rows.map((r: any) => ({ url: r.url, pageTitle: r.page_title, heading: r.heading, text: r.text, score: Number(r.score) }));
}

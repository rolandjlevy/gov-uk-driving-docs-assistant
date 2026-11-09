import pg from 'pg';

export type Pool = pg.Pool;

/** `sslmode=require` is about to change meaning in `pg`. Neon has a normal public certificate, so ask for what it does today. */
export function normaliseConnectionString(url: string): string {
  return url.replace(/([?&])sslmode=require(?=&|$)/, '$1sslmode=verify-full');
}

export function getPool(): Pool {
  const url = process.env.GOV_UK_DB_URL;
  if (!url) throw new Error('GOV_UK_DB_URL is not set. Add the Neon connection string to .env.');
  return new pg.Pool({ connectionString: normaliseConnectionString(url), max: 3 });
}

export const toVectorLiteral = (v: number[]) => `[${v.join(',')}]`;

/** Create the table and index if needed. The vector size comes from the first embedding, so it always matches the model. */
export async function ensureSchema(pool: Pool, dim: number): Promise<void> {
  if (!Number.isInteger(dim) || dim < 1 || dim > 2000) throw new Error(`Unsupported embedding size: ${dim}`);

  await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chunks (
      id BIGSERIAL PRIMARY KEY,
      url TEXT NOT NULL,
      ord INT NOT NULL,
      page_title TEXT NOT NULL,
      heading TEXT NOT NULL,
      text TEXT NOT NULL,
      page_updated_at TIMESTAMPTZ,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      embedding_model TEXT NOT NULL,
      embedding vector(${dim}) NOT NULL,
      UNIQUE (url, ord)
    )`);
  await pool.query('CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops)');
  await pool.query('CREATE INDEX IF NOT EXISTS chunks_url_idx ON chunks (url)');

  const { rows } = await pool.query(
    `SELECT atttypmod AS dim FROM pg_attribute WHERE attrelid = 'chunks'::regclass AND attname = 'embedding'`,
  );
  const existing = rows[0]?.dim;
  if (existing && existing !== dim) {
    throw new Error(`chunks.embedding is vector(${existing}) but the model returned ${dim} values. Drop the table or use the same model.`);
  }
}

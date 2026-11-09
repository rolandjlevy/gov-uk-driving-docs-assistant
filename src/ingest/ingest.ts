import type { GovUkPage } from '../gov-uk/content-api.js';
import type { Pool } from '../db/db.js';
import { ensureSchema, toVectorLiteral } from '../db/db.js';
import { chunkPage } from './chunk.js';
import type { EmbedResult } from '../embed/voyage.js';

export interface IngestDeps {
  paths: string[];
  fetchPage: (path: string) => Promise<GovUkPage>;
  embed: (texts: string[]) => Promise<EmbedResult>;
  pool: Pool | null; // null = dry run
  log?: (msg: string) => void;
  delayMs?: number;
}

export interface IngestSummary { pages: number; chunks: number; tokens: number; failed: string[] }

/** The text that gets embedded: heading first, so "Cost" chunks know which page they belong to. */
export const embeddingInput = (heading: string, text: string) => `${heading}\n\n${text}`;

export async function ingest(deps: IngestDeps): Promise<IngestSummary> {
  const log = deps.log ?? (() => {});
  const summary: IngestSummary = { pages: 0, chunks: 0, tokens: 0, failed: [] };
  let schemaReady = false;

  for (const path of deps.paths) {
    try {
      const page = await deps.fetchPage(path);
      const chunks = chunkPage(page);
      if (chunks.length === 0) throw new Error(`no text found on this page (details keys: ${page.detailKeys.join(', ') || 'none'})`);

      if (deps.pool) {
        const { embeddings, tokens, model } = await deps.embed(chunks.map((c) => embeddingInput(c.heading, c.text)));
        if (!schemaReady) {
          await ensureSchema(deps.pool, embeddings[0].length);
          schemaReady = true;
        }
        const client = await deps.pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('DELETE FROM chunks WHERE url = $1', [page.url]);
          for (let i = 0; i < chunks.length; i++) {
            const c = chunks[i];
            await client.query(
              `INSERT INTO chunks (url, ord, page_title, heading, text, page_updated_at, embedding_model, embedding)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector)`,
              [c.url, i, c.pageTitle, c.heading, c.text, c.pageUpdatedAt, model, toVectorLiteral(embeddings[i])],
            );
          }
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
        summary.tokens += tokens;
      }

      summary.pages++;
      summary.chunks += chunks.length;
      log(`ok   ${path}  chunks=${chunks.length}`);
    } catch (err) {
      summary.failed.push(path);
      log(`FAIL ${path}  ${(err as Error).message}`);
    }
    if (deps.delayMs) await new Promise((r) => setTimeout(r, deps.delayMs));
  }
  return summary;
}

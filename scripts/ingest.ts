// Fetch the pages in data/slice.json, chunk them, embed with Voyage and store them in Neon.
// `npm run ingest`              full run (needs GOV_UK_DB_URL and VOYAGE_API_KEY)
// `npm run ingest -- --dry-run` fetch and chunk only, no embedding or database
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fetchPage } from '../src/gov-uk/content-api.js';
import { embedTexts } from '../src/embed/voyage.js';
import { getPool } from '../src/db/db.js';
import { ingest } from '../src/ingest/ingest.js';

const dryRun = process.argv.includes('--dry-run');
const { paths } = JSON.parse(readFileSync('data/slice.json', 'utf8')) as { paths: string[] };
const pool = dryRun ? null : getPool();

const summary = await ingest({
  paths,
  pool,
  fetchPage: (p) => fetchPage(p),
  embed: (texts) => embedTexts(texts, { inputType: 'document' }),
  log: console.log,
  delayMs: 300,
});

console.log(`\n${dryRun ? 'Dry run: ' : ''}${summary.pages} pages, ${summary.chunks} chunks, ${summary.tokens} embedding tokens, ${summary.failed.length} failed`);
if (summary.failed.length) console.log('Failed:', summary.failed.join(', '));
await pool?.end();
process.exitCode = summary.failed.length ? 1 : 0;

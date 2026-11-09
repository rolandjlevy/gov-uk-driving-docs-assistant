// Checks every path in data/slice.json against the GOV.UK Content API and reports what it found.
// Run from your own machine: `npm run slice:check`.
import { readFileSync } from 'node:fs';
import { fetchPage } from '../src/gov-uk/content-api.js';
import { chunkPage } from '../src/ingest/chunk.js';

const { paths } = JSON.parse(readFileSync('data/slice.json', 'utf8')) as { paths: string[] };
let bad = 0;

for (const p of paths) {
  try {
    const page = await fetchPage(p);
    const chunks = chunkPage(page);
    console.log(`ok   ${p}  "${page.title}"  sections=${page.sections.length} chunks=${chunks.length} updated=${page.updatedAt}`);
    if (chunks.length === 0) { bad++; console.log(`     ^ no text found (details keys: ${page.detailKeys.join(', ') || 'none'}): this page format needs handling in content-api.ts`); }
  } catch (err) {
    bad++;
    console.log(`FAIL ${p}  ${(err as Error).message}`);
  }
}
process.exitCode = bad ? 1 : 0;

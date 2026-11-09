// Ask the index a question and print the top matches: `npm run search -- "how do I change my address"`
import 'dotenv/config';
import { getPool } from '../src/db/db.js';
import { searchDocs } from '../src/search/search.js';

const query = process.argv.slice(2).join(' ').trim();
if (!query) {
  console.error('Usage: npm run search -- "your question"');
  process.exit(1);
}

const pool = getPool();
const hits = await searchDocs(pool, query, 5);
hits.forEach((h, i) => {
  console.log(`\n${i + 1}. ${h.score.toFixed(3)}  ${h.heading}\n   ${h.url}\n   ${h.text.replace(/\s+/g, ' ').slice(0, 200)}`);
});
await pool.end();

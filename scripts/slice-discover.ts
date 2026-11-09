// Find candidate pages for the slice. Run from your own machine.
// `npm run slice:discover`            writes data/slice.candidates.json and prints a summary
// `npm run slice:discover -- --write` also merges every candidate into data/slice.json (then prune by hand)
import { readFileSync, writeFileSync } from 'node:fs';
import { discover, TOPIC_QUERIES } from '../src/gov-uk/discover.js';

const candidates = await discover(TOPIC_QUERIES);
writeFileSync('data/slice.candidates.json', JSON.stringify(candidates, null, 2) + '\n');

for (const c of candidates) console.log(`${String(c.queries.length).padStart(2)}x  ${c.format.padEnd(18)} ${c.path}  "${c.title}"`);
console.log(`\n${candidates.length} candidate pages written to data/slice.candidates.json`);

if (process.argv.includes('--write')) {
  const slice = JSON.parse(readFileSync('data/slice.json', 'utf8')) as { note?: string; paths: string[] };
  const merged = [...new Set([...slice.paths, ...candidates.map((c) => c.path)])];
  writeFileSync('data/slice.json', JSON.stringify({ ...slice, paths: merged }, null, 2) + '\n');
  console.log(`data/slice.json now has ${merged.length} paths. Remove any that are off-topic, then run: npm run slice:check`);
}

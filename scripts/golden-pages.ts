// Help check the golden set against the live pages. Run from your own machine.
// `npm run golden:pages`            writes evals/golden.sources.md: the text of every page the questions cite
// `npm run golden:pages -- --recent` lists slice pages by last-updated date, to pick "recently changed" questions
import { readFileSync, writeFileSync } from 'node:fs';
import { fetchPage } from '../src/gov-uk/content-api.js';
import { pageToMarkdown } from '../src/gov-uk/text.js';
import type { GoldenQuestion } from '../src/eval/golden.js';

const BASE = 'https://www.gov.uk';
const pause = () => new Promise((r) => setTimeout(r, 250));

if (process.argv.includes('--recent')) {
  const { paths } = JSON.parse(readFileSync('data/slice.json', 'utf8')) as { paths: string[] };
  const rows: { path: string; updated: string }[] = [];
  for (const p of paths) {
    try { rows.push({ path: p, updated: (await fetchPage(p)).updatedAt ?? '' }); } catch { rows.push({ path: p, updated: 'FAILED' }); }
    await pause();
  }
  rows.sort((a, b) => b.updated.localeCompare(a.updated));
  rows.forEach((r) => console.log(`${r.updated.slice(0, 10).padEnd(10)}  ${r.path}`));
} else {
  const { questions } = JSON.parse(readFileSync('evals/golden.json', 'utf8')) as { questions: GoldenQuestion[] };
  const urls = [...new Set(questions.flatMap((q) => [...q.expected_urls, ...(q.closest_urls ?? [])]))];
  const parts: string[] = [`# Pages cited by the golden set\n\nFetched ${new Date().toISOString()}\n`];
  for (const u of urls) {
    try { parts.push(pageToMarkdown(await fetchPage(u.replace(BASE, '')))); } catch (e) { parts.push(`## ${u}\n\nFAILED: ${(e as Error).message}`); }
    await pause();
  }
  writeFileSync('evals/golden.sources.md', parts.join('\n\n---\n\n') + '\n');
  console.log(`Wrote evals/golden.sources.md (${urls.length} pages)`);
}

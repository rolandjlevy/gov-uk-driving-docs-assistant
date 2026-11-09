// Validate evals/golden.json against the schema and data/slice.json. Run: npm run golden:check
import { readFileSync } from 'node:fs';
import { validateGolden, type GoldenQuestion } from '../src/eval/golden.js';

const { questions } = JSON.parse(readFileSync('evals/golden.json', 'utf8')) as { questions: GoldenQuestion[] };
const { paths } = JSON.parse(readFileSync('data/slice.json', 'utf8')) as { paths: string[] };
const r = validateGolden(questions, paths);

console.log(`${r.total} questions:`, r.counts);
console.log(`${r.total - r.unchecked} checked against the live pages, ${r.unchecked} not yet`);
r.errors.forEach((e) => console.log('ERROR  ', e));
r.warnings.forEach((w) => console.log('warning', w));
process.exitCode = r.errors.length ? 1 : 0;

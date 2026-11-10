// Stage 4: run a baseline over the golden set and save a scored run.
//   npm run eval -- --system=model-alone|one-search|agent [--ids=g01,g02] [--type=single_page] [--judge-model=...]
import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { getPageChunks, getPool } from '../src/db/db.js';
import { searchDocs } from '../src/search/search.js';
import { SYSTEMS, type SystemName } from '../src/eval/systems.js';
import { judgeDecline, judgeFacts, scoreCode, summarise, type Scores } from '../src/eval/score.js';
import type { GoldenQuestion } from '../src/eval/golden.js';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const system = (arg('system') ?? 'model-alone') as SystemName;
if (!(system in SYSTEMS)) { console.error(`Unknown --system. Use one of: ${Object.keys(SYSTEMS).join(', ')}`); process.exit(1); }
if (!process.env.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY is not set.'); process.exit(1); }

const model = process.env.MODEL ?? 'claude-haiku-5-5';
const judgeModel = arg('judge-model') ?? process.env.JUDGE_MODEL ?? model;
let { questions } = JSON.parse(readFileSync('evals/golden.json', 'utf8')) as { questions: GoldenQuestion[] };
const ids = arg('ids')?.split(',');
const type = arg('type');
if (ids) questions = questions.filter((q) => ids.includes(q.id));
if (type) questions = questions.filter((q) => q.type === type);

const client = new Anthropic();
const pool = system === 'model-alone' ? null : getPool();
const search = pool ? (q: string, k: number) => searchDocs(pool, q, k) : undefined;
const readPage = pool ? (url: string) => getPageChunks(pool, url) : undefined;

const rows = [];
for (const q of questions) {
  let answer;
  try { answer = await SYSTEMS[system]({ client, model, search, readPage }, q.question); }
  catch (e) { console.warn(`  ! ${q.id} failed: ${(e as Error).message}`); continue; }
  const judged = await judgeFacts(client, judgeModel, q, answer.answer);
  const code = scoreCode(q, answer);
  const facts = judged.results?.length ? judged.results.filter(Boolean).length / judged.results.length : null;
  const judgeFailed = judged.results === null;
  if (judgeFailed) console.warn(`  ! ${q.id}: judge reply unreadable, row not scored`);
  const dec = q.type === 'not_covered' ? await judgeDecline(client, judgeModel, q.question, answer.answer) : null;
  const scores: Scores = { ...code, facts, factResults: judged.results ?? [], judgeFailed, declined: dec ? dec.declined : undefined };
  rows.push({ id: q.id, type: q.type, question: q.question, answer, scores, judgeUsage: judged.usage, judgeRaw: judged.raw });
  console.log(`${q.id} ${q.type.padEnd(16)} facts=${facts === null ? '-' : facts.toFixed(2)} retr=${code.retrieval ?? '-'} refusal=${code.refusalCorrect ? 'ok' : 'WRONG'}${dec ? ` declined=${dec.declined}` : ''} ${answer.ms}ms`);
}
await pool?.end();

const byType: Record<string, unknown> = {};
for (const t of new Set(rows.map((r) => r.type))) byType[t] = summarise(rows.filter((r) => r.type === t));
const summary = { all: summarise(rows), byType };
mkdirSync('evals/runs', { recursive: true });
const file = `evals/runs/${system}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(file, JSON.stringify({ system, model, judgeModel, ranAt: new Date().toISOString(), summary, rows }, null, 2));
console.log('\n', JSON.stringify(summary.all, null, 2), `\nSaved ${file}`);

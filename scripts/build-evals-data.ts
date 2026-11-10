// Builds data/evals.json for the /evals page from the saved full runs in evals/runs.
// Per system and judge model, the latest run that covered all 40 questions is used.
import fs from 'node:fs';
import path from 'node:path';

const dir = 'evals/runs';
const golden = JSON.parse(fs.readFileSync('evals/golden.json', 'utf8'));
const SYSTEMS = ['model-alone', 'one-search', 'agent'];

interface Run { system: string; model: string; judgeModel?: string; ranAt?: string; summary: any; rows: any[] }
const runs: (Run & { file: string })[] = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
  .map((file) => ({ ...(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as Run), file }))
  .filter((r) => r.rows.length === golden.questions?.length || r.rows.length === 40);

const judges = [...new Set(runs.map((r) => r.judgeModel ?? 'unknown'))];
const pick = (system: string, judge: string) => runs.filter((r) => r.system === system && (r.judgeModel ?? 'unknown') === judge).pop();

const bySystem: Record<string, any> = {};
for (const judge of judges) {
  for (const s of SYSTEMS) {
    const r = pick(s, judge);
    if (!r) continue;
    (bySystem[s] ??= {})[judge] = { file: r.file, model: r.model, ranAt: r.ranAt, summary: r.summary };
  }
}

// Compact per-question rows from each system's latest run (any judge; prefer the one with most runs).
const headlineJudge = judges.find((j) => /sonnet/i.test(j)) ?? judges[judges.length - 1];
const questions = (golden.questions ?? golden).map((g: any) => {
  const row: any = { id: g.id, type: g.type, question: g.question };
  for (const s of SYSTEMS) {
    const r = pick(s, headlineJudge);
    const x = r?.rows.find((y) => y.id === g.id);
    if (x) row[s] = { status: x.answer?.status, facts: x.scores?.facts ?? null, retrieval: x.scores?.retrieval ?? null, declined: x.scores?.declined ?? null, answer: String(x.answer?.answer ?? '').slice(0, 700) };
  }
  return row;
});

// Failure examples: the agent's weakest rows, and rows where one-search failed but the agent did not.
const agentRun = pick('agent', headlineJudge);
const failures = (agentRun?.rows ?? []).filter((x) => (x.scores?.facts ?? 1) < 0.6 || x.scores?.refusalCorrect === false).map((x) => x.id);

fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/evals.json', JSON.stringify({ generatedAt: new Date().toISOString(), headlineJudge, judges, bySystem, questions, agentFailures: failures, goldenNote: golden.note ?? null }, null, 1));
console.log(`data/evals.json written: ${Object.keys(bySystem).length} systems, judges ${judges.join(', ')}, agent failures ${failures.join(', ') || 'none'}`);

// Stage 1 pre-check: ask the model each question with NO search and save its answers for hand-marking.
// If it gets more than about 90% right, the slice is too well known for retrieval to show a gain.
import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync } from 'node:fs';

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is not set. Copy .env.example to .env, add your key, and run again.');
  process.exit(1);
}

const model = process.env.MODEL ?? 'claude-haiku-5-5';
const { questions } = JSON.parse(readFileSync('evals/precheck.questions.json', 'utf8')) as {
  questions: { id: string; question: string }[];
};

const client = new Anthropic(); // reads ANTHROPIC_API_KEY
function ask(question: string) {
  return client.messages.create({
    model,
    max_tokens: 4000,
    system: 'You answer UK driving and vehicle questions. Answer concisely from your own knowledge. If you are unsure, say so.',
    messages: [{ role: 'user', content: question }],
  });
}
const textOf = (m: Awaited<ReturnType<typeof ask>>) => m.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();

const results: { id: string; question: string; answer: string; stopReason: string | null; blockTypes: string[]; correct: boolean | null; notes: string }[] = [];

for (const q of questions) {
  let msg = await ask(q.question);
  let answer = textOf(msg);
  if (!answer) msg = await ask(q.question), (answer = textOf(msg)); // one retry on an empty answer
  if (!answer) console.warn(`  ! empty answer (stop_reason=${msg.stop_reason}, blocks=${msg.content.map((b) => b.type).join(',')})`);
  results.push({ id: q.id, question: q.question, answer, stopReason: msg.stop_reason, blockTypes: msg.content.map((b) => b.type), correct: null, notes: '' });
  console.log(`\n[${q.id}] ${q.question}\n${answer}`);
}

writeFileSync('evals/precheck.answers.json', JSON.stringify({ model, ranAt: new Date().toISOString(), results }, null, 2));
console.log('\nSaved evals/precheck.answers.json. Set "correct" to true/false for each by checking the live GOV.UK page.');

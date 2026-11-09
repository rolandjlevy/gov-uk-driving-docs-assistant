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
const results: { id: string; question: string; answer: string; correct: boolean | null; notes: string }[] = [];

for (const q of questions) {
  const msg = await client.messages.create({
    model,
    max_tokens: 400,
    system: 'You answer UK driving and vehicle questions. Answer concisely from your own knowledge. If you are unsure, say so.',
    messages: [{ role: 'user', content: q.question }],
  });
  const answer = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
  results.push({ id: q.id, question: q.question, answer, correct: null, notes: '' });
  console.log(`\n[${q.id}] ${q.question}\n${answer}`);
}

writeFileSync('evals/precheck.answers.json', JSON.stringify({ model, ranAt: new Date().toISOString(), results }, null, 2));
console.log('\nSaved evals/precheck.answers.json. Set "correct" to true/false for each by checking the live GOV.UK page.');

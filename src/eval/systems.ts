// Stage 4 baselines. Both ask for the same JSON reply so they are scored the same way.
// 1. modelAlone: no search at all.  2. oneSearchRag: embed the question once, take the top k chunks, answer from them.
import type Anthropic from '@anthropic-ai/sdk';
import type { SearchHit } from '../search/search.js';
import { parseReply, type SystemAnswer } from './answer.js';
import { runAgent, type AgentDeps } from '../agent/agent.js';

type Client = Pick<Anthropic, 'messages'>;
export interface SystemDeps { client: Client; model: string; search?: (query: string, k: number) => Promise<SearchHit[]>; readPage?: AgentDeps['readPage'] }

const FORMAT = `Reply with only a JSON object: {"status":"answered"|"not_covered","answer":"...","sources":["https://www.gov.uk/..."]}.
Keep the answer short and specific (figures, deadlines, conditions). `;

const ALONE_SYSTEM = `You answer UK driving and vehicle questions from your own knowledge. ${FORMAT}
Use "not_covered" with a one-line explanation if the question is outside UK driving and vehicle rules, or you are not sure. "sources" may be empty.`;

const RAG_SYSTEM = `You answer UK driving and vehicle questions using ONLY the GOV.UK extracts provided. ${FORMAT}
Use "not_covered" if the extracts do not answer the question; do not use outside knowledge. "sources" must be URLs taken from the extracts you relied on.`;

async function ask(deps: SystemDeps, system: string, user: string) {
  const t0 = Date.now();
  const msg = await deps.client.messages.create({ model: deps.model, max_tokens: 2000, system, messages: [{ role: 'user', content: user }] });
  const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  return { text, usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens }, ms: Date.now() - t0 };
}

export async function modelAlone(deps: SystemDeps, question: string): Promise<SystemAnswer> {
  const r = await ask(deps, ALONE_SYSTEM, question);
  const p = parseReply(r.text);
  return { status: p.status, answer: p.answer, citedUrls: p.sources, retrievedUrls: [], usage: r.usage, ms: r.ms };
}

export function formatExtracts(hits: SearchHit[]): string {
  return hits.map((h, i) => `[${i + 1}] ${h.url}\n${h.pageTitle} > ${h.heading}\n${h.text}`).join('\n\n');
}

export async function oneSearchRag(deps: SystemDeps, question: string, k = 5): Promise<SystemAnswer> {
  if (!deps.search) throw new Error('oneSearchRag needs a search function');
  const t0 = Date.now();
  const hits = await deps.search(question, k);
  const r = await ask(deps, RAG_SYSTEM, `Extracts:\n\n${formatExtracts(hits)}\n\nQuestion: ${question}`);
  const p = parseReply(r.text);
  return { status: p.status, answer: p.answer, citedUrls: p.sources, retrievedUrls: [...new Set(hits.map((h) => h.url))], usage: r.usage, ms: Date.now() - t0 };
}

export async function agentSystem(deps: SystemDeps, question: string): Promise<SystemAnswer> {
  if (!deps.search || !deps.readPage) throw new Error('agent needs search and readPage');
  return runAgent({ client: deps.client, model: deps.model, search: deps.search, readPage: deps.readPage }, question);
}

export const SYSTEMS = { 'model-alone': modelAlone, 'one-search': oneSearchRag, agent: agentSystem } as const;
export type SystemName = keyof typeof SYSTEMS;

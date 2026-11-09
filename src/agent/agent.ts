// Stage 5: the agent. Claude drives: it calls search_docs / read_page as often as it needs (capped), then finish.
// Code, not the model, enforces: the search cap, and that every cited URL was really retrieved.
import type Anthropic from '@anthropic-ai/sdk';
import type { SearchHit } from '../search/search.js';
import { normaliseUrl, type SystemAnswer } from '../eval/answer.js';

export const MAX_SEARCHES = 4;
export const MAX_TURNS = 10;
export const MAX_PAGE_CHARS = 15000;

export interface PageChunk { heading: string; text: string }
export interface AgentDeps {
  client: Pick<Anthropic, 'messages'>;
  model: string;
  search: (query: string, k: number) => Promise<SearchHit[]>;
  readPage: (url: string) => Promise<{ title: string; chunks: PageChunk[] } | null>;
}

export interface TraceStep { tool: string; input: unknown; summary: string }
export interface AgentResult extends SystemAnswer { trace: TraceStep[]; searches: number; invalidCitations: string[]; turns: number }

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_docs',
    description: 'Search the GOV.UK driving and vehicle pages. Returns the best matching passages with their page URL. Try a different, more specific query if the first misses.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'read_page',
    description: 'Read the full text of one GOV.UK page by URL (use a URL returned by search_docs) when a passage looks relevant but incomplete.',
    input_schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
  },
  {
    name: 'finish',
    description: 'Give the final answer. Use status "not_covered" if the pages do not answer the question.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['answered', 'not_covered'] },
        answer: { type: 'string', description: 'Short, specific answer (figures, deadlines, conditions). For not_covered, one line on what is missing.' },
        sources: { type: 'array', items: { type: 'string' }, description: 'URLs of the pages you relied on. Required when answered.' },
      },
      required: ['status', 'answer', 'sources'],
    },
  },
];

export const AGENT_SYSTEM = `You answer UK driving and vehicle questions using ONLY the GOV.UK pages you can search. Never answer from memory.
Search first. If a passage is incomplete or the question has several parts, search again with different words or read the whole page. You have at most ${MAX_SEARCHES} searches.
When you have enough, call finish. Cite only URLs you retrieved. If the pages do not answer the question (it is outside UK driving rules, or about another country, or personal advice), call finish with status "not_covered" rather than guessing.`;

const hitText = (hits: SearchHit[]) =>
  hits.length ? hits.map((h, i) => `[${i + 1}] ${h.url}\n${h.pageTitle} > ${h.heading}\n${h.text}`).join('\n\n') : 'No results.';

export async function runAgent(deps: AgentDeps, question: string): Promise<AgentResult> {
  const t0 = Date.now();
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: question }];
  const seen = new Set<string>();
  const trace: TraceStep[] = [];
  const usage = { inputTokens: 0, outputTokens: 0 };
  let searches = 0;
  let nudged = false;
  let final: { status: 'answered' | 'not_covered'; answer: string; sources: string[] } | null = null;
  let turns = 0;

  while (!final && turns < MAX_TURNS) {
    turns++;
    const msg = await deps.client.messages.create({ model: deps.model, max_tokens: 2000, system: AGENT_SYSTEM, tools: TOOLS, messages });
    usage.inputTokens += msg.usage.input_tokens;
    usage.outputTokens += msg.usage.output_tokens;
    messages.push({ role: 'assistant', content: msg.content });

    const calls = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (!calls.length) { messages.push({ role: 'user', content: 'Call finish with your answer.' }); continue; }

    // Every tool_use block needs a tool_result in the next single user message.
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const c of calls) {
      const input = (c.input ?? {}) as Record<string, any>;
      let content = '';
      let isError = false;
      try {
        if (c.name === 'search_docs') {
          if (searches >= MAX_SEARCHES) { content = `Search limit reached (${MAX_SEARCHES}). Use what you have and call finish.`; isError = true; }
          else {
            searches++;
            const hits = await deps.search(String(input.query ?? ''), 5);
            hits.forEach((h) => seen.add(normaliseUrl(h.url)));
            content = hitText(hits);
            trace.push({ tool: 'search_docs', input, summary: `${hits.length} hits: ${[...new Set(hits.map((h) => h.url))].join(', ')}` });
          }
        } else if (c.name === 'read_page') {
          const url = String(input.url ?? '');
          const page = await deps.readPage(url);
          if (!page) { content = 'That URL is not in the document set. Use a URL from search_docs.'; isError = true; }
          else {
            seen.add(normaliseUrl(url));
            let text = `${page.title}\n\n` + page.chunks.map((ch) => `## ${ch.heading}\n${ch.text}`).join('\n\n');
            if (text.length > MAX_PAGE_CHARS) text = text.slice(0, MAX_PAGE_CHARS) + '\n[page truncated]';
            content = text;
            trace.push({ tool: 'read_page', input, summary: `${text.length} chars` });
          }
        } else if (c.name === 'finish') {
          const status = input.status === 'not_covered' ? 'not_covered' : 'answered';
          const sources = Array.isArray(input.sources) ? input.sources.filter((s: unknown): s is string => typeof s === 'string') : [];
          const answer = String(input.answer ?? '').trim();
          const valid = sources.filter((s) => seen.has(normaliseUrl(s)));
          if (status === 'answered' && valid.length === 0 && !nudged) {
            nudged = true; isError = true;
            content = 'Rejected: an answer needs at least one source URL that you retrieved with search_docs or read_page. Retrieve it, or finish with not_covered.';
          } else { final = { status, answer, sources }; content = 'Done.'; }
          trace.push({ tool: 'finish', input, summary: isError ? 'rejected: no valid source' : status });
        } else { content = `Unknown tool ${c.name}`; isError = true; }
      } catch (e) { content = `Tool failed: ${(e as Error).message}`; isError = true; }
      results.push({ type: 'tool_result', tool_use_id: c.id, content, is_error: isError });
    }
    messages.push({ role: 'user', content: results });
  }

  // Code-level backstops: drop invented citations; an answer with no valid citation becomes a refusal.
  const sources = final?.sources ?? [];
  const citedUrls = sources.filter((s) => seen.has(normaliseUrl(s)));
  const invalidCitations = sources.filter((s) => !seen.has(normaliseUrl(s)));
  let status = final?.status ?? 'not_covered';
  let answer = final?.answer ?? 'No answer was reached.';
  if (status === 'answered' && citedUrls.length === 0) { status = 'not_covered'; answer = 'I could not back an answer with a GOV.UK page I retrieved.'; }

  return { status, answer, citedUrls, retrievedUrls: [...seen], usage, ms: Date.now() - t0, trace, searches, invalidCitations, turns };
}

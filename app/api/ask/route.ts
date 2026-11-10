import Anthropic from '@anthropic-ai/sdk';
import { runAgent } from '../../../src/agent/agent.js';
import { getPageChunks, getPageTitles, getPool } from '../../../src/db/db.js';
import { searchDocs } from '../../../src/search/search.js';
import { normaliseUrl } from '../../../src/eval/answer.js';
import { checkLimits, defaultCounter, limitsFromEnv, validateQuestion } from '../../../src/limits.js';

export const runtime = 'nodejs';
export const maxDuration = 60;


export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return Response.json({ error: 'Send JSON with a "question".' }, { status: 400 }); }
  const cfg = limitsFromEnv();
  const v = validateQuestion(body?.question, cfg.maxQuestionChars);
  if (!v.ok) return Response.json({ error: v.message }, { status: 400 });

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  const lim = await checkLimits(ip, defaultCounter(), cfg);
  if (!lim.ok) {
    const msg = lim.reason === 'daily' ? 'The demo has reached its daily question limit. Try again tomorrow.' : 'You have asked a lot of questions this hour. Try again later.';
    return Response.json({ error: msg }, { status: 429, headers: { 'Retry-After': String(lim.retryAfterSeconds) } });
  }

  try {
    const pool = getPool();
    const r = await runAgent({
      client: new Anthropic(), model: process.env.MODEL ?? 'claude-haiku-5-5',
      search: (q, k) => searchDocs(pool, q, k), readPage: (u) => getPageChunks(pool, u),
    }, v.question);
    // Show the stored URL of each retrieved page that was cited (the agent already checked citations were retrieved).
    const byNorm = new Map(r.retrievedUrls.map((u) => [normaliseUrl(u), u]));
    const urls = [...new Set(r.status === 'answered' ? r.citedUrls.map((u) => byNorm.get(normaliseUrl(u))).filter((u): u is string => !!u) : [])];
    const titles = await getPageTitles(pool, urls).catch(() => ({}) as Record<string, string>);
    return Response.json({ status: r.status, answer: r.answer, sources: urls.map((url) => ({ url: /^https?:\/\//i.test(url) ? url : 'https://www.' + url, title: titles[url] ?? url })) });
  } catch (err) {
    console.error('ask failed', err);
    return Response.json({ error: 'Something went wrong answering that. Try again.' }, { status: 500 });
  }
}

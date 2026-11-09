// Voyage AI embeddings over plain fetch. Docs: https://docs.voyageai.com/reference/embeddings-api
export const DEFAULT_EMBED_MODEL = 'voyage-4';
const ENDPOINT = 'https://api.voyageai.com/v1/embeddings';
const BATCH_SIZE = 64;

export interface EmbedOptions {
  inputType: 'document' | 'query';
  model?: string;
  apiKey?: string;
  fetchFn?: typeof fetch;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface EmbedResult {
  embeddings: number[][];
  tokens: number;
  model: string;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function embedTexts(texts: string[], opts: EmbedOptions): Promise<EmbedResult> {
  const apiKey = opts.apiKey ?? process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error('VOYAGE_API_KEY is not set. Add it to .env.');
  const model = opts.model ?? process.env.EMBED_MODEL ?? DEFAULT_EMBED_MODEL;
  const fetchFn = opts.fetchFn ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const maxRetries = opts.maxRetries ?? 5;

  const embeddings: number[][] = [];
  let tokens = 0;

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const json = await postWithRetry(fetchFn, apiKey, { input: batch, model, input_type: opts.inputType }, maxRetries, sleep);
    const data = [...json.data].sort((a: any, b: any) => a.index - b.index);
    if (data.length !== batch.length) throw new Error(`Voyage returned ${data.length} embeddings for ${batch.length} inputs`);
    for (const d of data) embeddings.push(d.embedding);
    tokens += json.usage?.total_tokens ?? 0;
  }
  return { embeddings, tokens, model };
}

async function postWithRetry(fetchFn: typeof fetch, apiKey: string, body: unknown, maxRetries: number, sleep: (ms: number) => Promise<void>) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetchFn(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (res.ok) return (await res.json()) as any;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= maxRetries) {
      throw new Error(`Voyage API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    await sleep(Math.min(30_000, 1000 * 2 ** attempt));
  }
}

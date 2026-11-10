// Abuse and spend limits for the public endpoint. Upstash Redis over its REST API when configured,
// otherwise an in-memory fallback (fine for local use; per-instance on a serverless host).
export interface LimitConfig { perIpPerHour: number; dailyCap: number; maxQuestionChars: number }
export const DEFAULT_LIMITS: LimitConfig = { perIpPerHour: 10, dailyCap: 300, maxQuestionChars: 500 };

export type LimitResult = { ok: true } | { ok: false; reason: 'ip' | 'daily'; retryAfterSeconds: number };

type Counter = (key: string, ttlSeconds: number) => Promise<number>;

const mem = new Map<string, { n: number; exp: number }>();
export const memoryCounter: Counter = async (key, ttl) => {
  const now = Date.now();
  const cur = mem.get(key);
  if (!cur || cur.exp <= now) { mem.set(key, { n: 1, exp: now + ttl * 1000 }); return 1; }
  cur.n++;
  return cur.n;
};

export function upstashCounter(url: string, token: string, fetchFn: typeof fetch = fetch): Counter {
  return async (key, ttl) => {
    const res = await fetchFn(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['INCR', key], ['EXPIRE', key, String(ttl), 'NX']]),
    });
    if (!res.ok) throw new Error(`Upstash ${res.status}`);
    const out = (await res.json()) as { result: number }[];
    return Number(out[0].result);
  };
}

export function defaultCounter(): Counter {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return memoryCounter;
  const remote = upstashCounter(url, token);
  return async (k, t) => { try { return await remote(k, t); } catch { return memoryCounter(k, t); } };
}

export function limitsFromEnv(env = process.env): LimitConfig {
  const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : d);
  return { perIpPerHour: num(env.PER_IP_PER_HOUR, DEFAULT_LIMITS.perIpPerHour), dailyCap: num(env.DAILY_QUESTION_CAP, DEFAULT_LIMITS.dailyCap), maxQuestionChars: DEFAULT_LIMITS.maxQuestionChars };
}

/** Count this request against the global daily cap first (it is the spend cap), then the caller's hourly allowance. */
export async function checkLimits(ip: string, counter: Counter, cfg: LimitConfig, now = new Date()): Promise<LimitResult> {
  const day = now.toISOString().slice(0, 10);
  const secsToMidnight = Math.max(60, 86400 - Math.floor((now.getTime() % 86400000) / 1000));
  if ((await counter(`ask:day:${day}`, 86400 + 3600)) > cfg.dailyCap) return { ok: false, reason: 'daily', retryAfterSeconds: secsToMidnight };
  const hour = now.toISOString().slice(0, 13);
  if ((await counter(`ask:ip:${ip}:${hour}`, 3600)) > cfg.perIpPerHour) return { ok: false, reason: 'ip', retryAfterSeconds: 3600 - Math.floor((now.getTime() % 3600000) / 1000) };
  return { ok: true };
}

export type QuestionCheck = { ok: true; question: string } | { ok: false; message: string };
export function validateQuestion(input: unknown, max = DEFAULT_LIMITS.maxQuestionChars): QuestionCheck {
  if (typeof input !== 'string') return { ok: false, message: 'Send a question as text.' };
  const q = input.replace(/\s+/g, ' ').trim();
  if (q.length < 3) return { ok: false, message: 'Type a question first.' };
  if (q.length > max) return { ok: false, message: `Keep the question under ${max} characters (yours is ${q.length}).` };
  return { ok: true, question: q };
}

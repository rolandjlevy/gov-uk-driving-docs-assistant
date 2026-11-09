// Find candidate GOV.UK pages with the public Search API (https://www.gov.uk/api/search.json, no key).
export const TOPIC_QUERIES = [
  'driving licence', 'renew driving licence', 'change driving licence details', 'provisional driving licence',
  'vehicle tax', 'tax a vehicle', 'SORN declare vehicle off road', 'MOT', 'MOT test exemption',
  'penalty points endorsements', 'driving test', 'theory test', 'learn to drive',
  'sell or transfer a vehicle', 'V5C registration certificate', 'DVLA medical conditions driving',
  'speeding fines driving offences', 'driving disqualification', 'number plates',
];

/** Page formats that read as ordinary guidance. News, publications and the like are left out. */
export const ALLOWED_FORMATS = new Set(['guide', 'answer', 'transaction', 'simple_smart_answer', 'detailed_guide']);

export interface Candidate { path: string; title: string; format: string; description: string; queries: string[] }

export function keepResult(r: any): boolean {
  return typeof r?.link === 'string' && r.link.startsWith('/') && !r.link.startsWith('/government/') && ALLOWED_FORMATS.has(r.format);
}

export async function discover(queries: string[], fetchFn: typeof fetch = fetch, perQuery = 20): Promise<Candidate[]> {
  const byPath = new Map<string, Candidate>();
  for (const q of queries) {
    const url = `https://www.gov.uk/api/search.json?q=${encodeURIComponent(q)}&count=${perQuery}`;
    const res = await fetchFn(url, { headers: { accept: 'application/json', 'user-agent': 'driving-docs-assistant (portfolio project)' } });
    if (!res.ok) throw new Error(`GOV.UK search API ${res.status} for "${q}"`);
    const json: any = await res.json();
    for (const r of json.results ?? []) {
      if (!keepResult(r)) continue;
      const existing = byPath.get(r.link);
      if (existing) existing.queries.push(q);
      else byPath.set(r.link, { path: r.link, title: String(r.title ?? r.link), format: r.format, description: String(r.description ?? ''), queries: [q] });
    }
  }
  // Pages found by several queries are the most central to the topic: list them first.
  return [...byPath.values()].sort((a, b) => b.queries.length - a.queries.length || a.path.localeCompare(b.path));
}

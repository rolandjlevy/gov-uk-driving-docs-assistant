// GOV.UK Content API: https://www.gov.uk/api/content/<base path>
// Public, no key. Check the current terms and the Open Government Licence before ingesting at scale.

export interface GovUkPage {
  basePath: string;
  title: string;
  url: string;
  updatedAt: string | null;
  /** HTML sections: one per guide part, or a single section for body-only formats. */
  sections: { title: string | null; html: string }[];
}

const BASE = 'https://www.gov.uk';

export function toPage(basePath: string, json: any): GovUkPage {
  const details = json?.details ?? {};
  const sections: GovUkPage['sections'] = [];

  if (Array.isArray(details.parts)) {
    for (const part of details.parts) {
      if (typeof part?.body === 'string') sections.push({ title: part.title ?? null, html: part.body });
    }
  } else if (typeof details.body === 'string') {
    sections.push({ title: null, html: details.body });
  }

  return {
    basePath,
    title: String(json?.title ?? basePath),
    url: `${BASE}${basePath}`,
    updatedAt: json?.public_updated_at ?? null,
    sections,
  };
}

export async function fetchPage(basePath: string, fetchFn: typeof fetch = fetch): Promise<GovUkPage> {
  const res = await fetchFn(`${BASE}/api/content${basePath}`, {
    headers: { accept: 'application/json', 'user-agent': 'driving-docs-assistant (portfolio project)' },
  });
  if (!res.ok) throw new Error(`GOV.UK content API ${res.status} for ${basePath}`);
  return toPage(basePath, await res.json());
}

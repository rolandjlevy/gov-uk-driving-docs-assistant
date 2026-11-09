// GOV.UK Content API: https://www.gov.uk/api/content/<base path>
// Public, no key. Check the current terms and the Open Government Licence before ingesting at scale.

export interface GovUkPage {
  basePath: string;
  title: string;
  url: string;
  updatedAt: string | null;
  /** HTML sections: one per guide part, or a single section for body-only formats. */
  sections: { title: string | null; html: string }[];
  /** The keys under `details`, so an empty page can say what it had instead. */
  detailKeys: string[];
}

const BASE = 'https://www.gov.uk';

// Keys under `details` that hold settings, links or metadata rather than prose.
const NON_PROSE_KEYS = new Set([
  'start_button_text', 'will_continue_on', 'transaction_start_link', 'external_related_links', 'nation_applicability',
  'metadata', 'image', 'attachments', 'change_history', 'political', 'first_public_at', 'max_cache_time', 'headers',
  'parts', 'body', 'department_analytics_profile', 'downtime', 'language', 'variants', 'start_link_text',
]);

const humanise = (key: string) => key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** A prose field is HTML or plain text, or a list of {content_type, content} variants (prefer the HTML one). */
function proseOf(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() ? value : null;
  if (Array.isArray(value)) {
    const variants = value.filter((v) => v && typeof v === 'object' && typeof (v as any).content === 'string') as { content_type?: string; content: string }[];
    const pick = variants.find((v) => v.content_type === 'text/html') ?? variants[0];
    return pick?.content?.trim() ? pick.content : null;
  }
  return null;
}

const looksLikeProse = (s: string) => /<\w+/.test(s) || s.length > 40;

export function toPage(basePath: string, json: any): GovUkPage {
  const details = json?.details ?? {};
  const sections: GovUkPage['sections'] = [];

  if (Array.isArray(details.parts)) {
    for (const part of details.parts) {
      const body = proseOf(part?.body);
      if (body) sections.push({ title: part.title ?? null, html: body });
    }
  }

  const body = proseOf(details.body);
  if (body) sections.push({ title: null, html: body });

  // Transactions, answers and other formats keep their prose in named fields.
  for (const [key, value] of Object.entries(details)) {
    if (NON_PROSE_KEYS.has(key)) continue;
    const text = proseOf(value);
    if (text && looksLikeProse(text)) sections.push({ title: humanise(key), html: text.includes('<') ? text : `<p>${text}</p>` });
  }

  if (sections.length === 0 && typeof json?.description === 'string' && json.description.trim()) {
    sections.push({ title: 'Summary', html: `<p>${json.description}</p>` });
  }

  return {
    basePath,
    title: String(json?.title ?? basePath),
    url: `${BASE}${basePath}`,
    updatedAt: json?.public_updated_at ?? null,
    sections,
    detailKeys: Object.keys(details),
  };
}

export async function fetchPage(basePath: string, fetchFn: typeof fetch = fetch): Promise<GovUkPage> {
  const res = await fetchFn(`${BASE}/api/content${basePath}`, {
    headers: { accept: 'application/json', 'user-agent': 'driving-docs-assistant (portfolio project)' },
  });
  if (!res.ok) throw new Error(`GOV.UK content API ${res.status} for ${basePath}`);
  return toPage(basePath, await res.json());
}

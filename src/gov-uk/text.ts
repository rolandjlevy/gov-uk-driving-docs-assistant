import type { GovUkPage } from './content-api.js';
import { chunkPage } from '../ingest/chunk.js';

/** A page as readable Markdown, grouped under its headings, for checking facts by eye. */
export function pageToMarkdown(page: GovUkPage): string {
  const byHeading = new Map<string, string[]>();
  for (const c of chunkPage(page)) byHeading.set(c.heading, [...(byHeading.get(c.heading) ?? []), c.text]);
  const body = [...byHeading].map(([h, texts]) => `### ${h}\n\n${texts.join('\n\n')}`).join('\n\n');
  return `## ${page.title}\n\n${page.url}\n\nLast updated: ${page.updatedAt ?? 'unknown'}\n\n${body}`;
}

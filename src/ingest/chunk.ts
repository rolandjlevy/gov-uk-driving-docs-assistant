import * as cheerio from 'cheerio';
import type { GovUkPage } from '../gov-uk/content-api.js';

export interface Chunk {
  url: string;
  pageTitle: string;
  /** Heading trail, e.g. "Renew your licence > Cost". */
  heading: string;
  text: string;
  pageUpdatedAt: string | null;
}

const MAX_CHARS = 1800;

/** Split a page into chunks at h2/h3 headings; long sections are split on paragraph boundaries. */
export function chunkPage(page: GovUkPage): Chunk[] {
  const chunks: Chunk[] = [];

  for (const section of page.sections) {
    const $ = cheerio.load(`<div id="root">${section.html}</div>`);
    const lead = [page.title, section.title].filter(Boolean).join(' > ');
    let heading = lead;
    let buffer: string[] = [];

    const flush = () => {
      const text = buffer.join('\n').trim();
      buffer = [];
      if (!text) return;
      for (const piece of splitLong(text)) {
        chunks.push({ url: page.url, pageTitle: page.title, heading, text: piece, pageUpdatedAt: page.updatedAt });
      }
    };

    $('#root').children().each((_, el) => {
      const tag = (el as any).tagName?.toLowerCase();
      if (tag === 'h2' || tag === 'h3') {
        flush();
        heading = `${lead} > ${$(el).text().trim()}`;
      } else {
        const t = $(el).text().replace(/\s+\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
        if (t) buffer.push(t);
      }
    });
    flush();
  }

  return chunks;
}

function splitLong(text: string): string[] {
  if (text.length <= MAX_CHARS) return [text];
  const out: string[] = [];
  let current = '';
  for (const para of text.split('\n')) {
    if (current && current.length + para.length + 1 > MAX_CHARS) {
      out.push(current);
      current = '';
    }
    current = current ? `${current}\n${para}` : para;
  }
  if (current) out.push(current);
  return out;
}

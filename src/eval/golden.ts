export type QuestionType = 'single_page' | 'multi_page' | 'not_covered' | 'recently_changed';

export interface GoldenQuestion {
  id: string;
  type: QuestionType;
  question: string;
  /** Facts a correct answer must contain, each checkable against the live page. Empty for not_covered. */
  key_facts: string[];
  /** Pages a correct answer should cite. For single_page, any one of them; for multi_page, all of them. */
  expected_urls: string[];
  /** For not_covered: the nearest page the agent may point to, if any. */
  closest_urls?: string[];
  /** ISO date you last checked every fact against the live pages. Null until you have. */
  checked_on: string | null;
  notes?: string;
}

export const TARGET_COUNTS: Record<QuestionType, number> = { single_page: 24, multi_page: 6, not_covered: 5, recently_changed: 5 };

export interface GoldenReport { errors: string[]; warnings: string[]; counts: Record<QuestionType, number>; unchecked: number; total: number }

const BASE = 'https://www.gov.uk';

/** Validate the golden set. `slicePaths` are base paths like "/vehicle-tax"; cited pages must be in the slice. */
export function validateGolden(questions: GoldenQuestion[], slicePaths: string[]): GoldenReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const inSlice = new Set(slicePaths.map((p) => BASE + p));
  const counts: Record<QuestionType, number> = { single_page: 0, multi_page: 0, not_covered: 0, recently_changed: 0 };
  const ids = new Set<string>();
  let unchecked = 0;

  for (const q of questions) {
    const where = q.id || '(no id)';
    if (!q.id) errors.push('A question has no id');
    else if (ids.has(q.id)) errors.push(`${where}: duplicate id`);
    ids.add(q.id);

    if (!(q.type in counts)) { errors.push(`${where}: unknown type "${q.type}"`); continue; }
    counts[q.type]++;

    if (!q.question?.trim()) errors.push(`${where}: empty question`);
    if (q.question && q.question.length > 500) errors.push(`${where}: question is over the 500-character input cap`);

    for (const u of [...(q.expected_urls ?? []), ...(q.closest_urls ?? [])]) {
      if (!inSlice.has(u)) errors.push(`${where}: ${u} is not in data/slice.json`);
    }

    if (q.type === 'not_covered') {
      if (q.expected_urls?.length) errors.push(`${where}: not_covered questions must have no expected_urls`);
    } else {
      if (!q.expected_urls?.length) errors.push(`${where}: needs at least one expected URL`);
      if (!q.key_facts?.length) warnings.push(`${where}: no key facts yet`);
      if (q.type === 'multi_page' && (q.expected_urls?.length ?? 0) < 2) errors.push(`${where}: multi_page needs two or more expected URLs`);
      if (q.type === 'single_page' && (q.expected_urls?.length ?? 0) < 1) errors.push(`${where}: single_page needs an expected URL`);
    }

    if (!q.checked_on) unchecked++;
    else if (Number.isNaN(Date.parse(q.checked_on))) errors.push(`${where}: checked_on is not a date`);
  }

  for (const t of Object.keys(TARGET_COUNTS) as QuestionType[]) {
    if (counts[t] !== TARGET_COUNTS[t]) warnings.push(`${t}: ${counts[t]} of ${TARGET_COUNTS[t]} planned`);
  }
  return { errors, warnings, counts, unchecked, total: questions.length };
}

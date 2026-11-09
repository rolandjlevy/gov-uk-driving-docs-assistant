# GOV.UK driving docs assistant

An agent that answers UK driving questions from GOV.UK pages, cites the exact page behind every answer, says so when the pages don't cover a question, and is scored automatically against a hand-checked golden set.

**Unofficial.** Not affiliated with GOV.UK or the DVLA, and not legal advice. GOV.UK content is used under the Open Government Licence: check the current licence page and add the attribution it asks for before publishing.

The app is the demo; the Evals page is the point. The full plan is in the project spec (stages below).

## Status

| Stage | What | State |
| --- | --- | --- |
| 1 | Pre-check: does the model already know this slice? | Scripts ready, needs your API key and hand-marking |
| 2 | Ingest: fetch, chunk, embed, store in pgvector | Code written and unit-tested; not yet run against GOV.UK, Voyage or Neon |
| 3 | Golden set (40 questions) | Not started |
| 4 | Baselines and eval harness | Not started |
| 5 | Agent loop (`search_docs`, `read_page`) | Not started |
| 6 | Tracing and cost | Not started |
| 7 | Experiments | Not started |
| 8 | Public app and Evals page | Not started |
| 9 | Case study | Not started |

## Setup

```bash
npm install
cp .env.example .env   # add ANTHROPIC_API_KEY; set a monthly spend limit in the Anthropic console first
npm test
```

## Stage 1: pre-check

1. `npm run slice:check` fetches each path in `data/slice.json` from the GOV.UK Content API and reports 404s or pages with no text. The paths are an unverified seed: fix them, and choose your final slice.
2. Edit `evals/precheck.questions.json` so the 15 questions suit the slice. Prefer rules that change.
3. `npm run precheck` asks the model each question with no search and writes `evals/precheck.answers.json`.
4. Check each answer against the live GOV.UK page and set `correct` to `true` or `false`.
5. If more than about 90% are correct, the area is too well known for retrieval to show a gain: pick newer or faster-changing sections.

Note: the GOV.UK Content API needs normal internet access, so run `slice:check` on your own machine.

## Stage 2: ingest

Needs `GOV_UK_DB_URL` (Neon, with the pgvector extension enabled) and `VOYAGE_API_KEY` in `.env`.

```bash
npm run ingest -- --dry-run   # fetch and chunk only: check page and chunk counts first
npm run ingest                # embed with Voyage and store in Neon (safe to re-run: each page is replaced)
npm run search -- "how do I change the address on my driving licence"
```

Done when plain questions return the right page in the top 3 results. The vector size is taken from the first embedding, so changing the embedding model means dropping the `chunks` table and re-ingesting.

## Layout

```
src/gov-uk/content-api.ts   fetch a page from the Content API, normalise to sections
src/ingest/chunk.ts         split by heading, keep a heading trail
src/ingest/ingest.ts        fetch, chunk, embed, store (one transaction per page)
src/embed/voyage.ts         Voyage embeddings with batching and retry
src/db/db.ts                Neon connection and schema
src/search/search.ts        vector search over the chunks
scripts/slice-check.ts      verify the slice paths
scripts/ingest.ts           stage 2 ingest
scripts/search.ts           try a question against the index
scripts/precheck.ts         stage 1 pre-check
data/slice.json             the pages in scope
evals/                      pre-check questions now; the golden set from stage 3
```

## Open decisions

- Embedding model and provider (Anthropic doesn't offer embeddings).
- Licence for this repo.
- Whether visitor questions are logged.

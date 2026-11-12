# GOV.UK driving docs assistant

An agent that answers UK driving questions from GOV.UK pages, cites the exact page behind every answer, says so when the pages don't cover a question, and is scored automatically against a hand-checked golden set.

**Unofficial.** Not affiliated with GOV.UK or the DVLA, and not legal advice. GOV.UK content is used under the Open Government Licence: check the current licence page and add the attribution it asks for before publishing.

The app is the demo; the Evals page is the point. The full plan is in the project spec (stages below).

View the [live demo](https://gov-uk-driving-docs-assistant.vercel.app)

## Status

| Stage | What | State |
| --- | --- | --- |
| 1 | Pre-check: does the model already know this slice? | Scripts ready, needs your API key and hand-marking |
| 2 | Ingest: fetch, chunk, embed, store in pgvector | Done: 70 pages, 797 chunks in Neon |
| 3 | Golden set (40 questions) | 35 questions drafted; facts and 5 recently-changed questions still to write |
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

## Stage 3: golden set

`evals/golden.json` holds the questions: type, question, key facts a correct answer must contain, the page(s) it should cite, and the date you checked it.

```bash
npm run golden:pages            # writes evals/golden.sources.md: live text of every cited page
npm run golden:pages -- --recent # slice pages by last-updated date, to pick "recently changed" questions
npm run golden:check            # validate the file: schema, pages in the slice, counts by type
```

Write each `key_facts` entry from the live page, not from memory, then set `checked_on`. Re-check the set when you re-ingest, because GOV.UK changes.

## Stage 4: baselines and eval harness

Two baselines run over the golden set and are scored the same way:

```bash
npm run eval -- --system=model-alone    # no search
npm run eval -- --system=one-search     # embed the question once, top 5 chunks, answer from them
npm run eval -- --system=agent         # stage 5: Claude searches and reads pages itself (max 4 searches)
# options: --ids=g01,g02  --type=single_page  --judge-model=<model>
```

Each run saves `evals/runs/<system>-<time>.json` with per-question answers, scores, tokens and time, plus a summary overall and by question type.

Scores: retrieval (expected pages among the retrieved), citation validity (cited URLs were really retrieved), fact score (an LLM judge checks each `key_facts` entry), refusal (the status field: declines the not-covered questions, does not decline the rest) and, for not-covered questions, a judged `declinedJudged` (the answer does not invent the thing asked, even if it explains related guidance), tokens and time. Cost is left as tokens; multiply by the current price list when writing up. Run it only after the facts are hand-checked, or the fact score is meaningless.

## Stage 5: the agent

`src/agent/agent.ts`. Claude gets three tools: `search_docs`, `read_page` (the full page from the database) and `finish` (answered or not_covered, with source URLs). Code enforces what the model can't be trusted with: at most 4 searches, every tool call answered in one message, cited URLs must have been retrieved (invented ones are dropped and reported), and an answer with no valid citation is turned into a refusal. Each run's trace (tools called, pages seen) is saved with the answer in `evals/runs/`.

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
scripts/golden-*.ts         check the golden set and dump the pages it cites
src/eval/golden.ts          golden set schema and validation
scripts/precheck.ts         stage 1 pre-check
data/slice.json             the pages in scope
evals/                      pre-check questions now; the golden set from stage 3
```

## Open decisions

- Embedding model and provider (Anthropic doesn't offer embeddings).
- Licence for this repo.
- Whether visitor questions are logged.

## Stage 8: the public app

`npm run dev` serves the question box (`/`) and the Evals page (`/evals`). `POST /api/ask` runs the stage 5 agent.

- Limits (`src/limits.ts`): questions are capped at 500 characters, each visitor gets `PER_IP_PER_HOUR` questions an hour, and all visitors share `DAILY_QUESTION_CAP` a day. The daily cap is the spending cap. Counts live in Upstash Redis when its env vars are set, otherwise in memory (per instance). Also set a monthly spend limit in the Anthropic console.
- Visitor questions are not logged or stored.
- The Evals page reads `data/evals.json`, built from the saved runs by `npm run evals:data` (latest full run per system and judge). Rebuild it and commit it after any new eval run.
- Next 16 runs with `--webpack` here because the source uses `.js` import specifiers for `.ts` files, which Turbopack does not map.
- Deploy: import the repo into Vercel, set `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `GOV_UK_DB_URL` (and the Upstash vars), and set the build command to `npm run web:build`.

Unofficial and not GOV.UK. Page text is from GOV.UK under the Open Government Licence v3.0. Code is MIT.

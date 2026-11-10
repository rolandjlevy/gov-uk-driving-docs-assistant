import fs from 'node:fs';
import path from 'node:path';

export const metadata = { title: 'Evals · GOV.UK driving docs assistant' };

const SYS = [
  ['model-alone', 'Model alone', 'No search. Answers from memory.'],
  ['one-search', 'One search', 'Embeds the question once, reads the top 5 passages.'],
  ['agent', 'Agent', 'Searches up to 4 times, can read whole pages, cites what it retrieved.'],
] as const;
const TYPES = ['single_page', 'multi_page', 'not_covered', 'recently_changed'];
const pct = (n: unknown) => (typeof n === 'number' ? n.toFixed(2) : '–');
const secs = (n: unknown) => (typeof n === 'number' ? (n / 1000).toFixed(1) + 's' : '–');
const num = (n: unknown) => (typeof n === 'number' ? n.toLocaleString('en-GB') : '–');

export default function Evals() {
  const file = path.join(process.cwd(), 'data', 'evals.json');
  if (!fs.existsSync(file)) return <p>No eval data yet. Run <code>npm run evals:data</code>.</p>;
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const head = d.headlineJudge as string;
  const other = (d.judges as string[]).filter((j) => j !== head);
  const get = (s: string, j: string) => d.bySystem?.[s]?.[j]?.summary;

  const best = (key: string, lower = false) => {
    const vals = SYS.map(([s]) => get(s, head)?.all?.[key]).filter((v) => typeof v === 'number') as number[];
    return vals.length ? (lower ? Math.min(...vals) : Math.max(...vals)) : null;
  };
  const cell = (s: string, key: string, fmt = pct, lower = false) => {
    const v = get(s, head)?.all?.[key];
    return <td className={v !== undefined && v === best(key, lower) ? 'best' : ''}>{fmt(v)}</td>;
  };
  const failures = (d.agentFailures as string[]).map((id) => d.questions.find((q: any) => q.id === id)).filter(Boolean);

  return (
    <>
      <h1>Evals</h1>
      <p>Each system answers the same 40 hand-written questions. Code scores the citations and refusals, and a language-model judge checks the answer against the key facts a correct answer must state. Answers are judged by <code>{head}</code>.</p>

      <h2>Three systems, 40 questions</h2>
      <table>
        <thead><tr><th></th>{SYS.map(([, l]) => <th key={l}>{l}</th>)}</tr></thead>
        <tbody>
          <tr><td>Key facts stated (0–1)</td>{SYS.map(([s]) => cell(s, 'facts'))}</tr>
          <tr><td>Right page retrieved</td>{SYS.map(([s]) => cell(s, 'retrieval'))}</tr>
          <tr><td>Cited pages were retrieved</td>{SYS.map(([s]) => cell(s, 'citationValid'))}</tr>
          <tr><td>Answered vs refused correctly</td>{SYS.map(([s]) => cell(s, 'refusalCorrect'))}</tr>
          <tr><td>Not-covered declined properly (judged)</td>{SYS.map(([s]) => cell(s, 'declinedJudged'))}</tr>
          <tr><td>Mean time per question</td>{SYS.map(([s]) => cell(s, 'meanMs', secs, true))}</tr>
          <tr><td>Input tokens, all 40</td>{SYS.map(([s]) => cell(s, 'inputTokens', num, true))}</tr>
          <tr><td>Output tokens, all 40</td>{SYS.map(([s]) => cell(s, 'outputTokens', num, true))}</tr>
        </tbody>
      </table>
      <p className="muted">{SYS.map(([, l, desc]) => `${l}: ${desc}`).join(' ')} Bold is the best value in the row. Cost is shown as tokens, not pounds, because prices change.</p>

      {other.length > 0 && (
        <>
          <h2>Does the judge matter?</h2>
          <table>
            <thead><tr><th>Key facts stated</th>{SYS.map(([, l]) => <th key={l}>{l}</th>)}</tr></thead>
            <tbody>{[head, ...other].map((j) => <tr key={j}><td>{j}{j === head ? ' (headline)' : ''}</td>{SYS.map(([s]) => <td key={s}>{pct(get(s, j)?.all?.facts)}</td>)}</tr>)}</tbody>
          </table>
        </>
      )}

      <h2>By question type</h2>
      <table>
        <thead><tr><th>Key facts / refusals right</th>{SYS.map(([, l]) => <th key={l}>{l}</th>)}</tr></thead>
        <tbody>{TYPES.map((t) => (
          <tr key={t}><td>{t.replace('_', ' ')} ({get('agent', head)?.byType?.[t]?.n ?? '–'})</td>
            {SYS.map(([s]) => { const b = get(s, head)?.byType?.[t]; return <td key={s}>{t === 'not_covered' ? pct(b?.refusalCorrect) : pct(b?.facts)}</td>; })}</tr>
        ))}</tbody>
      </table>

      <h2>Where the agent still fails</h2>
      {failures.length === 0 && <p>No question fell below the failure threshold in this run.</p>}
      {failures.map((q: any) => (
        <details key={q.id}><summary><strong>{q.id}</strong> · {q.question}</summary>
          {SYS.map(([s, l]) => q[s] && <p key={s}><strong>{l}</strong> ({q[s].status}, facts {pct(q[s].facts)}):<br />{q[s].answer}</p>)}
        </details>
      ))}

      <h2>Every question</h2>
      <details><summary>Show all 40 rows</summary>
        <table><thead><tr><th>Question</th>{SYS.map(([, l]) => <th key={l}>{l}</th>)}</tr></thead>
          <tbody>{d.questions.map((q: any) => <tr key={q.id}><td>{q.id} · {q.question}</td>{SYS.map(([s]) => <td key={s}>{q[s]?.status === 'not_covered' ? 'refused' : pct(q[s]?.facts)}</td>)}</tr>)}</tbody></table>
      </details>

      <h2>What these numbers do not show</h2>
      <ul className="cav">
        <li>One run per system. Language-model answers vary, so small gaps are not proof.</li>
        <li>40 questions written by one person, so this is a demo-sized test, not a benchmark.</li>
        <li>The key facts were drafted by Claude from the GOV.UK page text. I hand-checked 10 of the 40 questions against the live pages and found no errors; the rest are not hand-checked.</li>
        <li>Some facts were loosened or split after I saw early results, under one rule: only what a correct answer must say, one claim per fact. That makes the later scores less independent than a test fixed in advance.</li>
        <li>The judge is from the same model family as the answerers. I ran a second judge to see whether it changed the picture.</li>
        <li>The agent is close to the ceiling of this question set, so the set cannot separate it from a better system. A high score is not a claim that it is nearly perfect.</li>
      </ul>
      {d.goldenNote && <p className="muted">Golden set note: {d.goldenNote}</p>}
    </>
  );
}

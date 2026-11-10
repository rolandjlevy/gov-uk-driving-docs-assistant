'use client';
import { useState } from 'react';

type Source = { url: string; title: string };
type Reply = { status: 'answered' | 'not_covered'; answer: string; sources: Source[] } | { error: string };

const EXAMPLES = [
  'How much is the vehicle tax for a petrol car?',
  'Do I need to tell DVLA when I sell my car?',
  'How many theory test questions are there?',
  'Can I drive in France on a UK licence?',
  'Which MOT garage is cheapest near Leicester?',
];

export default function Home() {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<Reply | null>(null);

  async function ask(text: string) {
    if (busy) return;
    setBusy(true); setReply(null);
    try {
      const res = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: text }) });
      setReply(await res.json());
    } catch { setReply({ error: 'Could not reach the server. Try again.' }); }
    setBusy(false);
  }

  return (
    <>
      <h1>Ask about UK driving</h1>
      <p className="muted">Answers come only from GOV.UK driving and vehicle pages, with the page cited. If the pages do not cover it, it says so.</p>
      <form onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <label htmlFor="q">Your question</label>
        <textarea id="q" value={q} maxLength={500} onChange={(e) => setQ(e.target.value)} />
        <button disabled={busy || q.trim().length < 3}>{busy ? 'Searching GOV.UK…' : 'Ask'}</button>
      </form>
      <div className="chips">{EXAMPLES.map((e) => <button key={e} type="button" onClick={() => { setQ(e); ask(e); }}>{e}</button>)}</div>
      {reply && 'error' in reply && <div className="card err">{reply.error}</div>}
      {reply && 'status' in reply && (
        <div className={'card' + (reply.status === 'not_covered' ? ' nc' : '')}>
          {reply.status === 'not_covered' && <strong>Not covered by the GOV.UK pages I can search.{'\n'}</strong>}
          {reply.answer}
          {reply.sources.length > 0 && (
            <div className="sources"><strong>Sources</strong><ul>{reply.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}</ul></div>
          )}
        </div>
      )}
    </>
  );
}

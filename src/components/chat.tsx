'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';

export interface Msg { role: 'user' | 'assistant'; content: string; error?: boolean }

/** Minimal safe markdown: paragraphs, bullet/numbered lists, **bold** and `code`. No raw HTML is ever injected. */
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g).map((p, i) =>
    p.startsWith('**') && p.endsWith('**') && p.length > 4 ? <b key={i}>{p.slice(2, -2)}</b>
      : p.startsWith('*') && p.endsWith('*') && p.length > 2 ? <i key={i}>{p.slice(1, -1)}</i>
        : p.startsWith('`') && p.endsWith('`') ? <code key={i} className="mono">{p.slice(1, -1)}</code> : <Fragment key={i}>{p}</Fragment>);
}
export function Md({ text }: { text: string }) {
  const blocks: React.ReactNode[] = []; let list: string[] = []; let ordered = false;
  const flush = () => { if (list.length) { const items = list.map((l, i) => <li key={i}>{inline(l)}</li>); blocks.push(ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>); list = []; } };
  for (const line of text.split('\n')) {
    const b = line.match(/^\s*[-*]\s+(.*)/), n = line.match(/^\s*\d+[.)]\s+(.*)/);
    if (b || n) { const o = !!n; if (list.length && o !== ordered) flush(); ordered = o; list.push((b ?? n)![1]); continue; }
    flush();
    if (line.trim()) blocks.push(<p key={blocks.length}>{inline(line.replace(/^#+\s*/, ''))}</p>);
  }
  flush();
  return <>{blocks}</>;
}

export function Bubbles({ msgs, busy }: { msgs: Msg[]; busy: boolean }) {
  return (
    <>
      {msgs.map((m, i) => (
        <div key={i} className={`bubble ${m.role} ${m.error ? 'err' : ''}`}>
          {m.role === 'assistant' && !m.content && busy ? <span className="typing" aria-label="Assistant is typing"><i /><i /><i /></span> : m.role === 'assistant' ? <Md text={m.content} /> : <p>{m.content}</p>}
        </div>
      ))}
    </>
  );
}

/** Streaming chat against /api/chat. State lives in the caller's tree, so the floating widget keeps its history across pages. */
export function useChat(pipeline: string, useLive: boolean) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const send = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    const next: Msg[] = [...msgs.filter((m) => !m.error), { role: 'user', content: t }];
    setMsgs([...next, { role: 'assistant', content: '' }]); setBusy(true);
    const ctrl = new AbortController(); abort.current = ctrl;
    const patch = (fn: (m: Msg) => Msg) => setMsgs((cur) => cur.map((m, i) => (i === cur.length - 1 ? fn(m) : m)));
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: next, pipeline: useLive ? pipeline : undefined }), signal: ctrl.signal });
      if (!res.ok || !res.body) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? `Request failed (${res.status})`); }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop() ?? '';
        for (const l of lines) {
          if (!l.startsWith('data:')) continue;
          const d = l.slice(5).trim(); if (!d || d === '[DONE]') continue;
          try { const delta = JSON.parse(d).choices?.[0]?.delta?.content; if (delta) patch((m) => ({ ...m, content: m.content + delta })); } catch { /* partial chunk */ }
        }
      }
      patch((m) => (m.content ? m : { ...m, content: 'No answer was returned. Please try again.', error: true }));
    } catch (e) {
      if ((e as Error).name === 'AbortError') patch((m) => (m.content ? m : { ...m, content: 'Stopped.', error: true }));
      else patch((m) => ({ ...m, content: (e as Error).message, error: true }));
    } finally { setBusy(false); abort.current = null; }
  }, [busy, msgs, pipeline, useLive]);

  return { msgs, busy, send, stop: () => abort.current?.abort(), clear: () => setMsgs([]) };
}

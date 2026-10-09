'use client';

import { useEffect, useRef, useState } from 'react';
import { Bubbles, useChat } from '@/components/chat';
import { useApp } from '@/components/provider';
import { Card, Icon } from '@/components/ui';
import { KNOWLEDGE } from '@/lib/knowledge';

export default function Assistant() {
  const { selected, state } = useApp();
  const [input, setInput] = useState('');
  const [useLive, setUseLive] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const { msgs, busy, send, stop, clear } = useChat(selected, useLive);
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const status = state?.pipelines.find((p) => p.cfg.id === selected)?.analysis?.status;

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs]);
  const submit = (t: string) => { if (!t.trim() || busy) return; send(t); setInput(''); box.current?.focus(); };

  const suggestions = [
    `Why is ${selected}${status && status !== 'Healthy' ? ` ${status.toLowerCase()}` : ''} right now?`,
    'How can I tell a leak from a blockage?',
    'What does BIS IS 10500 say about pH and turbidity?',
    'What can cause a sudden turbidity increase?',
  ];

  return (
    <div className="grid g-main" style={{ alignItems: 'start' }}>
      <Card title="Water & pipeline assistant" right={<label className="small muted row" style={{ gap: 6 }}><input type="checkbox" checked={useLive} onChange={(e) => setUseLive(e.target.checked)} />Use live data for {selected}</label>} bodyClass="chat">
        <div className="chat-log" role="log" aria-live="polite">
          {msgs.length === 0 && (
            <div className="chat-empty">
              <Icon name="chat" size={28} />
              <h3>Ask about your water network</h3>
              <p className="muted">Questions about water quality, leaks, pressure, sensors, standards, or what this app is telling you. It sees the live readings for the selected pipeline.</p>
              <div className="row" style={{ justifyContent: 'center' }}>{suggestions.map((s) => <button key={s} className="btn sm" onClick={() => submit(s)}>{s}</button>)}</div>
            </div>
          )}
          <Bubbles msgs={msgs} busy={busy} />
          <div ref={end} />
        </div>
        <form className="chat-form" onSubmit={(e) => { e.preventDefault(); submit(input); }}>
          <label htmlFor="chat-in" className="sr-only">Message</label>
          <textarea id="chat-in" ref={box} className="field" rows={2} maxLength={2000} value={input} placeholder="Ask about pH, turbidity, leaks, sensors, standards…" onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(input); } }} />
          <div className="stack" style={{ gap: 6 }}>
            {busy ? <button type="button" className="btn danger" onClick={stop}>Stop</button> : <button type="submit" className="btn primary" disabled={!input.trim()}>Send</button>}
            <button type="button" className="btn sm" disabled={busy || !msgs.length} onClick={clear}>Clear</button>
          </div>
        </form>
        <p className="small muted chat-note">Answers are AI generated and limited to water and pipeline topics. Verify limits against the current official standard and confirm field issues on site.</p>
      </Card>

      <Card title="Research library" bodyClass="">
        <div className="lib">
          {KNOWLEDGE.map((t) => (
            <div key={t.id} className="lib-item">
              <button className="lib-h" aria-expanded={open === t.id} onClick={() => setOpen(open === t.id ? null : t.id)}>
                <b>{t.title}</b><span className="muted small">{t.summary}</span>
              </button>
              {open === t.id && (
                <div className="lib-b">
                  <ul>{t.points.map((p, i) => <li key={i}>{p}</li>)}</ul>
                  <div className="small muted">Sources: {t.sources.join('; ')}</div>
                  <button className="btn sm" style={{ marginTop: 8 }} onClick={() => { setInput(t.ask); box.current?.focus(); }}>Ask the assistant about this</button>
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="small muted" style={{ padding: '0 14px 14px', margin: 0 }}>Reference notes summarise published guidance. Check the cited standard for the current official limits.</p>
      </Card>
    </div>
  );
}

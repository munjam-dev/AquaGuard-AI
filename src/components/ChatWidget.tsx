'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Bubbles, useChat } from './chat';
import { useApp } from './provider';
import { Icon } from './ui';

const QUICK = ['Why is my pipeline flagged?', 'Leak or blockage?', 'What is a safe turbidity level?'];

/** Floating assistant available on every page. Hidden on /assistant, which already is the full chat. */
export function ChatWidget() {
  const path = usePathname();
  const { selected } = useApp();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const { msgs, busy, send, stop, clear } = useChat(selected, true);
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (open) { box.current?.focus(); } }, [open]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (path === '/assistant') return null;
  const submit = (t: string) => { if (!t.trim()) return; send(t); setInput(''); };

  return (
    <>
      {open && (
        <section className="cw-panel" role="dialog" aria-label="AquaGuard AI assistant">
          <header className="cw-head">
            <span className="cw-title"><Icon name="chat" size={18} /> AI Assistant</span>
            <span style={{ flex: 1 }} />
            <Link href="/assistant" className="btn sm" onClick={() => setOpen(false)}>Full view</Link>
            {msgs.length > 0 && <button className="btn sm" onClick={clear} disabled={busy}>Clear</button>}
            <button className="btn sm" onClick={() => setOpen(false)} aria-label="Close assistant">Close</button>
          </header>
          <div className="cw-log" role="log" aria-live="polite">
            {msgs.length === 0 && (
              <div className="chat-empty" style={{ margin: 'auto 0' }}>
                <p className="muted">Ask about water quality, leaks, pressure, sensors or standards. I can see the live readings for the selected pipeline.</p>
                <div className="row" style={{ justifyContent: 'center' }}>{QUICK.map((q) => <button key={q} className="btn sm" onClick={() => submit(q)}>{q}</button>)}</div>
              </div>
            )}
            <Bubbles msgs={msgs} busy={busy} />
            <div ref={end} />
          </div>
          <form className="cw-form" onSubmit={(e) => { e.preventDefault(); submit(input); }}>
            <label htmlFor="cw-in" className="sr-only">Message</label>
            <textarea id="cw-in" ref={box} className="field" rows={1} maxLength={2000} value={input} placeholder="Ask about your network…" onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(input); } }} />
            {busy ? <button type="button" className="btn danger" onClick={stop}>Stop</button> : <button type="submit" className="btn primary" disabled={!input.trim()}>Send</button>}
          </form>
          <p className="small muted cw-note">Using live data for {selected}. AI generated: verify limits against the official standard.</p>
        </section>
      )}
      <button className={`cw-fab ${open ? 'open' : ''}`} onClick={() => setOpen((o) => !o)} aria-label={open ? 'Close AI assistant' : 'Open AI assistant'} aria-expanded={open}>
        <Icon name={open ? 'close' : 'chat'} size={26} />
        {!open && msgs.length === 0 && <span className="cw-tip">Ask AI</span>}
      </button>
    </>
  );
}

'use client';

import type { Anomaly } from '@/engine/types';
import { sevLabel, sevTone, type Tone } from '@/lib/format';

const ICONS: Record<string, string> = {
  dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  leak: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  bell: 'M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7zM10 20a2 2 0 0 0 4 0',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2',
  insight: 'M4 19V9M10 19V5M16 19v-8M22 19H2M19 8l-3 3',
  gauge: 'M4 18a9 9 0 1 1 16 0M12 13l4-5',
  sim: 'M8 5v14l11-7z',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9c.6.5 1.3.9 2 1.2l.4 2.6h4l.4-2.6c.7-.3 1.4-.7 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  wrench: 'M14.7 6.3a4 4 0 0 0-5 5L3 18l3 3 6.7-6.7a4 4 0 0 0 5-5l-2.4 2.4-2.6-.6-.6-2.6z',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12zM8.5 11h7M8.5 14h4',
  sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  stop: 'M6 6h12v12H6z',
  close: 'M6 6l12 12M18 6 6 18',
};
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name] ?? ICONS.dashboard} />
    </svg>
  );
}

export function Pill({ tone, children }: { tone: Tone | 'neutral'; children: React.ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

export function Card({ title, right, children, flag, bodyClass = 'card-b' }: { title?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; flag?: Tone; bodyClass?: string }) {
  return (
    <section className={`card ${flag ? 'flag-' + flag : ''}`}>
      {title !== undefined && (
        <div className="card-h"><h3>{title}</h3>{right !== undefined && <div className="right">{right}</div>}</div>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function Kpi({ label, value, unit, sub, tone }: { label: string; value: React.ReactNode; unit?: string; sub?: React.ReactNode; tone?: Tone }) {
  return (
    <div className="kpi">
      <span className="lbl">{label}</span>
      <span className="val" style={tone ? { color: `var(--${tone})` } : undefined}>{value}{unit && <small>{unit}</small>}</span>
      {sub !== undefined && <span className="sub">{sub}</span>}
    </div>
  );
}

export function Bar({ value, tone }: { value: number; tone: Tone }) {
  return <div className="bar" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} className={tone} /><style>{`.bar.${tone}{}`}</style></div>;
}
export function ToneBar({ value, tone }: { value: number; tone: Tone }) {
  return <div className={`bar ${tone}`}><i style={{ width: `${Math.max(2, Math.min(100, value))}%` }} /></div>;
}

/** Renders AI detections with probability, confidence and the evidence behind them (explainable AI). */
export function Finding({ a }: { a: Anomaly }) {
  const tone = sevTone(a.severity);
  const hedge = a.confidence >= 85 ? 'High confidence' : a.confidence >= 65 ? 'Moderate confidence' : 'Low confidence';
  return (
    <div className={`finding ${tone}`}>
      <h4><Pill tone={tone}>{sevLabel(a.severity)}</Pill>{a.title}</h4>
      <p>{a.summary}</p>
      <ul>{a.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
      <div className="meta"><span>Probability: {a.probability}%</span><span>Confidence: {a.confidence}% ({hedge})</span></div>
    </div>
  );
}

export function PageTitle({ children }: { children: React.ReactNode }) { return <h2 style={{ fontSize: 15 }}>{children}</h2>; }

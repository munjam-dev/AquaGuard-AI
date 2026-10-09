'use client';

import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtDate, fmtDateTime, fmtTime } from '@/lib/format';
import type { SeriesPoint } from '@/lib/types';
import { useApi, useApp } from './provider';
import { Card } from './ui';

export const RANGES = ['1h', '6h', '24h', '7d', '30d', 'custom'] as const;
export type Range = (typeof RANGES)[number];

export interface LineDef { key: string; name: string; color: string; dash?: string }
export interface RefDef { y: number; label: string; color?: string }

export function TimeChart({ title, data, lines, refs = [], unit, domain, height = 190, span }: {
  title: string; data: SeriesPoint[]; lines: LineDef[]; refs?: RefDef[]; unit?: string; domain?: [number | 'auto' | 'dataMin' | 'dataMax', number | 'auto' | 'dataMin' | 'dataMax']; height?: number; span: number;
}) {
  const tick = (v: number) => (span > 36 * 3600e3 ? fmtDate(v) : fmtTime(v));
  const last = data[data.length - 1];
  return (
    <Card title={title} right={last && <span className="mono small muted">{lines.map((l) => (last[l.key] !== null && last[l.key] !== undefined ? Number(last[l.key]).toFixed(2) : '—')).join(' / ')}{unit ? ` ${unit}` : ''}</span>} bodyClass="chart-wrap">
      <div className="chart-cap">{lines.map((l) => <span key={l.key}><i style={{ background: l.color }} />{l.name}</span>)}</div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={tick} tickLine={false} axisLine={false} minTickGap={42} />
            <YAxis domain={domain ?? ['auto', 'auto']} tickLine={false} axisLine={false} width={46} tickFormatter={(v: number) => String(Number(v.toFixed(Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 20 ? 1 : 2)))} />
            <Tooltip
              labelFormatter={(v) => fmtDateTime(Number(v))}
              formatter={(v, n) => [typeof v === 'number' ? v.toFixed(2) : String(v ?? '—'), n as string]}
              contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, color: 'var(--text)' }}
              labelStyle={{ color: 'var(--muted)' }}
            />
            {refs.map((r) => <ReferenceLine key={r.label + r.y} y={r.y} stroke={r.color ?? 'var(--warn)'} strokeDasharray="4 4" label={{ value: r.label, fontSize: 10, fill: 'var(--muted)', position: 'insideTopRight' }} />)}
            {lines.map((l) => <Line key={l.key} dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={1.8} strokeDasharray={l.dash} dot={false} isAnimationActive={false} connectNulls={false} />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export function RangeTabs({ range, setRange, custom, setCustom }: {
  range: Range; setRange: (r: Range) => void; custom: { from: string; to: string }; setCustom: (c: { from: string; to: string }) => void;
}) {
  return (
    <div className="row">
      <div className="seg" role="tablist" aria-label="Time range">
        {RANGES.map((r) => <button key={r} role="tab" aria-selected={range === r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>{r === 'custom' ? 'Custom' : r}</button>)}
      </div>
      {range === 'custom' && (
        <>
          <input type="datetime-local" className="field" aria-label="From" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
          <input type="datetime-local" className="field" aria-label="To" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
        </>
      )}
    </div>
  );
}

/** Shared range state + series fetch for the chart panels. */
export function useSeries(pipeline: string, range: Range, custom: { from: string; to: string }) {
  const { state } = useApp();
  const q = useMemo(() => {
    const p = new URLSearchParams({ pipeline, range });
    if (range === 'custom') {
      const f = Date.parse(custom.from), t = Date.parse(custom.to);
      if (!Number.isNaN(f)) p.set('from', String(f));
      if (!Number.isNaN(t)) p.set('to', String(t));
    }
    return p.toString();
  }, [pipeline, range, custom]);
  // fast ranges follow the live clock; long ranges refresh less often
  const key = range === '1h' || range === '6h' ? state?.clock : state ? Math.floor(state.clock / 600000) : 0;
  const r = useApi<{ start: number; end: number; points: SeriesPoint[] }>(`/api/series?${q}`, key);
  return r.data;
}

export function useRangeState() {
  const [range, setRange] = useState<Range>('24h');
  const [custom, setCustom] = useState({ from: '', to: '' });
  return { range, setRange, custom, setCustom };
}

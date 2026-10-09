'use client';

import { useMemo, useState } from 'react';
import { TimeChart } from '@/components/charts';
import { useApi, useApp } from '@/components/provider';
import { Card, Pill } from '@/components/ui';
import { fmtDateTime, sevLabel, sevTone } from '@/lib/format';
import type { SeriesPoint } from '@/lib/types';

interface Hist {
  days: (SeriesPoint & { date: number })[];
  events: { id: number; pipeline_id: string; ts: number; type: string; severity: string; probability: number; confidence: number; explanation: { title: string; summary: string } }[];
  byType: Record<string, number>;
  maintenance: { id: number; pipeline_id: string; ts: number; kind: string; note: string; status: string }[];
  summary: string;
}
const GROUPS: Record<string, string[]> = {
  'Leakage events': ['LEAK'], 'Water-quality deterioration': ['HIGH_PH', 'LOW_PH', 'PH_RAPID_CHANGE', 'HIGH_TURBIDITY', 'TURBIDITY_SPIKE', 'CONTAMINATION'],
  'Sensor failures': ['SENSOR_FAILURE', 'MISSING_DATA'], 'Pipeline stress events': ['STRESS'], 'Pressure / flow': ['PRESSURE_DROP', 'ABNORMAL_FLOW', 'BLOCKAGE'],
};

export default function HistoryPage() {
  const { state } = useApp();
  const [pipe, setPipe] = useState('all');
  const [days, setDays] = useState(30);
  const [filter, setFilter] = useState('All');
  const { data } = useApi<Hist>(`/api/history?pipeline=${pipe}&days=${days}`, Math.floor((state?.clock ?? 0) / 3600000));
  const pts = useMemo(() => (data?.days ?? []).map((d) => ({ ...d, ts: d.date + 12 * 3600000 })), [data]);
  const span = days * 86400000;
  const evs = (data?.events ?? []).filter((e) => filter === 'All' || GROUPS[filter]?.includes(e.type));
  return (
    <>
      <div className="row">
        <select className="field" aria-label="Pipeline" value={pipe} onChange={(e) => setPipe(e.target.value)}><option value="all">All pipelines</option>{state?.pipelines.map((p) => <option key={p.cfg.id} value={p.cfg.id}>{p.cfg.id} — {p.cfg.name}</option>)}</select>
        <div className="seg">{[7, 14, 30].map((d) => <button key={d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{d === 7 ? 'Weekly (7d)' : d === 14 ? '14 days' : 'Monthly (30d)'}</button>)}</div>
      </div>
      <Card title="AI-generated summary" flag="att"><p style={{ margin: 0, fontSize: 15 }}>{data?.summary ?? 'Analysing history…'}</p></Card>
      <div className="grid g3">
        <TimeChart title="Daily turbidity (avg / peak)" unit="NTU" data={pts} span={span} lines={[{ key: 'turb', name: 'Average', color: 'var(--accent)' }, { key: 'turbMax', name: 'Peak', color: 'var(--warn)', dash: '4 3' }]} />
        <TimeChart title="Daily water quality & health" data={pts} span={span} domain={[0, 100]} lines={[{ key: 'quality', name: 'Quality score', color: 'var(--ok)' }, { key: 'health', name: 'Health %', color: 'var(--accent)', dash: '4 3' }]} />
        <TimeChart title="Daily peak leak / stress" unit="%" data={pts} span={span} domain={[0, 100]} lines={[{ key: 'leakMax', name: 'Leak %', color: 'var(--crit)' }, { key: 'stressMax', name: 'Stress %', color: 'var(--att)', dash: '4 3' }]} />
        <TimeChart title="Daily average pH" data={pts} span={span} lines={[{ key: 'ph', name: 'pH', color: 'var(--accent)' }]} />
        <TimeChart title="Daily inlet pressure variance" data={pts} span={span} lines={[{ key: 'pVar', name: 'Variance (bar²)', color: 'var(--warn)' }]} />
        <TimeChart title="Daily sensor reliability" unit="%" data={pts} span={span} domain={[0, 100]} lines={[{ key: 'reliability', name: 'Reliability %', color: 'var(--ok)' }]} />
      </div>
      <div className="grid g-main">
        <Card title="Anomaly history" right={<select className="field" aria-label="Event group" style={{ minHeight: 28 }} value={filter} onChange={(e) => setFilter(e.target.value)}><option>All</option>{Object.keys(GROUPS).map((g) => <option key={g}>{g}</option>)}</select>} bodyClass="scroll-x">
          {evs.length === 0 ? <div className="empty">No events in this period.</div> : (
            <table className="tbl"><thead><tr><th>When</th><th>Pipeline</th><th>Event</th><th>Severity</th><th>Prob./Conf.</th></tr></thead>
              <tbody>{evs.slice(0, 80).map((e) => (
                <tr key={e.id}><td className="mono small nowrap">{fmtDateTime(e.ts)}</td><td className="mono">{e.pipeline_id}</td><td><b>{e.explanation.title}</b><div className="muted small">{e.explanation.summary}</div></td><td><Pill tone={sevTone(e.severity)}>{sevLabel(e.severity)}</Pill></td><td className="mono nowrap">{Math.round(e.probability)}% / {Math.round(e.confidence)}%</td></tr>
              ))}</tbody></table>
          )}
        </Card>
        <div className="stack">
          <Card title="Events by type">
            {Object.entries(data?.byType ?? {}).sort((a, b) => b[1] - a[1]).map(([t, n]) => <div className="row" key={t} style={{ justifyContent: 'space-between', padding: '3px 0' }}><span>{t.replace(/_/g, ' ').toLowerCase()}</span><b className="mono">{n}</b></div>)}
            {!data || Object.keys(data.byType).length === 0 ? <div className="muted">None</div> : null}
          </Card>
          <Card title="Maintenance events">
            <div className="stack">{(data?.maintenance ?? []).map((m) => <div key={m.id}><b>{m.kind}</b> <span className="muted">· {m.pipeline_id} · {fmtDateTime(m.ts)}</span><div className="small muted">{m.note}</div></div>)}</div>
          </Card>
        </div>
      </div>
    </>
  );
}

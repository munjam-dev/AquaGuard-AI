'use client';

import { Fragment, useState } from "react";
import { useApi, useApp } from '@/components/provider';
import { Card, Pill } from '@/components/ui';
import { fmtDateTime, post, sevLabel, sevTone } from '@/lib/format';
import type { AlertRow } from '@/lib/types';

const CATS = ['pH', 'Turbidity', 'Pressure', 'Flow', 'Leakage', 'Pipeline stress', 'Sensor failure', 'Water-quality anomaly'];

export default function AlertsPage() {
  const { state, refresh } = useApp();
  const [status, setStatus] = useState('active');
  const [severity, setSeverity] = useState('all');
  const [category, setCategory] = useState('all');
  const [pipeline, setPipeline] = useState('all');
  const [open, setOpen] = useState<number | null>(null);
  const [bump, setBump] = useState(0);
  const { data } = useApi<{ alerts: AlertRow[] }>(`/api/alerts?status=${status}&severity=${severity}&category=${encodeURIComponent(category)}&pipeline=${pipeline}`, `${state?.clock}-${bump}`);
  const act = async (id: number, action: string) => { await post('/api/alerts', { id, action }, 'PATCH'); setBump((b) => b + 1); refresh(); };
  const [wo, setWo] = useState<string | null>(null);
  const makeWo = async (a: AlertRow) => {
    try {
      const r = await post<{ id: number }>('/api/workorders', { pipeline_id: a.pipeline_id, alert_id: a.id, type: a.type, title: `${a.title} on ${a.pipeline_id}`, priority: a.severity === 'critical' ? 'urgent' : a.severity === 'warning' ? 'high' : 'normal' });
      setWo(`Work order #${r.id} created. See Control and Repair.`); setBump((b) => b + 1); refresh();
    } catch (e) { setWo((e as Error).message); }
  };
  const rows = data?.alerts ?? [];
  return (
    <>
      <div className="row">
        {[['Critical', 'crit', state?.alertCounts.critical], ['Warning', 'warn', state?.alertCounts.warning], ['Attention', 'att', state?.alertCounts.attention]].map(([l, t, n]) => (
          <Pill key={l as string} tone={t as 'crit'}>{l}: {n ?? 0}</Pill>
        ))}
        <span className="small muted">Normal: pipelines with no active alert</span>
      </div>
      <Card title="Filters" bodyClass="card-b row">
        <select className="field" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">Active</option><option value="all">All</option><option value="open">Open</option><option value="acknowledged">Acknowledged</option><option value="resolved">Resolved</option><option value="false_positive">False positive</option>
        </select>
        <select className="field" aria-label="Severity" value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="all">All severities</option><option value="critical">Critical</option><option value="warning">Warning</option><option value="attention">Attention</option>
        </select>
        <select className="field" aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">All categories</option>{CATS.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="field" aria-label="Pipeline" value={pipeline} onChange={(e) => setPipeline(e.target.value)}>
          <option value="all">All pipelines</option>{state?.pipelines.map((p) => <option key={p.cfg.id}>{p.cfg.id}</option>)}
        </select>
      </Card>
      <Card title={`${rows.length} alert${rows.length === 1 ? '' : 's'}`} bodyClass="scroll-x">
        {rows.length === 0 ? <div className="empty"><span className="dot ok" /> No alerts match these filters.</div> : (
          <table className="tbl">
            <thead><tr><th>Severity</th><th>Alert</th><th>Pipeline</th><th>Category</th><th>Prob. / Conf.</th><th>Raised</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map((a) => (
                <Fragment key={a.id}>
                  <tr className="click" onClick={() => setOpen(open === a.id ? null : a.id)}>
                    <td><Pill tone={sevTone(a.severity)}>{sevLabel(a.severity)}</Pill></td>
                    <td><b>{a.title}</b><div className="muted small">{a.summary}</div></td>
                    <td className="mono">{a.pipeline_id}</td><td>{a.category}</td>
                    <td className="mono nowrap">{Math.round(a.probability)}% / {Math.round(a.confidence)}%</td>
                    <td className="mono small nowrap">{fmtDateTime(a.created_ts)}</td>
                    <td><Pill tone={a.status === 'open' ? 'warn' : a.status === 'acknowledged' ? 'att' : 'neutral'}>{a.status.replace('_', ' ')}</Pill></td>
                    <td className="nowrap" onClick={(e) => e.stopPropagation()}>
                      {(a.status === 'open') && <button className="btn sm" onClick={() => act(a.id, 'ack')}>Acknowledge</button>}{' '}
                      {(a.status === 'open' || a.status === 'acknowledged') && <><button className="btn sm" onClick={() => act(a.id, 'resolve')}>Resolve</button>{' '}<button className="btn sm" onClick={() => act(a.id, 'false_positive')} title="Feeds false-positive monitoring">False positive</button></>}
                    </td>
                  </tr>
                  {open === a.id && <tr><td colSpan={8} style={{ background: 'var(--panel2)' }}><b>Why this alert was raised</b><ul className="evidence">{a.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>{a.note && <div className="small muted">Note: {a.note}</div>}{(a.status === 'open' || a.status === 'acknowledged') && <div className="row" style={{ marginTop: 8 }}><button className="btn sm primary" onClick={() => makeWo(a)}>Create work order</button><a className="btn sm" href="/maintenance">Open Control and Repair</a>{wo && <span className="small">{wo}</span>}</div>}</td></tr>}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

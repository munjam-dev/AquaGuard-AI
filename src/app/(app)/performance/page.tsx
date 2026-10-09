'use client';

import { useState } from 'react';
import type { EvalReport } from '@/engine/evaluation';
import { useApi } from '@/components/provider';
import { Card, Kpi, Pill } from '@/components/ui';
import { fmtFull, post } from '@/lib/format';

const pc = (x: number) => `${(x * 100).toFixed(1)}`;
const FLOW = ['Sensors', 'Data collection', 'Data validation', 'Preprocessing', 'AI analysis', 'Anomaly detection', 'Risk assessment', 'Confidence score', 'Alert', 'Dashboard', 'Historical analysis', 'Predictive monitoring'];
const label = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

export default function Performance() {
  const { data, setData } = useApi<EvalReport>('/api/evaluation');
  const [busy, setBusy] = useState(false);
  const rerun = async () => { setBusy(true); try { setData(await post<EvalReport>('/api/evaluation', {})); } finally { setBusy(false); } };
  const m = data?.metrics;
  return (
    <>
      <div className="note"><b>Read this as a regression test, not a field-accuracy claim.</b> These metrics are computed live from {data?.seeds ?? 6} random seeds of {data?.rows.length ?? 14} simulated test conditions. Real-world accuracy depends on sensor quality, calibration, communication reliability and site conditions, and cannot be guaranteed. Recompute against verified field events once available.</div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="small muted">{data ? `Last run ${fmtFull(data.ranAt)}` : 'Running evaluation…'}</span>
        <button className="btn primary" disabled={busy} onClick={rerun}>{busy ? 'Running…' : 'Re-run evaluation'}</button>
      </div>
      {m && (
        <div className="grid g4">
          <Card><Kpi label="Accuracy" value={pc(m.accuracy)} unit="%" sub="label-level, all scenarios" /></Card>
          <Card><Kpi label="Precision" value={pc(m.precision)} unit="%" sub={`${m.tp} TP · ${m.fp} FP`} /></Card>
          <Card><Kpi label="Recall" value={pc(m.recall)} unit="%" sub={`${m.tp} TP · ${m.fn} FN`} /></Card>
          <Card><Kpi label="F1 score" value={pc(m.f1)} unit="%" /></Card>
          <Card><Kpi label="False positive rate" value={pc(m.fpr)} unit="%" sub={`${m.fp} of ${m.fp + m.tn} negatives`} /></Card>
          <Card><Kpi label="False negative rate" value={pc(m.fnr)} unit="%" sub={`${m.fn} of ${m.fn + m.tp} positives`} /></Card>
          <Card><Kpi label="Detection latency" value={m.avgLatencyMin === null ? '—' : m.avgLatencyMin.toFixed(1)} unit="readings" sub="avg. after onset (1 reading ≈ 1 min)" /></Card>
          <Card><Kpi label="Sensor reliability" value={m.avgReliability.toFixed(1)} unit="%" sub="avg. across test runs" /></Card>
        </div>
      )}
      <Card title="Model evaluation — actual condition vs AI prediction" bodyClass="scroll-x">
        <table className="tbl">
          <thead><tr><th>#</th><th>Actual condition</th><th>AI prediction</th><th>Seeds passed</th><th>Latency</th><th>Result</th></tr></thead>
          <tbody>
            {data?.rows.map((r, i) => (
              <tr key={r.scenario}>
                <td className="mono muted">{i + 1}</td><td><b>{r.label}</b></td>
                <td>{r.predicted.length ? r.predicted.map(label).join(' + ') : 'Normal (no anomaly)'}</td>
                <td className="mono">{r.passRate}</td><td className="mono">{r.latencyMin === null ? '—' : `${r.latencyMin.toFixed(1)} rd`}</td>
                <td><Pill tone={r.result === 'PASS' ? 'ok' : 'crit'}>{r.result}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="How a detection is made (processing workflow)">
        <div className="flow">{FLOW.map((s, i) => <span key={s} className="row" style={{ gap: 6 }}><span className="st">{s}</span>{i < FLOW.length - 1 && <span className="ar">→</span>}</span>)}</div>
        <ul className="evidence" style={{ marginTop: 12 }}>
          <li>Validation first: frozen, impossible, jumping, missing, drifting and conflicting sensors are excluded before any detector runs.</li>
          <li>Leak needs flow loss <i>and</i> pressure loss; rising inlet pressure points to blockage instead. A single deviating sensor cannot raise a leak.</li>
          <li>Detections use medians over several readings, a historical baseline and configurable reference ranges, not one fixed threshold.</li>
          <li>Every prediction carries a probability and a confidence derived from sensor reliability, signal agreement and history depth, capped below 100%.</li>
        </ul>
      </Card>
    </>
  );
}

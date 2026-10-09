'use client';

import { useApi, useApp } from '@/components/provider';
import { Card, Pill } from '@/components/ui';
import { scoreTone, sevLabel, sevTone, statusTone } from '@/lib/format';
import type { Prediction } from '@/engine/types';

type P = Prediction & { pipeline_id: string; location: string };
const KIND: Record<string, string> = { turbidity_trend: 'Water quality', ph_trend: 'Water quality', pressure_instability: 'Pipeline stress', future_leak: 'Possible future leakage', sensor_degradation: 'Sensor degradation' };

export default function Insights() {
  const { state } = useApp();
  const { data } = useApi<{ predictions: P[] }>('/api/predictions', state?.clock);
  const list = (data?.predictions ?? []).sort((a, b) => (b.severity === a.severity ? b.probability - a.probability : (a.severity === 'critical' ? -1 : a.severity === 'warning' ? -1 : 1)));
  const ranked = [...(state?.pipelines ?? [])].filter((p) => p.analysis).sort((a, b) => a.analysis!.health.score - b.analysis!.health.score);
  return (
    <>
      <div className="note">Predictions extrapolate recent trends. They are estimates with an attached probability and confidence, never certainties, and they update as new readings arrive.</div>
      <div className="grid g-main">
        <Card title={`Predicted risks (${list.length})`}>
          <div className="stack">
            {list.length === 0 && <div className="empty"><span className="dot ok" /> No adverse trends detected. All monitored parameters are stable.</div>}
            {list.map((p, i) => (
              <div key={i} className={`finding ${sevTone(p.severity)}`}>
                <h4><Pill tone={sevTone(p.severity)}>{sevLabel(p.severity)}</Pill>{p.title}</h4>
                <p><b>Prediction:</b> {p.text}</p>
                <div className="meta"><span>{KIND[p.kind]}</span><span>{p.location}</span><span>Likelihood: {p.probability}%</span><span>Confidence: {p.confidence}%</span></div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Pipeline risk ranking" bodyClass="">
          <table className="tbl"><thead><tr><th>Pipeline</th><th>Status</th><th>Health</th></tr></thead>
            <tbody>{ranked.map((p) => <tr key={p.cfg.id}><td><b>{p.cfg.id}</b></td><td><Pill tone={statusTone(p.analysis!.status)}>{p.analysis!.status}</Pill></td><td className="mono" style={{ color: `var(--${scoreTone(p.analysis!.health.score)})` }}>{p.analysis!.health.score}%</td></tr>)}</tbody></table>
        </Card>
      </div>
    </>
  );
}

'use client';

import Link from 'next/link';
import { useState } from 'react';
import { fmtDateTime, sevLabel, sevTone } from '@/lib/format';
import type { AlertRow } from '@/lib/types';
import { useApi, useApp } from './provider';
import { Card, Icon } from './ui';

export function AlertFeed({ limit = 8, pipeline }: { limit?: number; pipeline?: string }) {
  const { state } = useApp();
  const q = `/api/alerts?status=active&limit=${limit}${pipeline ? `&pipeline=${pipeline}` : ''}`;
  const { data } = useApi<{ alerts: AlertRow[] }>(q, state?.clock);
  const list = data?.alerts ?? [];
  return (
    <Card title="Active alerts" right={<Link href="/alerts" className="small" style={{ color: 'var(--accent)' }}>View all</Link>} bodyClass="">
      {list.length === 0 && <div className="empty"><span className="dot ok" /> All systems normal. No active alerts.</div>}
      {list.map((a) => (
        <div className="alert-item" key={a.id}>
          <span className={`dot ${sevTone(a.severity)}`} />
          <div>
            <b>{sevLabel(a.severity)} — {a.title}</b>
            <p>{a.pipeline_id}: {a.summary}</p>
          </div>
          <span className="mono small muted nowrap">{fmtDateTime(a.updated_ts)}</span>
        </div>
      ))}
    </Card>
  );
}

export const SCENARIO_BUTTONS: { key: string; label: string }[] = [
  { key: 'normal', label: 'Normal' },
  { key: 'leak', label: 'Leakage' },
  { key: 'high_turbidity', label: 'High Turbidity' },
  { key: 'high_ph', label: 'Abnormal pH' },
  { key: 'stress', label: 'Pipeline Stress' },
  { key: 'sensor_failure', label: 'Sensor Failure' },
  { key: 'random', label: 'Random Anomaly' },
];
export const MORE_SCENARIOS: { key: string; label: string }[] = [
  { key: 'low_ph', label: 'Low pH' },
  { key: 'turbidity_spike', label: 'Turbidity Spike' },
  { key: 'blockage', label: 'Blockage' },
  { key: 'pressure_drop', label: 'Pressure Drop' },
  { key: 'abnormal_flow', label: 'Abnormal Flow' },
  { key: 'missing_data', label: 'Missing Data' },
  { key: 'contamination', label: 'Contamination' },
];

/** Scenario injector: the dashboard reacts to the selected scenario within a tick. */
export function ScenarioPanel({ extended = false }: { extended?: boolean }) {
  const { state, selected, simulate } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [target, setTarget] = useState<'selected' | 'ALL'>('selected');
  const cur = state?.pipelines.find((p) => p.cfg.id === selected)?.scenario ?? 'normal';
  const run = async (key: string) => {
    setBusy(key);
    try { await simulate({ action: 'scenario', scenario: key, pipeline: key === 'random' ? undefined : target === 'ALL' ? 'ALL' : selected }); } finally { setBusy(null); }
  };
  const buttons = extended ? [...SCENARIO_BUTTONS, ...MORE_SCENARIOS] : SCENARIO_BUTTONS;
  return (
    <Card
      title={<span className="row" style={{ gap: 8 }}><Icon name="sim" size={14} /> Sensor simulation — {selected}</span>}
      right={<span className="small muted">Current: <b style={{ color: 'var(--text)' }}>{cur.replace(/_/g, ' ')}</b></span>}
    >
      <div className="row">
        {buttons.map((b) => (
          <button key={b.key} className={`btn sm ${cur === b.key ? 'on' : ''}`} disabled={busy !== null} onClick={() => run(b.key)}>{busy === b.key ? '…' : b.label}</button>
        ))}
        {(extended || true) && (
          <label className="small muted row" style={{ marginLeft: 'auto', gap: 6 }}>
            Apply “Normal” to
            <select className="field" style={{ minHeight: 28, padding: '2px 6px' }} value={target} onChange={(e) => setTarget(e.target.value as 'selected' | 'ALL')}>
              <option value="selected">{selected} only</option>
              <option value="ALL">all pipelines</option>
            </select>
          </label>
        )}
      </div>
      <p className="small muted" style={{ margin: '10px 0 0' }}>Selecting a scenario starts the live simulation and injects realistic sensor behaviour into the chosen pipeline. The engine then detects it from the raw readings only; it is never told which scenario is running.</p>
    </Card>
  );
}

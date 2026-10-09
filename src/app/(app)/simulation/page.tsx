'use client';

import { useEffect, useState } from 'react';
import { ScenarioPanel } from '@/components/panels';
import { useApp } from '@/components/provider';
import { Card, Pill } from '@/components/ui';
import { post, sevLabel, sevTone } from '@/lib/format';

const FIELDS: { k: string; label: string }[] = [
  { k: 'pH', label: 'pH' }, { k: 'turbidity', label: 'Turbidity (NTU)' }, { k: 'temperature', label: 'Temperature (°C)' }, { k: 'tds', label: 'TDS (mg/L)' },
  { k: 'conductivity', label: 'Conductivity (µS/cm)' }, { k: 'dissolved_oxygen', label: 'Dissolved O₂ (mg/L)' }, { k: 'orp', label: 'ORP (mV)' }, { k: 'chlorine', label: 'Chlorine (mg/L)' },
  { k: 'pressure_in', label: 'Inlet pressure (bar)' }, { k: 'pressure_out', label: 'Outlet pressure (bar)' }, { k: 'flow_rate', label: 'Flow (m³/h)' }, { k: 'vibration', label: 'Vibration' }, { k: 'acoustic', label: 'Acoustic' },
];
interface Result { status: string; health: { score: number; label: string }; water_quality_score: number; leak: { probability: number; confidence: number; class: string }; sensor_flags: string[]; anomalies: { type: string; severity: string; probability: number; confidence: number; title: string }[]; error?: string }

export default function Simulation() {
  const { state, selected, refresh } = useApp();
  const [form, setForm] = useState<Record<string, string>>({});
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const cur = state?.pipelines.find((p) => p.cfg.id === selected);

  useEffect(() => {
    const r = cur?.reading as unknown as Record<string, number | null> | undefined;
    if (!r) return;
    setForm(Object.fromEntries(FIELDS.map((f) => [f.k, r[f.k] === null || r[f.k] === undefined ? '' : String(Math.round(Number(r[f.k]) * 100) / 100)])));
    // prefill when the selected pipeline changes, not on every live tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, !!cur]);

  const submit = async () => {
    setErr(null);
    const body: Record<string, unknown> = { pipeline_id: selected, timestamp: new Date((state?.clock ?? Date.now()) + 60000).toISOString() };
    for (const f of FIELDS) body[f.k] = form[f.k] === '' || form[f.k] === undefined ? null : form[f.k];
    try { setRes(await post<Result>('/api/sensor-data', body)); refresh(); } catch (e) { setErr((e as Error).message); setRes(null); }
  };
  const sample = JSON.stringify({ timestamp: '2026-10-08T12:00:00', pipeline_id: 'PIPE-001', pH: 7.2, turbidity: 2.4, temperature: 27.5, tds: 320, pressure_in: 4.8, pressure_out: 4.5, flow_rate: 125.4, vibration: 0.18 }, null, 2);

  return (
    <>
      <ScenarioPanel extended />
      <div className="grid g-main">
        <Card title={`Manual data entry — ${selected}`} right={<span className="small muted">for testing without physical sensors</span>}>
          <div className="formgrid">
            {FIELDS.map((f) => <label key={f.k}>{f.label}<input className="field" inputMode="decimal" value={form[f.k] ?? ''} placeholder="no sensor" onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} /></label>)}
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn primary" onClick={submit}>Submit reading</button>
            <span className="small muted">Leave a field empty to simulate a missing sensor. Values go through the same validation and AI pipeline as live data.</span>
          </div>
          {err && <div className="note" style={{ marginTop: 12, borderLeftColor: 'var(--crit)' }}>{err}</div>}
          {res && (
            <div className="stack" style={{ marginTop: 14 }}>
              <div className="row"><Pill tone={res.status === 'Healthy' ? 'ok' : res.status === 'Warning' ? 'att' : res.status === 'Risk' ? 'warn' : 'crit'}>{res.status}</Pill><span>Health {res.health.score}% ({res.health.label})</span><span>Quality {res.water_quality_score}/100</span><span>Leak {res.leak.probability}% ({res.leak.class})</span></div>
              {res.sensor_flags.map((f, i) => <div key={i} className="finding att"><p style={{ margin: 0 }}>{f}</p></div>)}
              {res.anomalies.map((a, i) => <div key={i} className={`finding ${sevTone(a.severity)}`}><h4><Pill tone={sevTone(a.severity)}>{sevLabel(a.severity)}</Pill>{a.title}</h4><div className="meta"><span>Probability {a.probability}%</span><span>Confidence {a.confidence}%</span></div></div>)}
              {res.anomalies.length === 0 && res.sensor_flags.length === 0 && <div className="muted">No anomalies. A single reading is judged against the recent history, so sustained conditions need several readings to be confirmed.</div>}
            </div>
          )}
        </Card>
        <Card title="IoT integration · POST /api/sensor-data">
          <p className="small muted" style={{ marginTop: 0 }}>Real hardware only needs to POST JSON (one object or an array of up to 500). Any sensor may be omitted or null.</p>
          <pre className="code">{`curl -X POST http://localhost:3000/api/sensor-data \\\n  -H "content-type: application/json" \\\n  -d '${sample.replace(/\n\s*/g, ' ')}'`}</pre>
          <p className="small muted">Response includes status, health, water-quality score, leak probability with confidence, sensor flags and detected anomalies. Add authentication (API key / mTLS) before exposing this endpoint to the internet.</p>
        </Card>
      </div>
    </>
  );
}

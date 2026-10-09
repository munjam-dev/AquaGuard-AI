'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/components/provider';
import { Card } from '@/components/ui';
import type { Field, PipelineCfg, Settings } from '@/engine/types';
import { post } from '@/lib/format';

const CAL_FIELDS: Field[] = ['pH', 'turbidity', 'temperature', 'tds', 'pressure_in', 'pressure_out', 'flow_rate', 'vibration'];
const toNum = (v: string) => (v.trim() === '' || Number.isNaN(Number(v)) ? undefined : Number(v));

function N({ v, on, step = 'any', w }: { v: number | undefined; on: (n: number | undefined) => void; step?: string; w?: number }) {
  return <input className="field mono" type="number" step={step} style={{ width: w ?? 90 }} value={v ?? ''} onChange={(e) => on(toNum(e.target.value))} />;
}

export default function Admin() {
  const { settings, pipelines, reloadSettings, refresh } = useApp();
  const [s, setS] = useState<Settings | null>(null);
  const [p, setP] = useState<PipelineCfg[]>([]);
  const [calPipe, setCalPipe] = useState('PIPE-001');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { if (settings && !s) { setS(structuredClone(settings)); setP(structuredClone(pipelines)); } }, [settings, pipelines, s]);
  if (!s) return <div className="empty">Loading settings…</div>;

  const std = s.standards[s.standard];
  const setParam = (f: string, key: 'min' | 'max' | 'margin' | 'weight', v: number | undefined) => {
    const n = structuredClone(s); const prm = n.standards[n.standard].params[f as Field]!;
    if (v === undefined && (key === 'min' || key === 'max')) delete prm[key]; else if (v !== undefined) prm[key] = v;
    setS(n);
  };
  const save = async () => {
    try { await post('/api/settings', { settings: s, pipelines: p }, 'PUT'); await reloadSettings(); await refresh(); setMsg('Settings saved. Detection now uses the new configuration. Re-run the evaluation on the AI Performance page to re-verify accuracy.'); }
    catch (e) { setMsg(`Save failed: ${(e as Error).message}`); }
    setTimeout(() => setMsg(null), 6000);
  };
  const cal = s.calibration[calPipe] ?? {};

  return (
    <>
      <div className="note">No single threshold fits every water system. Choose the applicable standard and adjust each range for your network. Changes apply to new readings immediately.</div>
      <Card title="Water-quality reference standard" right={<select className="field" aria-label="Standard" value={s.standard} onChange={(e) => setS({ ...s, standard: e.target.value })}>{Object.entries(s.standards).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select>}>
        <div className="scroll-x"><table className="tbl">
          <thead><tr><th>Parameter</th><th>Min</th><th>Max</th><th>Warning→Critical margin</th><th>Score weight</th><th>Unit</th></tr></thead>
          <tbody>{Object.entries(std.params).map(([f, prm]) => (
            <tr key={f}><td><b>{f}</b></td>
              <td><N v={prm!.min} on={(v) => setParam(f, 'min', v)} /></td><td><N v={prm!.max} on={(v) => setParam(f, 'max', v)} /></td>
              <td><N v={prm!.margin} on={(v) => setParam(f, 'margin', v)} /></td><td><N v={prm!.weight} on={(v) => setParam(f, 'weight', v)} /></td><td className="muted">{prm!.unit}</td></tr>
          ))}</tbody>
        </table></div>
      </Card>

      <div className="grid g3">
        <Card title="Operating limits (pressure, flow, temperature)">
          <div className="formgrid">
            {(['pressure', 'flow', 'temperature'] as const).map((k) => (
              <div key={k} className="stack"><b style={{ textTransform: 'capitalize' }}>{k}</b>
                <label>Min<N v={s.limits[k].min} on={(v) => v !== undefined && setS({ ...s, limits: { ...s.limits, [k]: { ...s.limits[k], min: v } } })} /></label>
                <label>Max<N v={s.limits[k].max} on={(v) => v !== undefined && setS({ ...s, limits: { ...s.limits, [k]: { ...s.limits[k], max: v } } })} /></label>
              </div>
            ))}
            <div className="stack"><b>Vibration</b>
              <label>Warn<N v={s.limits.vibration.warn} on={(v) => v !== undefined && setS({ ...s, limits: { ...s.limits, vibration: { ...s.limits.vibration, warn: v } } })} /></label>
              <label>Critical<N v={s.limits.vibration.crit} on={(v) => v !== undefined && setS({ ...s, limits: { ...s.limits, vibration: { ...s.limits.vibration, crit: v } } })} /></label>
            </div>
          </div>
        </Card>
        <Card title="Sensor validation thresholds">
          <div className="formgrid">
            <label>Frozen after (readings)<N v={s.sensors.frozenCount} step="1" on={(v) => v !== undefined && setS({ ...s, sensors: { ...s.sensors, frozenCount: v } })} /></label>
            <label>Missing after (readings)<N v={s.sensors.missingCount} step="1" on={(v) => v !== undefined && setS({ ...s, sensors: { ...s.sensors, missingCount: v } })} /></label>
            {(['pH', 'turbidity', 'temperature', 'pressure_in', 'flow_rate'] as Field[]).map((f) => (
              <label key={f}>Max jump · {f}<N v={s.sensors.maxJump[f]} on={(v) => v !== undefined && setS({ ...s, sensors: { ...s.sensors, maxJump: { ...s.sensors.maxJump, [f]: v } } })} /></label>
            ))}
          </div>
        </Card>
        <Card title="Detection & alert sensitivity">
          <div className="stack">
            <label className="stack" style={{ gap: 4 }}>AI detection sensitivity: <b className="mono">{s.sensitivity.ai.toFixed(2)}×</b>
              <input type="range" min="0.5" max="1.5" step="0.05" value={s.sensitivity.ai} onChange={(e) => setS({ ...s, sensitivity: { ...s.sensitivity, ai: Number(e.target.value) } })} />
              <span className="small muted">Higher catches weaker signals earlier but can raise more false alarms.</span></label>
            <label className="stack" style={{ gap: 4 }}>Alert sensitivity
              <select className="field" value={s.sensitivity.alert} onChange={(e) => setS({ ...s, sensitivity: { ...s.sensitivity, alert: e.target.value as 'low' | 'medium' | 'high' } })}>
                <option value="low">Low — critical/warning, confidence ≥ 70%</option><option value="medium">Medium — all levels, confidence ≥ 50%</option><option value="high">High — all levels, confidence ≥ 30%</option>
              </select></label>
          </div>
        </Card>
      </div>

      <Card title="Pipeline configuration (design values used as the expected baseline)" bodyClass="scroll-x">
        <table className="tbl">
          <thead><tr><th>Pipeline</th><th>Name</th><th>Location</th><th>Dia. (mm)</th><th>Inlet bar</th><th>Outlet bar</th><th>Flow m³/h</th><th>Vib. baseline</th></tr></thead>
          <tbody>{p.map((c, i) => {
            const up = (fn: (x: PipelineCfg) => void) => { const n = structuredClone(p); fn(n[i]); setP(n); };
            return (
              <tr key={c.id}><td><b>{c.id}</b></td>
                <td><input className="field" value={c.name} onChange={(e) => up((x) => { x.name = e.target.value; })} /></td>
                <td><input className="field" value={c.location} onChange={(e) => up((x) => { x.location = e.target.value; })} /></td>
                <td><N w={70} v={c.diameter_mm} on={(v) => v !== undefined && up((x) => { x.diameter_mm = v; })} /></td>
                <td><N w={70} v={c.nominal.pressure_in} on={(v) => v !== undefined && up((x) => { x.nominal.pressure_in = v; })} /></td>
                <td><N w={70} v={c.nominal.pressure_out} on={(v) => v !== undefined && up((x) => { x.nominal.pressure_out = v; })} /></td>
                <td><N w={70} v={c.nominal.flow} on={(v) => v !== undefined && up((x) => { x.nominal.flow = v; })} /></td>
                <td><N w={70} v={c.nominal.vibration} on={(v) => v !== undefined && up((x) => { x.nominal.vibration = v; })} /></td></tr>
            );
          })}</tbody>
        </table>
      </Card>

      <Card title="Sensor calibration offsets" right={<select className="field" aria-label="Pipeline" value={calPipe} onChange={(e) => setCalPipe(e.target.value)}>{p.map((c) => <option key={c.id}>{c.id}</option>)}</select>}>
        <p className="small muted" style={{ marginTop: 0 }}>Offsets are added to every incoming value for this pipeline before validation (e.g. +0.15 to correct a pH probe that reads low).</p>
        <div className="formgrid">
          {CAL_FIELDS.map((f) => <label key={f}>{f}<N v={cal[f] ?? 0} on={(v) => setS({ ...s, calibration: { ...s.calibration, [calPipe]: { ...cal, [f]: v ?? 0 } } })} /></label>)}
        </div>
      </Card>

      <div className="row"><button className="btn primary" onClick={save}>Save settings</button><button className="btn" onClick={() => { setS(structuredClone(settings!)); setP(structuredClone(pipelines)); }}>Discard changes</button>{msg && <span className="small">{msg}</span>}</div>
    </>
  );
}

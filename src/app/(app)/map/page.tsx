'use client';

import { useApp, usePipeline } from '@/components/provider';
import { Card, Kpi, Pill } from '@/components/ui';
import { fmtFull, num, riskTone, statusTone } from '@/lib/format';

const COLOR = { Healthy: 'var(--ok)', Warning: 'var(--att)', Risk: 'var(--warn)', Critical: 'var(--crit)', Isolated: 'var(--muted)' } as const;
const NODES: { x: number; y: number; label: string; plant?: boolean }[] = [
  { x: 60, y: 200, label: 'Parvati WTP', plant: true }, { x: 220, y: 200, label: 'Hub A' }, { x: 360, y: 110, label: 'Aundh' },
  { x: 380, y: 200, label: 'Viman Nagar' }, { x: 360, y: 300, label: 'Katraj' }, { x: 540, y: 250, label: 'Hadapsar' },
  { x: 520, y: 90, label: 'Kothrud' }, { x: 520, y: 340, label: 'Sinhagad' }, { x: 640, y: 150, label: 'Baner' },
];

export default function MapPage() {
  const { state, selected, select } = useApp();
  const { data: d } = usePipeline(selected);
  const a = d?.analysis;
  return (
    <div className="grid g-main">
      <Card title="Pipeline network" right={<div className="legend">{(['Healthy', 'Warning', 'Risk', 'Critical', 'Isolated'] as const).map((s) => <span key={s}><i className="dot" style={{ background: COLOR[s] }} />{s}</span>)}</div>}>
        <div className="maparea">
          <svg viewBox="0 0 700 400" role="img" aria-label="Interactive pipeline network map">
            <defs><pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none" stroke="var(--border2)" strokeWidth="1" /></pattern></defs>
            <rect width="700" height="400" fill="url(#grid)" />
            {state?.pipelines.map((p) => {
              const m = p.cfg.map; const st = p.analysis?.status ?? 'Healthy'; const sel = p.cfg.id === selected;
              const mx = (m.x1 + m.x2) / 2, my = (m.y1 + m.y2) / 2;
              return (
                <g key={p.cfg.id} className="seg-line" onClick={() => select(p.cfg.id)} tabIndex={0} role="button" aria-label={`${p.cfg.id} ${st}`} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') select(p.cfg.id); }}>
                  {sel && <line x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} stroke="var(--text)" strokeOpacity="0.25" strokeWidth="18" strokeLinecap="round" />}
                  <line x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} stroke="transparent" strokeWidth="26" />
                  <line x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} stroke={COLOR[st]} strokeWidth="9" strokeLinecap="round" />
                  {state.sim.running && <line x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} stroke="#fff" strokeOpacity="0.55" strokeWidth="2" strokeDasharray="2 12"><animate attributeName="stroke-dashoffset" from="14" to="0" dur="1s" repeatCount="indefinite" /></line>}
                  <rect x={mx - 30} y={my - 24} width="60" height="16" rx="3" fill="var(--panel)" stroke="var(--border)" />
                  <text x={mx} y={my - 12} textAnchor="middle" fontSize="10" fontFamily="var(--mono)" fill="var(--text)">{p.cfg.id}</text>
                </g>
              );
            })}
            {NODES.map((n) => (
              <g key={n.label}>
                {n.plant ? <rect x={n.x - 12} y={n.y - 12} width="24" height="24" rx="4" fill="var(--accent)" /> : <circle cx={n.x} cy={n.y} r="8" fill="var(--panel)" stroke="var(--text)" strokeWidth="2" />}
                <text x={n.x} y={n.y + 26} textAnchor="middle" fontSize="11" fill="var(--muted)">{n.label}</text>
              </g>
            ))}
          </svg>
        </div>
        <p className="small muted" style={{ margin: '10px 0 0' }}>Schematic network. Click a pipeline section to inspect it. Colours reflect AI risk assessment (health, leak, stress and active alerts), not a surveyed condition.</p>
      </Card>

      <Card title={`Section details · ${selected}`} right={a && <Pill tone={statusTone(a.status)}>{a.status}</Pill>}>
        {d && a && (
          <div className="stack">
            <div><b>{d.cfg.name}</b><div className="muted small">{d.cfg.location} · {d.cfg.lat.toFixed(4)}, {d.cfg.lng.toFixed(4)} · DN{d.cfg.diameter_mm} {d.cfg.material}</div></div>
            <div className="kpis">
              <Kpi label="pH" value={num(a.current.pH, 2)} />
              <Kpi label="Turbidity" value={num(a.current.turbidity, 1)} unit="NTU" />
              <Kpi label="Pressure in/out" value={`${num(a.current.pressure_in, 1)}/${num(a.current.pressure_out, 1)}`} unit="bar" />
              <Kpi label="Flow" value={num(a.current.flow_rate, 0)} unit="m³/h" />
              <Kpi label="Pipeline health" value={a.health.score} unit="%" sub={a.health.label} />
              <Kpi label="Leak probability" value={a.leak.probability} unit="%" tone={riskTone(a.leak.probability)} sub={`conf. ${a.leak.confidence}%`} />
              <Kpi label="Stress probability" value={a.stress.score} unit="%" tone={riskTone(a.stress.score)} sub={`${a.stress.risk} · AI estimate`} />
              <Kpi label="Sensor status" value={a.flags.some((f) => f.severity === 'critical') ? 'Fault' : a.flags.length ? 'Warning' : 'OK'} sub={`reliability ${a.reliability.overall}%`} />
            </div>
            <div className="small muted">Last update: {fmtFull(a.ts)}</div>
            {a.anomalies.length > 0 && <div className="note">{a.anomalies.map((x) => x.title).join(' · ')}</div>}
          </div>
        )}
      </Card>
    </div>
  );
}

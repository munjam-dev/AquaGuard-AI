'use client';

import { useApp, usePipeline } from '@/components/provider';
import { AlertFeed, ScenarioPanel } from '@/components/panels';
import { RangeTabs, TimeChart, useRangeState, useSeries } from '@/components/charts';
import { Card, Finding, Kpi, Pill, ToneBar } from '@/components/ui';
import { fmtDateTime, num, qualityTone, riskTone, scoreTone, statusTone, stressTone } from '@/lib/format';
import type { Analysis } from '@/engine/types';

function paramStatus(a: Analysis | null, field: string) {
  return a?.quality.parts.find((p) => p.field === field);
}

export default function Dashboard() {
  const { state, selected, select, settings } = useApp();
  const { data: d } = usePipeline(selected);
  const rs = useRangeState();
  const series = useSeries(selected, rs.range, rs.custom);
  const a = d?.analysis ?? null;
  const cfg = d?.cfg;
  const std = settings?.standards[settings.standard]?.params;

  const counts = { Healthy: 0, Warning: 0, Risk: 0, Critical: 0, Isolated: 0 };
  state?.pipelines.forEach((p) => { if (p.analysis) counts[p.analysis.status]++; });
  const pts = series?.points ?? [];
  const span = series ? series.end - series.start : 24 * 3600e3;

  const ph = paramStatus(a, 'pH'), tb = paramStatus(a, 'turbidity');
  const dp = a?.leak.pressureDiff ?? null;

  return (
    <>
      <div className="grid g4">
        {(['Healthy', 'Warning', 'Risk', 'Critical'] as const).map((s) => (
          <Card key={s} flag={statusTone(s)}><Kpi label={`${s} sections`} value={counts[s]} sub={`of ${state?.pipelines.length ?? 0} monitored pipelines`} tone={counts[s] && s !== 'Healthy' ? statusTone(s) : undefined} /></Card>
        ))}
      </div>

      <Card title="Network overview" right={counts.Isolated > 0 ? <Pill tone="att">{counts.Isolated} isolated</Pill> : undefined} bodyClass="scroll-x">
        <table className="tbl">
          <thead><tr><th>Pipeline</th><th>Location</th><th>Status</th><th>Health</th><th>Water quality</th><th>Leak prob.</th><th>Stress</th><th>Sensors</th></tr></thead>
          <tbody>
            {state?.pipelines.map((p) => (
              <tr key={p.cfg.id} className="click" onClick={() => select(p.cfg.id)} style={p.cfg.id === selected ? { background: 'var(--accent-soft)' } : undefined}>
                <td><b>{p.cfg.id}</b> <span className="muted">{p.cfg.name}</span></td>
                <td className="muted">{p.cfg.location}</td>
                <td>{p.analysis && <Pill tone={statusTone(p.analysis.status)}>{p.analysis.status}</Pill>}</td>
                <td className="mono">{p.analysis?.health.score}%</td>
                <td className="mono">{p.analysis?.quality.score}/100</td>
                <td className="mono">{p.analysis?.leak.probability}%</td>
                <td><Pill tone={stressTone(p.analysis?.stress.risk ?? 'LOW')}>{p.analysis?.stress.risk}</Pill></td>
                <td className="mono">{p.analysis?.reliability.overall}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {cfg && a && (
        <>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ fontSize: 18 }}>{cfg.id} · {cfg.name}</h2>
              <span className="muted small">{cfg.location} · DN{cfg.diameter_mm} {cfg.material} · last update {fmtDateTime(a.ts)}</span>
            </div>
            <Pill tone={statusTone(a.status)}>{a.status}</Pill>
          </div>

          <div className="grid g3">
            <Card title="pH" flag={ph ? qualityTone(ph.status) : undefined} right={ph && <Pill tone={qualityTone(ph.status)}>{ph.status}</Pill>}>
              <Kpi label="Current pH" value={num(a.current.pH, 2)} sub={`Reference ${ph?.range ?? (std?.pH ? `${std.pH.min}–${std.pH.max}` : '—')}`} />
              <div className="stat-row">
                <div><span>Min 24h</span><b>{num(d?.stats.pH?.min, 2)}</b></div>
                <div><span>Max 24h</span><b>{num(d?.stats.pH?.max, 2)}</b></div>
                <div><span>Average</span><b>{num(d?.stats.pH?.avg, 2)}</b></div>
                <div><span>Trend</span><b>{d?.stats.pH?.trend ?? '—'}</b></div>
              </div>
            </Card>
            <Card title="Turbidity" flag={tb ? qualityTone(tb.status) : undefined} right={tb && <Pill tone={qualityTone(tb.status)}>{tb.status}</Pill>}>
              <Kpi label="Current turbidity" value={num(a.current.turbidity, 1)} unit="NTU" sub={`Reference ${tb?.range ?? '—'}`} />
              <div className="stat-row">
                <div><span>Min 24h</span><b>{num(d?.stats.turbidity?.min, 1)}</b></div>
                <div><span>Max 24h</span><b>{num(d?.stats.turbidity?.max, 1)}</b></div>
                <div><span>Average</span><b>{num(d?.stats.turbidity?.avg, 1)}</b></div>
                <div><span>Trend</span><b>{d?.stats.turbidity?.trend ?? '—'}</b></div>
              </div>
            </Card>
            <Card title="Water Quality Score" right={<span className="small muted">{a.quality.standard}</span>}>
              <div className="score"><span className="big" style={{ color: `var(--${scoreTone(a.quality.score)})` }}>{a.quality.score}</span><span className="of">/ 100</span></div>
              <div className="parts">
                {a.quality.parts.map((p) => (
                  <div className="part" key={p.field} title={`Reference ${p.range}`}>
                    <span>{p.label}</span><ToneBar value={p.score} tone={scoreTone(p.score)} /><span className="v">{num(p.value, p.value >= 100 ? 0 : 2)} {p.unit}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card title="Pipeline health" flag={scoreTone(a.health.score)}>
            <div className="grid" style={{ gridTemplateColumns: 'minmax(180px, 260px) 1fr', gap: 24, alignItems: 'center' }}>
              <div>
                <div className="score"><span className="big" style={{ color: `var(--${scoreTone(a.health.score)})` }}>{a.health.score}%</span></div>
                <div style={{ marginTop: 6 }}><Pill tone={scoreTone(a.health.score)}>{a.health.label}</Pill></div>
                <p className="small muted" style={{ margin: '8px 0 0' }}>Pipeline Health: {a.health.score}% — {a.health.label}. Combines leak, stress, water quality, sensor reliability and pressure/flow deviation.</p>
              </div>
              <div className="kpis">
                <Kpi label="Inlet pressure" value={num(a.current.pressure_in, 2)} unit="bar" sub={`nominal ${cfg.nominal.pressure_in}`} />
                <Kpi label="Outlet pressure" value={num(a.current.pressure_out, 2)} unit="bar" sub={`nominal ${cfg.nominal.pressure_out}`} />
                <Kpi label="Pressure difference" value={num(dp, 2)} unit="bar" sub={`nominal ${(cfg.nominal.pressure_in - cfg.nominal.pressure_out).toFixed(1)}`} />
                <Kpi label="Flow rate" value={num(a.current.flow_rate, 1)} unit="m³/h" sub={`expected ${cfg.nominal.flow}`} />
                <Kpi label="Vibration" value={num(a.current.vibration, 2)} sub={`baseline ${cfg.nominal.vibration}`} tone={(a.current.vibration ?? 0) > (settings?.limits.vibration.warn ?? 0.4) ? 'warn' : undefined} />
                <Kpi label="Leakage probability" value={a.leak.probability} unit="%" sub={`${a.leak.class} · conf. ${a.leak.confidence}%`} tone={riskTone(a.leak.probability)} />
                <Kpi label="Structural stress" value={a.stress.risk} sub={`${a.stress.score}% · conf. ${a.stress.confidence}% · AI estimate`} tone={stressTone(a.stress.risk)} />
                <Kpi label="Sensor reliability" value={a.reliability.overall} unit="%" sub={a.flags.length ? `${a.flags.length} sensor warning(s)` : 'all sensors consistent'} tone={scoreTone(a.reliability.overall)} />
              </div>
            </div>
          </Card>

          <div className="grid g-main">
            <Card title="AI analysis & explanation" right={<span className="small muted">probability + confidence on every finding</span>}>
              <div className="stack">
                {a.anomalies.length === 0 && <div className="empty"><span className="dot ok" /> No anomalies detected. Readings are consistent with the historical baseline and cross-sensor checks.</div>}
                {a.anomalies.map((x) => <Finding key={x.type} a={x} />)}
                {a.flags.filter((f) => f.kind === 'JUMP' || f.kind === 'CONFLICT' || f.kind === 'DRIFT').map((f, i) => (
                  <div key={i} className="finding att"><h4><Pill tone="att">SENSOR</Pill>{f.field} {f.kind.toLowerCase()}</h4><p>{f.message}</p></div>
                ))}
              </div>
            </Card>
            <AlertFeed limit={8} pipeline={selected} />
          </div>
        </>
      )}

      <ScenarioPanel />

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 15 }}>Real-time graphs · {selected}</h2>
        <RangeTabs {...rs} />
      </div>
      <div className="grid g3">
        <TimeChart title="pH vs time" data={pts} span={span} lines={[{ key: 'pH', name: 'pH', color: 'var(--accent)' }]} refs={[...(std?.pH?.max ? [{ y: std.pH.max, label: 'max' }] : []), ...(std?.pH?.min ? [{ y: std.pH.min, label: 'min' }] : [])]} />
        <TimeChart title="Turbidity vs time" unit="NTU" data={pts} span={span} lines={[{ key: 'turbidity', name: 'Turbidity (NTU)', color: 'var(--warn)' }]} refs={std?.turbidity?.max ? [{ y: std.turbidity.max, label: 'limit' }] : []} />
        <TimeChart title="Pressure vs time" unit="bar" data={pts} span={span} lines={[{ key: 'pressure_in', name: 'Inlet', color: 'var(--accent)' }, { key: 'pressure_out', name: 'Outlet', color: 'var(--ok)', dash: '5 3' }]} />
        <TimeChart title="Flow rate vs time" unit="m³/h" data={pts} span={span} lines={[{ key: 'flow_rate', name: 'Flow (m³/h)', color: 'var(--accent)' }]} refs={cfg ? [{ y: cfg.nominal.flow, label: 'expected', color: 'var(--muted)' }] : []} />
        <TimeChart title="Temperature vs time" unit="°C" data={pts} span={span} lines={[{ key: 'temperature', name: 'Temperature (°C)', color: 'var(--att)' }]} />
        <TimeChart title="Vibration vs time" data={pts} span={span} lines={[{ key: 'vibration', name: 'Vibration', color: 'var(--crit)' }]} refs={settings ? [{ y: settings.limits.vibration.warn, label: 'warn' }] : []} />
        <TimeChart title="Water quality score" data={pts} span={span} domain={[0, 100]} lines={[{ key: 'quality', name: 'Score', color: 'var(--ok)' }]} />
        <TimeChart title="Pipeline health score" data={pts} span={span} domain={[0, 100]} lines={[{ key: 'health', name: 'Health %', color: 'var(--accent)' }]} />
        <TimeChart title="Leak probability" unit="%" data={pts} span={span} domain={[0, 100]} lines={[{ key: 'leak', name: 'Leak probability %', color: 'var(--crit)' }, { key: 'stress', name: 'Stress %', color: 'var(--att)', dash: '4 3' }]} />
      </div>
    </>
  );
}

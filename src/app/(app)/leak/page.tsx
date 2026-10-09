'use client';

import { useMemo } from 'react';
import { useApp, usePipeline } from '@/components/provider';
import { RangeTabs, TimeChart, useRangeState, useSeries } from '@/components/charts';
import { Card, Kpi, Pill, ToneBar } from '@/components/ui';
import { num, riskTone, stressTone } from '@/lib/format';
import { ResponsePanel } from '@/components/response';

export default function LeakPage() {
  const { selected } = useApp();
  const { data: d } = usePipeline(selected);
  const rs = useRangeState();
  const series = useSeries(selected, rs.range === '24h' ? '6h' : rs.range, rs.custom);
  const a = d?.analysis; const cfg = d?.cfg;
  const pts = useMemo(() => (series?.points ?? []).map((p) => ({ ...p, expected: cfg?.nominal.flow ?? null, dp: p.pressure_in !== null && p.pressure_out !== null ? Number(p.pressure_in) - Number(p.pressure_out) : null })), [series, cfg]);
  const span = series ? series.end - series.start : 6 * 3600e3;
  if (!a || !cfg) return null;
  const L = a.leak, S = a.stress;
  return (
    <>
      <div className="grid g2">
        <Card title="Leak detection engine" flag={riskTone(L.probability)} right={<Pill tone={riskTone(L.probability)}>{L.class}</Pill>}>
          <div className="row" style={{ gap: 28 }}>
            <Kpi label="Leak probability" value={L.probability} unit="%" tone={riskTone(L.probability)} />
            <Kpi label="Confidence" value={L.confidence} unit="%" sub={L.confidence >= 85 ? 'High confidence' : L.confidence >= 65 ? 'Moderate confidence' : 'Low confidence'} />
          </div>
          <div style={{ margin: '12px 0' }}><ToneBar value={L.probability} tone={riskTone(L.probability)} /></div>
          <div className="grid g2" style={{ gap: 12 }}>
            <Kpi label="Expected flow" value={num(L.expectedFlow, 0)} unit="m³/h" />
            <Kpi label="Actual flow" value={num(L.actualFlow, 1)} unit="m³/h" sub={L.actualFlow !== null ? `${(((L.actualFlow - L.expectedFlow) / L.expectedFlow) * 100).toFixed(1)}% vs expected` : undefined} />
            <Kpi label="Inlet pressure" value={num(L.pressureIn, 2)} unit="bar" />
            <Kpi label="Outlet pressure" value={num(L.pressureOut, 2)} unit="bar" sub={`differential ${num(L.pressureDiff, 2)} bar`} />
          </div>
          <h4 style={{ margin: '14px 0 4px', fontSize: 13 }}>Why the system believes this</h4>
          <p style={{ margin: '0 0 6px' }}>{L.explanation}</p>
          <ul className="evidence">{L.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </Card>

        <Card title="Pipeline stress estimation" flag={stressTone(S.risk) } right={<Pill tone={stressTone(S.risk)}>{S.risk}</Pill>}>
          <div className="row" style={{ gap: 28 }}>
            <Kpi label="Structural stress risk" value={S.risk} tone={stressTone(S.risk)} sub={`${S.score}% score`} />
            <Kpi label="Confidence" value={S.confidence} unit="%" />
          </div>
          <div style={{ margin: '12px 0' }}><ToneBar value={S.score} tone={stressTone(S.risk)} /></div>
          <div className="note" style={{ marginBottom: 12 }}><b>AI-based risk estimation.</b> This is not a definitive structural engineering inspection.</div>
          <p style={{ margin: '0 0 6px' }}>{S.explanation}</p>
          <ul className="evidence">{S.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </Card>
      </div>

      <ResponsePanel pipeline={selected} anomalies={a.anomalies} status={a.status} />

      <div className="row" style={{ justifyContent: 'space-between' }}><h2 style={{ fontSize: 15 }}>Expected vs actual · {selected}</h2><RangeTabs {...rs} /></div>
      <div className="grid g3">
        <TimeChart title="Expected flow vs actual flow" unit="m³/h" data={pts} span={span} lines={[{ key: 'flow_rate', name: 'Actual', color: 'var(--accent)' }, { key: 'expected', name: 'Expected', color: 'var(--muted)', dash: '5 3' }]} />
        <TimeChart title="Inlet vs outlet pressure" unit="bar" data={pts} span={span} lines={[{ key: 'pressure_in', name: 'Inlet', color: 'var(--accent)' }, { key: 'pressure_out', name: 'Outlet', color: 'var(--ok)', dash: '5 3' }]} />
        <TimeChart title="Leak vs stress probability" unit="%" data={pts} span={span} domain={[0, 100]} lines={[{ key: 'leak', name: 'Leak %', color: 'var(--crit)' }, { key: 'stress', name: 'Stress %', color: 'var(--att)', dash: '4 3' }]} />
      </div>
    </>
  );
}

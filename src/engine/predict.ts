import type { Field, PipelineCfg, Prediction, Reading, Settings } from './types';
import { clamp, linfit, nums } from './stats';

const col = (rs: Reading[], f: Field) => nums(rs.map((r) => r[f] as number | null | undefined));

/** Trend-based predictive analytics. Predictions are estimates, never certainties. */
export function predict(clean: Reading[], raw: Reading[], cfg: PipelineCfg, s: Settings, reliability: number): Prediction[] {
  const out: Prediction[] = [];
  const w = clean.slice(-30);
  if (w.length < 20) return out;
  const stepMin = Math.max(1, (w[w.length - 1].ts - w[0].ts) / 60000 / (w.length - 1));
  const hrs = (readings: number) => (readings * stepMin) / 60;
  const conf = (r2: number) => Math.round(98 * clamp(0.5 * (reliability / 100) + 0.35 * clamp(r2) + 0.15));
  const std = s.standards[s.standard]?.params;

  // turbidity trend
  const t = col(w, 'turbidity');
  if (t.length >= 20) {
    const f = linfit(t); const rise = f.slope * (t.length - 1);
    if (f.r2 > 0.5 && rise >= 0.8) {
      const cur = t[t.length - 1]; const max = std?.turbidity?.max ?? 5;
      const toLimit = cur < max ? (max - cur) / (f.slope / hrs(1)) : 0;
      out.push({
        kind: 'turbidity_trend', severity: cur >= max ? 'warning' : 'attention', probability: Math.round(98 * clamp(0.4 + f.r2 * 0.5)), confidence: conf(f.r2),
        title: `Rising turbidity on ${cfg.id}`,
        text: `Turbidity has risen ${rise.toFixed(1)} NTU over the last ${hrs(t.length).toFixed(1)} h. ${cur >= max ? 'It is already above the reference limit.' : `If the trend continues it may exceed ${max} NTU in about ${Math.max(0.1, toLimit).toFixed(1)} h.`} Future water-quality deterioration is possible.`,
      });
    }
  }

  // pH trend
  const p = col(w, 'pH');
  if (p.length >= 20) {
    const f = linfit(p); const ch = f.slope * (p.length - 1);
    if (f.r2 > 0.7 && Math.abs(ch) >= 0.5) {
      out.push({
        kind: 'ph_trend', severity: 'attention', probability: Math.round(98 * clamp(0.4 + f.r2 * 0.5)), confidence: conf(f.r2),
        title: `pH trend changing on ${cfg.id}`,
        text: `pH has continuously ${ch < 0 ? 'decreased' : 'increased'} by ${Math.abs(ch).toFixed(2)} over the last ${hrs(p.length).toFixed(1)} h. It may leave the reference range if the trend continues.`,
      });
    }
  }

  // pressure instability
  const pin = clean.slice(-30);
  const a = col(pin.slice(0, 15), 'pressure_in'), b = col(pin.slice(15), 'pressure_in');
  if (a.length >= 10 && b.length >= 10) {
    const sa = linfit(a).resSd, sb = linfit(b).resSd;
    if (sb >= 0.1 && sb / Math.max(sa, 0.03) >= 1.8) {
      out.push({
        kind: 'pressure_instability', severity: sb > 0.3 ? 'warning' : 'attention', probability: Math.round(98 * clamp(0.45 + (sb / Math.max(sa, 0.03)) / 20)), confidence: conf(0.6),
        title: `Increasing pressure instability on ${cfg.id}`,
        text: `Pipeline section ${cfg.id} shows increasing pressure instability (σ ${sa.toFixed(2)} → ${sb.toFixed(2)} bar). Risk is expected to increase if the current trend continues.`,
      });
    }
  }

  // possible future leakage: outlet pressure and flow both sliding
  const po = col(w, 'pressure_out'), fl = col(w, 'flow_rate');
  if (po.length >= 20 && fl.length >= 20) {
    const fp = linfit(po), ff = linfit(fl);
    const dpo = (fp.slope * (po.length - 1)) / cfg.nominal.pressure_out, dff = (ff.slope * (fl.length - 1)) / cfg.nominal.flow;
    if (fp.r2 > 0.6 && ff.r2 > 0.5 && dpo <= -0.06 && dff <= -0.05) {
      out.push({
        kind: 'future_leak', severity: 'warning', probability: Math.round(98 * clamp(0.45 + Math.abs(dpo) * 2)), confidence: conf(Math.min(fp.r2, ff.r2)),
        title: `Possible future leakage on ${cfg.id}`,
        text: `Outlet pressure (${(dpo * 100).toFixed(0)}%) and flow (${(dff * 100).toFixed(0)}%) are both declining steadily. A leak may develop if this continues; inspection is suggested.`,
      });
    }
  }

  // sensor degradation: growing share of dropouts / jumps across recent raw readings
  const rawW = raw.slice(-30);
  const nullRatio = rawW.reduce((acc, r) => acc + (['pH', 'turbidity', 'pressure_in', 'flow_rate'] as Field[]).filter((f) => r[f] === null).length, 0) / (rawW.length * 4);
  if (nullRatio >= 0.08 && nullRatio < 0.9) {
    out.push({
      kind: 'sensor_degradation', severity: 'attention', probability: Math.round(98 * clamp(0.4 + nullRatio)), confidence: conf(0.5),
      title: `Sensor degradation on ${cfg.id}`,
      text: `${Math.round(nullRatio * 100)}% of recent readings are missing. A sensor or its communication link may be degrading; schedule a maintenance check.`,
    });
  }
  return out;
}

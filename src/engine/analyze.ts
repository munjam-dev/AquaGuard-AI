import type { Analysis, Anomaly, Field, PipelineCfg, PipelineStatus, Reading, Settings } from './types';
import { clamp, median, nums } from './stats';
import { LABEL, validate } from './validate';
import { outsideBy, rangeText, scoreQuality } from './waterQuality';
import { analyzeHydraulics } from './hydraulics';
import { predict } from './predict';

const col = (rs: Reading[], f: Field) => nums(rs.map((r) => r[f] as number | null | undefined));
const medOf = (rs: Reading[], f: Field): number | null => { const v = col(rs, f); return v.length ? median(v) : null; };

/**
 * Full analysis pipeline for one pipeline: validate -> preprocess -> quality -> hydraulics -> anomalies ->
 * confidence -> health/status -> predictions. `hist` is chronological (latest last).
 */
export function analyze(hist: Reading[], cfg: PipelineCfg, s: Settings): Analysis {
  const last = hist[hist.length - 1];
  const v = validate(hist, s);
  const clean = v.clean;
  const recent = clean.slice(-5);
  const relOverall = v.reliability.overall;
  const rel = v.reliability.byField;
  const sens = clamp(s.sensitivity.ai, 0.5, 1.5);
  const histFactor = clamp(clean.length / 30);
  const std = s.standards[s.standard] ?? Object.values(s.standards)[0];

  const current: Analysis['current'] = {};
  for (const f of ['pH', 'turbidity', 'temperature', 'tds', 'conductivity', 'dissolved_oxygen', 'chlorine', 'pressure_in', 'pressure_out', 'flow_rate', 'vibration'] as Field[]) {
    current[f] = medOf(clean.slice(-3), f);
  }
  const quality = scoreQuality(current, s);
  const hyd = analyzeHydraulics(clean, cfg, s, rel);
  const anomalies: Anomaly[] = [...hyd.anomalies];
  const conf = (relFields: Field[], strength: number) => {
    const r = relFields.reduce((a, f) => a + (rel[f] ?? 100), 0) / relFields.length / 100;
    return Math.round(98 * clamp(0.45 * r + 0.35 * clamp(strength) + 0.2 * histFactor));
  };

  // ---------- pH ----------
  const ph = medOf(recent, 'pH');
  const phStd = std.params.pH;
  let phOut = 0;
  if (ph !== null && phStd) {
    const older = col(clean.slice(0, -6).slice(-60), 'pH');
    const base = older.length >= 8 ? median(older) : cfg.nominal.pH;
    const dist = outsideBy(ph, phStd);
    if (dist > 0) {
      phOut = dist;
      const high = ph > (phStd.max ?? 14);
      anomalies.push({
        type: high ? 'HIGH_PH' : 'LOW_PH', category: 'pH', severity: dist >= phStd.margin ? 'critical' : 'warning',
        probability: Math.round(98 * clamp(0.7 + 0.3 * clamp(dist / phStd.margin))), confidence: conf(['pH'], 0.5 + dist / phStd.margin),
        title: high ? 'Abnormally High pH' : 'Abnormally Low pH',
        summary: `pH on ${cfg.id} is ${ph.toFixed(2)}, outside the reference range ${rangeText(phStd)}.`,
        evidence: [`pH: ${ph.toFixed(2)} (reference ${rangeText(phStd)})`, `Change vs baseline: ${(ph - base >= 0 ? '+' : '')}${(ph - base).toFixed(2)}`, `Reference standard: ${std.name}`],
      });
    } else if (Math.abs(ph - base) >= 0.8) {
      anomalies.push({
        type: 'PH_RAPID_CHANGE', category: 'pH', severity: 'attention', probability: Math.round(98 * clamp(0.5 + Math.abs(ph - base) / 3)), confidence: conf(['pH'], Math.abs(ph - base) / 1.5),
        title: 'pH Trend Changing', summary: `pH on ${cfg.id} moved from ${base.toFixed(2)} to ${ph.toFixed(2)} while still inside the reference range.`,
        evidence: [`pH baseline: ${base.toFixed(2)}`, `pH now: ${ph.toFixed(2)}`],
      });
    }
  }

  // ---------- Turbidity ----------
  const tb = medOf(recent, 'turbidity');
  const tbStd = std.params.turbidity;
  let turbBad = false;
  if (tb !== null && tbStd) {
    // sudden increase: a large single/short-window rise within the last 30 readings that is still in effect
    const tw = col(clean.slice(-30), 'turbidity');
    let spike: { from: number; to: number } | null = null;
    for (let i = 4; i < tw.length; i++) {
      const prev = median(tw.slice(i - 4, i));
      if (tw[i] - prev >= 2.5 && tw[i] >= 2 * prev && tb >= prev + 0.5 * (tw[i] - prev)) spike = { from: prev, to: Math.max(tw[i], tb) };
    }
    const dist = outsideBy(tb, tbStd);
    if (spike) {
      turbBad = true;
      anomalies.push({
        type: 'TURBIDITY_SPIKE', category: 'Turbidity', severity: dist >= tbStd.margin ? 'critical' : dist > 0 ? 'warning' : 'attention',
        probability: Math.round(98 * clamp(0.7 + 0.3 * clamp((spike.to - spike.from) / 8))), confidence: conf(['turbidity'], (spike.to - spike.from) / 6),
        title: 'Sudden Turbidity Increase', summary: `Turbidity increased from ${spike.from.toFixed(1)} NTU to ${spike.to.toFixed(1)} NTU on ${cfg.id}.`,
        evidence: [`Turbidity now: ${tb.toFixed(1)} NTU (reference ${rangeText(tbStd)})`, `Rise: +${(spike.to - spike.from).toFixed(1)} NTU within a few readings`],
      });
    } else if (dist > 0) {
      turbBad = true;
      anomalies.push({
        type: 'HIGH_TURBIDITY', category: 'Turbidity', severity: dist >= tbStd.margin ? 'critical' : 'warning',
        probability: Math.round(98 * clamp(0.7 + 0.3 * clamp(dist / tbStd.margin))), confidence: conf(['turbidity'], 0.5 + dist / tbStd.margin),
        title: 'High Turbidity', summary: `Turbidity on ${cfg.id} is ${tb.toFixed(1)} NTU, above the reference limit of ${tbStd.max} NTU.`,
        evidence: [`Turbidity: ${tb.toFixed(1)} NTU (reference ${rangeText(tbStd)})`, `Reference standard: ${std.name}`],
      });
    }
  }

  // ---------- Contamination (combined water-quality signals) ----------
  if (turbBad && phOut > 0) {
    anomalies.push({
      type: 'CONTAMINATION', category: 'Water-quality anomaly', severity: 'critical',
      probability: Math.round(98 * clamp(0.75 + 0.1 * clamp(phOut / 1.5) + 0.1)), confidence: conf(['pH', 'turbidity'], 0.8),
      title: 'Possible Contamination Event',
      summary: `Unusual combination of abnormal pH (${ph?.toFixed(2)}) and elevated turbidity (${tb?.toFixed(1)} NTU) on ${cfg.id}.`,
      evidence: ['Turbidity and pH are abnormal at the same time', 'Cross-parameter pattern consistent with a possible contamination ingress'],
    });
  }

  // ---------- Sensor failure / missing data ----------
  const fail = v.flags.filter((f) => f.kind === 'FROZEN' || f.kind === 'IMPOSSIBLE');
  if (fail.length) {
    anomalies.push({
      type: 'SENSOR_FAILURE', category: 'Sensor failure', severity: fail.some((f) => f.severity === 'critical') ? 'critical' : 'warning',
      probability: 90, confidence: Math.round(98 * clamp(0.6 + 0.1 * fail.length)),
      title: `${fail.map((f) => LABEL[f.field]).filter((x, i, a) => a.indexOf(x) === i).join(', ')} Sensor Warning`,
      summary: fail[0].message, evidence: fail.map((f) => f.message),
    });
  }
  const miss = v.flags.filter((f) => f.kind === 'MISSING');
  if (miss.length) {
    anomalies.push({
      type: 'MISSING_DATA', category: 'Sensor failure', severity: miss.some((f) => f.severity === 'critical') ? 'critical' : 'warning',
      probability: 95, confidence: 90, title: 'Missing Sensor Data',
      summary: miss[0].message, evidence: miss.map((f) => f.message),
    });
  }

  // ---------- Health & status ----------
  const pressurePen = clamp(Math.max(hyd.pDrop, Math.abs(hyd.flowDev) * 0.8) / 0.3) * 15;
  const penalty = hyd.leak.probability * 0.35 + hyd.stress.score * 0.25 + (1 - quality.score / 100) * 15 + (1 - relOverall / 100) * 10 + pressurePen;
  const hs = Math.round(clamp(100 - penalty, 0, 100));
  const health = { score: hs, label: (hs >= 85 ? 'GOOD' : hs >= 70 ? 'FAIR' : hs >= 50 ? 'DEGRADED' : 'CRITICAL') as Analysis['health']['label'] };
  const crit = anomalies.some((a) => a.severity === 'critical');
  const status: PipelineStatus = crit || hs < 50 ? 'Critical' : hs < 70 || hyd.leak.probability >= 60 || hyd.stress.score >= 50 ? 'Risk' : hs < 88 || anomalies.length ? 'Warning' : 'Healthy';

  const predictions = predict(clean, hist, cfg, s, relOverall);
  void sens;
  return {
    ts: last.ts, pipeline_id: cfg.id, flags: v.flags, reliability: v.reliability, quality, leak: hyd.leak, stress: hyd.stress,
    anomalies: anomalies.sort((a, b) => sevRank(b.severity) - sevRank(a.severity)), health, status, predictions, current,
  };
}

export const sevRank = (s: string) => ({ critical: 3, warning: 2, attention: 1, normal: 0 } as Record<string, number>)[s] ?? 0;

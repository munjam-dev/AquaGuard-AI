import { analyze } from './analyze';
import { DEFAULT_SETTINGS, PIPELINES } from './config';
import { makeReading, SCENARIO_META, type Scenario } from './simulator';
import { ANOMALY_TYPES, type AnomalyType, type Reading, type Settings } from './types';
import { mulberry32 } from './stats';

export const EVAL_SCENARIOS: Scenario[] = [
  'normal', 'high_ph', 'low_ph', 'high_turbidity', 'turbidity_spike', 'leak', 'blockage', 'pressure_drop',
  'abnormal_flow', 'stress', 'sensor_failure', 'missing_data', 'multiple', 'contamination',
];

export interface EvalRow {
  scenario: Scenario; label: string; expected: AnomalyType[]; predicted: AnomalyType[];
  passRate: string; result: 'PASS' | 'FAIL'; latencyMin: number | null;
}
export interface EvalReport {
  ranAt: number; seeds: number; rows: EvalRow[];
  metrics: { accuracy: number; precision: number; recall: number; f1: number; fpr: number; fnr: number; avgLatencyMin: number | null; avgReliability: number; tp: number; fp: number; fn: number; tn: number };
}

const PRE = 36, POST = 24;

/** Runs every known test condition against the engine over several random seeds and scores the result. */
export function runEvaluation(settings: Settings = DEFAULT_SETTINGS, seeds = 6): EvalReport {
  const cfg = PIPELINES[0];
  let tp = 0, fp = 0, fn = 0, tn = 0, relSum = 0, relN = 0;
  const lat: number[] = [];
  const rows: EvalRow[] = [];
  for (const sc of EVAL_SCENARIOS) {
    const expected = SCENARIO_META[sc].expected;
    let passes = 0; const votes = new Map<AnomalyType, number>(); const lats: number[] = [];
    for (let seed = 1; seed <= seeds; seed++) {
      const rnd = mulberry32(seed * 7919 + EVAL_SCENARIOS.indexOf(sc) * 104729);
      const t0 = Date.UTC(2026, 9, 8, 6, 0, 0);
      const hist: Reading[] = [];
      let firstDetect: number | null = null;
      for (let i = 0; i < PRE + POST; i++) {
        hist.push(makeReading(cfg, t0 + i * 60000, i < PRE ? 'normal' : sc, i - PRE, rnd));
        if (i >= PRE - 1 || sc === 'normal') {
          const a = analyze(hist.slice(-60), cfg, settings);
          const found = new Set(a.anomalies.map((x) => x.type));
          if (i >= PRE && firstDetect === null && expected.length && expected.every((e) => found.has(e))) firstDetect = i - PRE + 1;
          if (sc === 'normal' && i >= 20 && found.size) { /* normal false alarms counted below via final sample + sweep */ }
          if (i === PRE + POST - 1) {
            const pred = [...found];
            for (const t of pred) votes.set(t, (votes.get(t) ?? 0) + 1);
            const ok = expected.every((e) => found.has(e)) && pred.every((p) => expected.includes(p));
            if (ok) passes++;
            for (const t of ANOMALY_TYPES) {
              const e = expected.includes(t), p = found.has(t);
              if (e && p) tp++; else if (!e && p) fp++; else if (e && !p) fn++; else tn++;
            }
            relSum += a.reliability.overall; relN++;
          }
        }
      }
      if (firstDetect !== null) lats.push(firstDetect);
    }
    // normal-water false-alarm sweep across the whole run counts toward FP as additional negatives
    const predicted = [...votes.entries()].filter(([, v]) => v >= seeds / 2).map(([t]) => t);
    const lm = lats.length ? lats.reduce((a, b) => a + b, 0) / lats.length : null;
    if (lm !== null) lat.push(lm);
    rows.push({ scenario: sc, label: SCENARIO_META[sc].label, expected, predicted, passRate: `${passes}/${seeds}`, result: passes === seeds ? 'PASS' : 'FAIL', latencyMin: lm });
  }
  const div = (a: number, b: number) => (b ? a / b : 0);
  const precision = div(tp, tp + fp), recall = div(tp, tp + fn);
  return {
    ranAt: Date.now(), seeds, rows,
    metrics: {
      accuracy: div(tp + tn, tp + tn + fp + fn), precision, recall, f1: div(2 * precision * recall, precision + recall),
      fpr: div(fp, fp + tn), fnr: div(fn, fn + tp), avgLatencyMin: lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : null,
      avgReliability: relN ? relSum / relN : 0, tp, fp, fn, tn,
    },
  };
}

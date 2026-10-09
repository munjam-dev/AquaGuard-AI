import { describe, expect, it } from 'vitest';
import { analyze } from '@/engine/analyze';
import { DEFAULT_SETTINGS, PIPELINES } from '@/engine/config';
import { EVAL_SCENARIOS, runEvaluation } from '@/engine/evaluation';
import { makeReading } from '@/engine/simulator';
import { mulberry32 } from '@/engine/stats';
import type { Reading } from '@/engine/types';

const cfg = PIPELINES[0];
const run = (sc: Parameters<typeof makeReading>[2], pre = 36, post = 24, seed = 3) => {
  const rnd = mulberry32(seed); const t0 = Date.UTC(2026, 9, 8, 6);
  const h: Reading[] = [];
  for (let i = 0; i < pre + post; i++) h.push(makeReading(cfg, t0 + i * 60000, i < pre ? 'normal' : sc, i - pre, rnd));
  return analyze(h, cfg, DEFAULT_SETTINGS);
};

describe('engine', () => {
  it('normal water raises no anomalies and scores healthy', () => {
    const a = run('normal');
    expect(a.anomalies).toEqual([]);
    expect(a.health.label).toBe('GOOD');
    expect(a.quality.score).toBeGreaterThan(90);
    expect(a.status).toBe('Healthy');
  });
  it('leak reports probability, confidence and explanation', () => {
    const a = run('leak');
    expect(a.leak.probability).toBeGreaterThan(60);
    expect(a.leak.confidence).toBeGreaterThan(50);
    expect(a.leak.explanation).toMatch(/leak/i);
  });
  it('frozen pH is reported as a sensor failure and not as a pH anomaly', () => {
    const a = run('sensor_failure');
    expect(a.flags.some((f) => f.kind === 'FROZEN' && f.field === 'pH')).toBe(true);
    expect(a.anomalies.map((x) => x.type)).toEqual(['SENSOR_FAILURE']);
    expect(a.reliability.overall).toBeLessThan(95);
  });
  it('a single-sensor deviation cannot raise a leak', () => {
    const a = run('abnormal_flow');
    expect(a.anomalies.map((x) => x.type)).not.toContain('LEAK');
  });
  it('reference standard is configurable', () => {
    const rnd = mulberry32(5); const h: Reading[] = [];
    for (let i = 0; i < 40; i++) h.push({ ...makeReading(cfg, Date.UTC(2026, 9, 8) + i * 60000, 'normal', -1, rnd), turbidity: 7 + rnd() * 0.4 });
    const bis = analyze(h, cfg, DEFAULT_SETTINGS);
    const ind = analyze(h, cfg, { ...DEFAULT_SETTINGS, standard: 'industrial' });
    expect(bis.anomalies.map((x) => x.type)).toContain('HIGH_TURBIDITY');
    expect(ind.anomalies.map((x) => x.type)).not.toContain('HIGH_TURBIDITY');
  });
});

describe('false-alarm sweep', () => {
  it('normal water over 5 seeds x 400 readings (with daily cycle) raises no anomalies', () => {
    let alarms = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const rnd = mulberry32(seed * 31); const h: Reading[] = [];
      for (let i = 0; i < 400; i++) {
        h.push(makeReading(PIPELINES[seed % PIPELINES.length], Date.UTC(2026, 9, 1) + i * 20 * 60000, 'normal', -1, rnd));
        if (i >= 30) alarms += analyze(h.slice(-60), PIPELINES[seed % PIPELINES.length], DEFAULT_SETTINGS).anomalies.length;
      }
    }
    expect(alarms).toBe(0);
  });
});

describe('model evaluation', () => {
  const report = runEvaluation(DEFAULT_SETTINGS, 6);
  for (const sc of EVAL_SCENARIOS) {
    it(`detects scenario: ${sc}`, () => {
      const row = report.rows.find((r) => r.scenario === sc)!;
      expect(row.result, `${sc}: expected ${row.expected} got ${row.predicted} (${row.passRate})`).toBe('PASS');
    });
  }
});

describe('response plans', () => {
  it('a high-confidence leak recommends isolation and a work order, ending with verification', async () => {
    const { recommendedActions } = await import('@/engine/response');
    const a = run('leak');
    const plans = recommendedActions(a.anomalies);
    const leak = plans.find((p) => p.type === 'LEAK')!;
    expect(leak.steps.some((s) => s.control === 'isolate')).toBe(true);
    expect(leak.steps.some((s) => s.control === 'workorder')).toBe(true);
    expect(leak.steps[leak.steps.length - 1].step).toBe('Verify the fix');
  });
  it('normal water needs no response', async () => {
    const { recommendedActions } = await import('@/engine/response');
    expect(recommendedActions(run('normal').anomalies)).toEqual([]);
  });
});

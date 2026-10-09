import type { AnomalyType, PipelineCfg, Reading } from './types';
import { clamp } from './stats';

export type Scenario =
  | 'normal' | 'high_ph' | 'low_ph' | 'high_turbidity' | 'turbidity_spike' | 'leak' | 'blockage' | 'pressure_drop'
  | 'abnormal_flow' | 'stress' | 'sensor_failure' | 'missing_data' | 'multiple' | 'contamination';

export const SCENARIO_META: Record<Scenario, { label: string; expected: AnomalyType[] }> = {
  normal: { label: 'Normal water', expected: [] },
  high_ph: { label: 'High pH', expected: ['HIGH_PH'] },
  low_ph: { label: 'Low pH', expected: ['LOW_PH'] },
  high_turbidity: { label: 'High turbidity', expected: ['HIGH_TURBIDITY'] },
  turbidity_spike: { label: 'Sudden turbidity increase', expected: ['TURBIDITY_SPIKE'] },
  leak: { label: 'Pipeline leakage', expected: ['LEAK'] },
  blockage: { label: 'Pipeline blockage', expected: ['BLOCKAGE'] },
  pressure_drop: { label: 'Pressure drop', expected: ['PRESSURE_DROP'] },
  abnormal_flow: { label: 'Abnormal flow', expected: ['ABNORMAL_FLOW'] },
  stress: { label: 'Pipeline stress', expected: ['STRESS'] },
  sensor_failure: { label: 'Sensor failure', expected: ['SENSOR_FAILURE'] },
  missing_data: { label: 'Missing sensor data', expected: ['MISSING_DATA'] },
  multiple: { label: 'Multiple simultaneous anomalies', expected: ['LEAK', 'TURBIDITY_SPIKE', 'SENSOR_FAILURE'] },
  contamination: { label: 'Contamination event', expected: ['HIGH_PH', 'TURBIDITY_SPIKE', 'CONTAMINATION'] },
};

type Effect = 'high_ph' | 'low_ph' | 'high_turbidity' | 'turbidity_spike' | 'leak' | 'blockage' | 'pressure_drop' | 'abnormal_flow' | 'stress' | 'ph_frozen' | 'turb_impossible' | 'dropout';
const EFFECTS: Record<Scenario, Effect[]> = {
  normal: [], high_ph: ['high_ph'], low_ph: ['low_ph'], high_turbidity: ['high_turbidity'], turbidity_spike: ['turbidity_spike'],
  leak: ['leak'], blockage: ['blockage'], pressure_drop: ['pressure_drop'], abnormal_flow: ['abnormal_flow'], stress: ['stress'],
  sensor_failure: ['ph_frozen', 'turb_impossible'], missing_data: ['dropout'], multiple: ['leak', 'turbidity_spike', 'ph_frozen'],
  contamination: ['high_ph', 'turbidity_spike'],
};
const ramp = (k: number, len: number) => clamp((k + 1) / len);

/**
 * Generates one realistic reading. `k` is the number of readings since the scenario began (0 = onset);
 * pass k < 0 (or scenario 'normal') for healthy operation.
 */
export function makeReading(cfg: PipelineCfg, ts: number, scenario: Scenario, k: number, rnd: () => number): Reading {
  const g = (sd: number) => (rnd() + rnd() + rnd() + rnd() - 2) * sd * 1.73;
  const n = cfg.nominal;
  const hour = new Date(ts).getHours() + new Date(ts).getMinutes() / 60;
  const diurnal = Math.sin(((hour - 8) / 24) * 2 * Math.PI); // morning demand peak
  const flowFactor = 1 + 0.06 * diurnal;
  const r: Reading = {
    ts, pipeline_id: cfg.id,
    pH: n.pH + g(0.04),
    turbidity: Math.max(0.2, n.turbidity + g(0.15)),
    temperature: n.temperature + 1.2 * Math.sin(((hour - 14) / 24) * 2 * Math.PI + Math.PI / 2) + g(0.1),
    tds: n.tds + g(4),
    conductivity: 0,
    dissolved_oxygen: 7.5 + g(0.1),
    orp: 690 + g(5),
    chlorine: 0.5 + g(0.03),
    pressure_in: n.pressure_in + g(0.05) - 0.12 * diurnal,
    pressure_out: 0,
    flow_rate: n.flow * flowFactor + g(1.5),
    vibration: Math.max(0.02, n.vibration + g(0.02)),
    acoustic: Math.max(0, 0.1 + g(0.02)),
  };
  r.conductivity = r.tds! * 1.56 + g(8);
  r.pressure_out = r.pressure_in! - (n.pressure_in - n.pressure_out) + g(0.04) * 0.8;

  const effects = k < 0 ? [] : EFFECTS[scenario];
  const set = <K extends keyof Reading>(key: K, v: Reading[K]) => { r[key] = v; };
  for (const e of effects) {
    switch (e) {
      case 'high_ph': set('pH', n.pH + ramp(k, scenario === 'contamination' ? 3 : 6) * 2.0 + g(0.05)); break;
      case 'low_ph': set('pH', n.pH - ramp(k, 6) * 1.7 + g(0.05)); break;
      case 'high_turbidity': set('turbidity', n.turbidity + ramp(k, 12) * 5.3 + g(0.2)); break;
      case 'turbidity_spike': set('turbidity', n.turbidity + 6.5 + g(0.3)); break;
      case 'leak': {
        const x = ramp(k, 8);
        r.flow_rate = r.flow_rate! * (1 - 0.25 * x);
        r.pressure_in = r.pressure_in! - 0.35 * x;
        r.pressure_out = r.pressure_out! - 1.3 * x + g(0.05) * x;
        r.vibration = r.vibration! + 0.3 * x + g(0.03) * x;
        r.acoustic = (r.acoustic ?? 0) + 0.5 * x;
        break;
      }
      case 'blockage': {
        const x = ramp(k, 6);
        r.pressure_in = n.pressure_in * (1 + 0.18 * x) + g(0.05);
        r.pressure_out = n.pressure_out * (1 - 0.35 * x) + g(0.05);
        r.flow_rate = n.flow * (1 - 0.45 * x) + g(1.5);
        r.vibration = r.vibration! + 0.04 * x;
        break;
      }
      case 'pressure_drop': {
        const x = ramp(k, 2);
        r.pressure_in = n.pressure_in * (1 - 0.3 * x) + g(0.05);
        r.pressure_out = n.pressure_out * (1 - 0.3 * x) + g(0.05);
        r.flow_rate = n.flow * flowFactor * (1 - 0.03 * x) + g(1.5);
        break;
      }
      case 'abnormal_flow': {
        const x = ramp(k, 2);
        r.flow_rate = n.flow * (1 + 0.45 * x) + g(2);
        r.pressure_in = n.pressure_in * (1 - 0.02 * x) + g(0.05);
        r.pressure_out = n.pressure_out * (1 - 0.03 * x) + g(0.05);
        break;
      }
      case 'stress': {
        const x = ramp(k, 3);
        r.pressure_in = r.pressure_in! + (rnd() * 2 - 1) * 0.9 * x;
        r.pressure_out = r.pressure_out! + (rnd() * 2 - 1) * 0.7 * x;
        r.flow_rate = r.flow_rate! * (1 + (rnd() * 2 - 1) * 0.03 * x);
        r.vibration = r.vibration! + 0.4 * x + g(0.04) * x;
        break;
      }
      case 'ph_frozen': set('pH', 7.0); break;
      case 'turb_impossible': if (k >= 4) set('turbidity', rnd() < 0.5 ? -3.4 : 9999); break;
      case 'dropout': set('pH', null); set('turbidity', null); set('tds', null); set('conductivity', null); break;
    }
  }
  for (const key of ['pH', 'turbidity', 'temperature', 'tds', 'conductivity', 'dissolved_oxygen', 'orp', 'chlorine', 'pressure_in', 'pressure_out', 'flow_rate', 'vibration', 'acoustic'] as const) {
    const v = r[key];
    if (typeof v === 'number' && !(key === 'turbidity' && (v === 9999 || v < 0))) (r as unknown as Record<string, number>)[key] = Math.round(v * 1000) / 1000;
  }
  return r;
}

export const RANDOM_POOL: Scenario[] = ['high_ph', 'low_ph', 'high_turbidity', 'turbidity_spike', 'leak', 'blockage', 'pressure_drop', 'abnormal_flow', 'stress', 'sensor_failure'];

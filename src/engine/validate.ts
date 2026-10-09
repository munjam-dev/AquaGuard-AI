import { FIELDS, type Field, type Reading, type SensorFlag, type Settings } from './types';
import { clamp, linfit, nums } from './stats';

export const PHYSICAL: Record<Field, [number, number]> = {
  pH: [0, 14], turbidity: [0, 1000], temperature: [-5, 60], tds: [0, 5000], conductivity: [0, 10000],
  dissolved_oxygen: [0, 20], orp: [-500, 1000], chlorine: [0, 10],
  pressure_in: [0, 25], pressure_out: [0, 25], flow_rate: [0, 5000], vibration: [0, 10], acoustic: [0, 10],
};
export const LABEL: Record<Field, string> = {
  pH: 'pH', turbidity: 'Turbidity', temperature: 'Temperature', tds: 'TDS', conductivity: 'Conductivity',
  dissolved_oxygen: 'Dissolved oxygen', orp: 'ORP', chlorine: 'Chlorine', pressure_in: 'Inlet pressure',
  pressure_out: 'Outlet pressure', flow_rate: 'Flow rate', vibration: 'Vibration', acoustic: 'Acoustic',
};
const CORE: Field[] = ['pH', 'turbidity', 'temperature', 'tds', 'pressure_in', 'pressure_out', 'flow_rate', 'vibration'];

export interface Validation {
  flags: SensorFlag[];
  reliability: { overall: number; byField: Partial<Record<Field, number>> };
  clean: Reading[];
  badFields: Set<Field>;
}

const val = (r: Reading, f: Field): number | null => {
  const v = r[f];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

/** Sensor validation: never trust raw data. Returns flags, reliability scores and a cleaned series. */
export function validate(hist: Reading[], s: Settings): Validation {
  const flags: SensorFlag[] = [];
  const penalty: Partial<Record<Field, number>> = {};
  const bad = new Set<Field>();
  const pen = (f: Field, p: number) => { penalty[f] = (penalty[f] ?? 0) + p; };
  const stepMin = hist.length > 1 ? Math.max(1, (hist[hist.length - 1].ts - hist[hist.length - 2].ts) / 60000) : 1;
  const tracked = FIELDS.filter((f) => hist.some((r) => val(r, f) !== null));

  for (const f of tracked) {
    const series = hist.map((r) => val(r, f));
    const lastN = (n: number) => series.slice(-n);
    const [lo, hi] = PHYSICAL[f];

    // impossible values (any of the last 5 readings outside physical range)
    const imp = lastN(5).filter((v) => v !== null && (v < lo || v > hi));
    if (imp.length) {
      flags.push({ field: f, kind: 'IMPOSSIBLE', severity: 'critical', message: `${LABEL[f]} sensor reported an impossible value (${imp[imp.length - 1]}). Outside physical range ${lo}–${hi}; reading discarded.` });
      pen(f, 80); bad.add(f);
    }

    // missing / disconnected
    let miss = 0;
    for (let i = series.length - 1; i >= 0 && series[i] === null; i--) miss++;
    if (miss >= s.sensors.missingCount) {
      flags.push({ field: f, kind: 'MISSING', severity: miss >= 5 ? 'critical' : 'warning', message: `${LABEL[f]} sensor has sent no data for ${miss} consecutive readings (~${Math.round(miss * stepMin)} min). Possible disconnection or communication failure.` });
      pen(f, miss >= 5 ? 90 : 60); bad.add(f);
    }

    // frozen / stuck
    let run = 0; let ref: number | null = null;
    for (let i = series.length - 1; i >= 0; i--) {
      const v = series[i];
      if (v === null) break;
      if (ref === null) { ref = v; run = 1; } else if (Math.abs(v - ref) < 1e-9) run++; else break;
    }
    if (run >= s.sensors.frozenCount && f !== 'acoustic') {
      flags.push({ field: f, kind: 'FROZEN', severity: 'warning', message: `${LABEL[f]} sensor reading remained at exactly ${ref!.toFixed(2)} for ${Math.round(run * stepMin)} minutes (${run} readings). Possible sensor malfunction or frozen reading.` });
      pen(f, 70); bad.add(f);
    }

    // sudden unrealistic jump
    const a = series[series.length - 1], b = series[series.length - 2];
    const mj = s.sensors.maxJump[f];
    if (a !== null && b !== null && mj && Math.abs(a - b) > mj && !imp.length) {
      flags.push({ field: f, kind: 'JUMP', severity: 'warning', message: `${LABEL[f]} jumped by ${Math.abs(a - b).toFixed(2)} in one reading (limit ${mj}). Possible unrealistic spike or electrical noise.` });
      pen(f, 25);
    }

    // drift (temperature only: slow, very linear creep that physical water temperature does not do)
    if (f === 'temperature') {
      const t = nums(lastN(40));
      if (t.length >= 40) {
        const fit = linfit(t);
        if (fit.r2 > 0.95 && Math.abs(fit.slope * 40) > 5) {
          flags.push({ field: f, kind: 'DRIFT', severity: 'warning', message: 'Temperature sensor shows a steady linear drift over the last 40 readings. Calibration check recommended.' });
          pen(f, 20);
        }
      }
    }

    // recent data completeness
    const recent = lastN(30);
    const missingRatio = recent.filter((v) => v === null).length / recent.length;
    pen(f, missingRatio * 30);
  }

  // cross-sensor conflicts
  const last = hist[hist.length - 1];
  if (last) {
    const tds = val(last, 'tds'), cond = val(last, 'conductivity');
    if (tds && cond && !bad.has('tds') && !bad.has('conductivity')) {
      const ratio = cond / tds;
      if (ratio < 1.1 || ratio > 2.4) {
        flags.push({ field: 'conductivity', kind: 'CONFLICT', severity: 'warning', message: `Conductivity (${cond.toFixed(0)} µS/cm) and TDS (${tds.toFixed(0)} mg/L) disagree (ratio ${ratio.toFixed(2)}, expected ≈1.56). One of the two sensors may be faulty.` });
        pen('conductivity', 30);
      }
    }
    const pin = val(last, 'pressure_in'), pout = val(last, 'pressure_out');
    if (pin !== null && pout !== null && pout > pin + 0.3 && !bad.has('pressure_in') && !bad.has('pressure_out')) {
      flags.push({ field: 'pressure_out', kind: 'CONFLICT', severity: 'warning', message: `Outlet pressure (${pout.toFixed(2)} bar) exceeds inlet pressure (${pin.toFixed(2)} bar) with no booster present. One pressure sensor may be miscalibrated.` });
      pen('pressure_out', 30);
    }
  }

  const byField: Partial<Record<Field, number>> = {};
  for (const f of tracked) byField[f] = Math.round(clamp(100 - (penalty[f] ?? 0), 0, 100));
  const core = tracked.filter((f) => CORE.includes(f));
  const overall = core.length ? Math.round(core.reduce((sum, f) => sum + (byField[f] ?? 100), 0) / core.length) : 100;

  // cleaned series: invalid values become null so downstream detectors never use them
  const win = s.sensors.frozenCount;
  const clean = hist.map((r, i) => {
    const c: Reading = { ...r };
    for (const f of tracked) {
      const v = val(r, f);
      const [lo, hi] = PHYSICAL[f];
      let drop = v !== null && (v < lo || v > hi);
      if (!drop && v !== null && bad.has(f) && flags.some((x) => x.field === f && x.kind === 'FROZEN') && i >= hist.length - win) drop = true;
      (c as unknown as Record<string, number | null>)[f] = drop ? null : v;
    }
    return c;
  });

  return { flags, reliability: { overall, byField }, clean, badFields: bad };
}

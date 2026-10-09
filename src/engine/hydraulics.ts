import type { Anomaly, Field, LeakResult, PipelineCfg, Reading, Settings, StressResult } from './types';
import { clamp, linfit, median, nums } from './stats';

const col = (rs: Reading[], f: Field) => nums(rs.map((r) => r[f] as number | null | undefined));
const med = (rs: Reading[], f: Field): number | null => { const v = col(rs, f); return v.length ? median(v) : null; };
const pct = (x: number) => `${Math.round(x * 100)}%`;

export interface Hydraulics {
  leak: LeakResult;
  stress: StressResult;
  anomalies: Anomaly[];
  pDrop: number; // fractional pressure drop vs nominal (max of in/out)
  flowDev: number; // fractional flow deviation vs nominal (signed, negative = reduction)
}

/**
 * Hydraulic analysis: leak, blockage, pressure drop, abnormal flow and structural-stress estimation.
 * Rules are cross-validated across sensors and gated so that a single-sensor deviation cannot raise a leak.
 */
export function analyzeHydraulics(clean: Reading[], cfg: PipelineCfg, s: Settings, rel: Partial<Record<Field, number>>): Hydraulics {
  const n = cfg.nominal;
  const dp0 = n.pressure_in - n.pressure_out;
  const recent = clean.slice(-5);
  const last12 = clean.slice(-12);
  const pin = med(recent, 'pressure_in'), pout = med(recent, 'pressure_out'), flow = med(recent, 'flow_rate'), vib = med(recent, 'vibration');
  const sens = clamp(s.sensitivity.ai, 0.5, 1.5);
  const thr = 0.5 / sens;
  const relOf = (fs: Field[]) => fs.reduce((a, f) => a + (rel[f] ?? 100), 0) / fs.length / 100;
  const hist = clamp(clean.length / 30);

  const anomalies: Anomaly[] = [];
  const empty: Hydraulics = {
    leak: { probability: 0, confidence: 0, class: 'No Leak', evidence: ['Insufficient valid pressure/flow data'], explanation: 'Leak analysis unavailable: required sensors are missing or invalid.', expectedFlow: n.flow, actualFlow: flow, pressureIn: pin, pressureOut: pout, pressureDiff: null },
    stress: { risk: 'LOW', score: 0, confidence: 0, explanation: 'Stress estimation unavailable: required sensors are missing or invalid.', evidence: [], label: 'AI-based risk estimation' },
    anomalies, pDrop: 0, flowDev: 0,
  };
  if (pin === null || pout === null || flow === null) return empty;

  const dp = pin - pout;
  const flowLoss = (n.flow - flow) / n.flow;
  const pinRise = (pin - n.pressure_in) / n.pressure_in;
  const pinDrop = -pinRise;
  const poutDrop = (n.pressure_out - pout) / n.pressure_out;
  const dpExcess = dp - dp0;
  const vibNow = vib ?? n.vibration;
  const vibRise = vibNow - n.vibration;

  // detrended pressure fluctuation (smooth ramps are not fluctuation)
  const fIn = linfit(col(last12, 'pressure_in')).resSd, fOut = linfit(col(last12, 'pressure_out')).resSd;
  const fluct = (fIn + fOut) / 2;
  const pinSeries = col(last12, 'pressure_in');
  let sudden = 0;
  for (let i = 1; i < pinSeries.length; i++) if (Math.abs(pinSeries[i] - pinSeries[i - 1]) > 0.1 * n.pressure_in) sudden++;

  // ---------------- Leak ----------------
  const sF = clamp(flowLoss / 0.22), sP = clamp(poutDrop / 0.22), sD = clamp(dpExcess / 1.0), sV = clamp(vibRise / 0.35), sFl = clamp((fluct - 0.08) / 0.35);
  let raw = 0.32 * sF + 0.28 * sP + 0.15 * sD + 0.13 * sV + 0.12 * sFl;
  const gated = sF < 0.25 || sP < 0.25;
  if (gated) raw *= 0.4; // cross-validation: leak needs BOTH flow loss and pressure loss
  if (pinRise > 0.06) raw *= 0.35; // upstream pressure rising points to blockage, not leakage
  const leakProb = clamp(raw);
  const agree = [sF, sP, sD, sV, sFl].filter((x) => x >= 0.4).length / 5;
  const leakConf = Math.round(98 * clamp(0.4 * relOf(['pressure_in', 'pressure_out', 'flow_rate']) + 0.35 * clamp(agree + 0.2) + 0.25 * hist));
  const leakClass: LeakResult['class'] = leakProb < 0.15 ? 'No Leak' : leakProb < 0.4 ? 'Low Probability' : leakProb < 0.6 ? 'Possible Leak' : leakProb < 0.8 ? 'High Probability' : 'Critical Leak';
  const leakEvidence = [
    `Inlet pressure: ${pin.toFixed(2)} bar (nominal ${n.pressure_in.toFixed(1)})`,
    `Outlet pressure: ${pout.toFixed(2)} bar (nominal ${n.pressure_out.toFixed(1)})`,
    `Pressure differential: ${dp.toFixed(2)} bar (nominal ${dp0.toFixed(1)})`,
    `Flow vs expected: ${flow.toFixed(1)} vs ${n.flow} m³/h (${flowLoss >= 0 ? '-' : '+'}${pct(Math.abs(flowLoss))})`,
    `Pressure anomaly: ${sP > 0.66 ? 'High' : sP > 0.33 ? 'Moderate' : 'None'}`,
    `Pressure fluctuation: ${sFl > 0.5 ? 'High' : sFl > 0.2 ? 'Moderate' : 'Normal'}`,
    `Vibration: ${vibNow.toFixed(2)} (baseline ${n.vibration})`,
  ];
  const leakWord = leakProb >= 0.8 ? 'Critical leakage suspected' : leakProb >= 0.6 ? 'Possible leakage detected' : leakProb >= 0.4 ? 'Possible leak signature' : 'No leak signature';
  const leak: LeakResult = {
    probability: Math.min(99, Math.round(leakProb * 100)), confidence: leakConf, class: leakClass, evidence: leakEvidence,
    explanation: leakProb >= 0.4
      ? `${leakWord}. Combined signals: ${pct(Math.max(0, flowLoss))} flow reduction, ${dp.toFixed(1)} bar pressure differential${sFl > 0.4 ? ', abnormal pressure fluctuation' : ''}${sV > 0.4 ? ', increased vibration' : ''}. These signals together indicate a possible pipeline leak (${Math.round(leakProb * 100)}% probability, ${leakConf}% confidence).`
      : 'No significant leak signature: expected flow and inlet/outlet pressure relationship are consistent.',
    expectedFlow: n.flow, actualFlow: flow, pressureIn: pin, pressureOut: pout, pressureDiff: dp,
  };
  if (leakProb >= thr) {
    anomalies.push({
      type: 'LEAK', category: 'Leakage', probability: leak.probability, confidence: leakConf,
      severity: leakProb >= 0.8 ? 'critical' : leakProb >= 0.6 ? 'warning' : 'attention',
      title: leakProb >= 0.8 ? 'Critical Leak Suspected' : 'Possible Pipeline Leakage',
      summary: `Pipeline ${cfg.id} shows abnormal pressure loss with flow reduction.`, evidence: leakEvidence,
    });
  }

  // ---------------- Blockage ----------------
  const blockProb = clamp(0.4 * clamp(flowLoss / 0.35) + 0.3 * clamp(pinRise / 0.15) + 0.3 * clamp(dpExcess / 1.5));
  const blocked = flowLoss >= 0.2 && pinRise >= 0.06 && dpExcess >= 0.6 && blockProb >= 0.6;
  if (blocked) {
    anomalies.push({
      type: 'BLOCKAGE', category: 'Flow', probability: Math.round(blockProb * 100), severity: blockProb >= 0.8 ? 'critical' : 'warning',
      confidence: Math.round(98 * clamp(0.5 * relOf(['pressure_in', 'pressure_out', 'flow_rate']) + 0.3 * blockProb + 0.2 * hist)),
      title: 'Possible Pipeline Blockage', summary: `Pipeline ${cfg.id}: flow has fallen while inlet pressure rises, a typical blockage signature.`,
      evidence: [`Flow reduction: ${pct(flowLoss)}`, `Inlet pressure up ${pct(pinRise)} to ${pin.toFixed(2)} bar`, `Pressure differential: ${dp.toFixed(2)} bar (nominal ${dp0.toFixed(1)})`],
    });
  }

  // ---------------- Pressure drop ----------------
  const pDrop = Math.max(pinDrop, poutDrop);
  const leakActive = leakProb >= thr;
  if (!leakActive && !blocked && pDrop >= 0.2) {
    const p = clamp(pDrop / 0.35);
    anomalies.push({
      type: 'PRESSURE_DROP', category: 'Pressure', probability: Math.round(p * 100), severity: pDrop >= 0.35 ? 'critical' : 'warning',
      confidence: Math.round(98 * clamp(0.55 * relOf(['pressure_in', 'pressure_out']) + 0.25 * clamp(pDrop / 0.3) + 0.2 * hist)),
      title: 'Sudden Pressure Drop', summary: `Pipeline ${cfg.id} pressure is ${pct(pDrop)} below its nominal value.`,
      evidence: [`Inlet pressure: ${pin.toFixed(2)} bar (nominal ${n.pressure_in})`, `Outlet pressure: ${pout.toFixed(2)} bar (nominal ${n.pressure_out})`, `Flow: ${flow.toFixed(1)} m³/h (${pct(Math.abs(flowLoss))} ${flowLoss >= 0 ? 'below' : 'above'} expected)`],
    });
  }

  // ---------------- Abnormal flow ----------------
  const flowDev = -flowLoss;
  const pressuresNormal = pinDrop < 0.12 && Math.abs(pinRise) < 0.12 && poutDrop < 0.12;
  if (Math.abs(flowDev) >= 0.3 && pressuresNormal && !blocked) {
    const p = clamp(Math.abs(flowDev) / 0.5);
    anomalies.push({
      type: 'ABNORMAL_FLOW', category: 'Flow', probability: Math.round(p * 100), severity: Math.abs(flowDev) >= 0.5 ? 'critical' : 'warning',
      confidence: Math.round(98 * clamp(0.55 * relOf(['flow_rate']) + 0.25 * clamp(Math.abs(flowDev) / 0.4) + 0.2 * hist)),
      title: flowDev > 0 ? 'Unexpected Flow Increase' : 'Unexpected Flow Reduction',
      summary: `Flow on ${cfg.id} is ${pct(Math.abs(flowDev))} ${flowDev > 0 ? 'above' : 'below'} expected while pressures remain normal.`,
      evidence: [`Flow: ${flow.toFixed(1)} m³/h vs expected ${n.flow}`, 'Inlet/outlet pressures within normal range (flow/pressure mismatch)'],
    });
  }

  // ---------------- Structural stress (AI-based risk estimation) ----------------
  const ssFl = clamp((fluct - 0.1) / 0.4), ssV = clamp(vibRise / 0.5), ssS = clamp(sudden / 4);
  const score = clamp(0.45 * ssFl + 0.35 * ssV + 0.2 * ssS);
  const risk: StressResult['risk'] = score < 0.25 ? 'LOW' : score < 0.5 ? 'MEDIUM' : score < 0.75 ? 'HIGH' : 'CRITICAL';
  const stressConf = Math.round(98 * clamp(0.4 * relOf(['pressure_in', 'pressure_out', 'vibration']) + 0.35 * clamp(Math.min(1, score * 1.5) * 0.6 + 0.4) + 0.25 * hist));
  const stressEvidence = [
    `Pressure fluctuation (detrended σ): ${fluct.toFixed(2)} bar`,
    `Vibration: ${vibNow.toFixed(2)} (baseline ${n.vibration})`,
    `Sudden pressure changes in last ${last12.length} readings: ${sudden}`,
  ];
  const stress: StressResult = {
    risk, score: Math.min(99, Math.round(score * 100)), confidence: stressConf, evidence: stressEvidence, label: 'AI-based risk estimation — not a structural engineering inspection',
    explanation: score >= 0.25
      ? `Elevated pipeline stress detected due to ${ssFl > 0.3 ? 'repeated pressure fluctuations' : 'pressure variation'}${ssV > 0.3 ? ' and abnormal vibration' : ''} over the last ${last12.length} readings. This is an AI-based risk estimation, not a definitive structural inspection.`
      : 'No elevated stress indicators. Pressure is stable and vibration is within the baseline.',
  };
  if (score >= thr) {
    anomalies.push({
      type: 'STRESS', category: 'Pipeline stress', probability: Math.round(score * 100), confidence: stressConf,
      severity: score >= 0.75 ? 'critical' : 'warning', title: `Structural Stress Risk: ${risk}`,
      summary: `Pipeline ${cfg.id}: ${stress.explanation}`, evidence: stressEvidence,
    });
  }

  return { leak, stress, anomalies, pDrop: Math.max(0, pDrop), flowDev };
}

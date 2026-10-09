import type { Anomaly, AnomalyType } from './types';

export interface ResponseStep { step: string; detail: string; control?: 'isolate' | 'workorder' }
export interface ResponsePlan { type: AnomalyType; title: string; severity: Anomaly['severity']; steps: ResponseStep[] }

const VERIFY: ResponseStep = { step: 'Verify the fix', detail: 'Restore normal operation and watch the next readings. AquaGuard confirms the repair automatically after 5 consecutive clean readings.' };

const PLANS: Record<AnomalyType, (a: Anomaly) => ResponseStep[]> = {
  LEAK: (a) => [
    { step: 'Confirm the signal', detail: 'Check inlet/outlet pressure and flow sensors for faults, then send a crew with an acoustic logger or correlator to the suspected section.' },
    a.probability >= 80 && a.confidence >= 80
      ? { step: 'Isolate the section', detail: 'Probability and confidence are both high. Closing the section limits water loss and damage while repair is arranged. Notify downstream consumers first.', control: 'isolate' }
      : { step: 'Consider isolation', detail: 'Probability or confidence is moderate. Inspect first; isolate only if loss or damage is confirmed or worsens.', control: 'isolate' },
    { step: 'Raise a repair work order', detail: 'Assign a crew and priority so the repair is tracked to completion.', control: 'workorder' },
    { step: 'Repair', detail: 'Excavate and fix or clamp the pipe, then record the repair on the work order.' },
    VERIFY,
  ],
  BLOCKAGE: () => [
    { step: 'Check upstream and downstream valves', detail: 'A partly closed valve or a stuck check valve is the most common cause of rising inlet pressure with falling flow.' },
    { step: 'Raise a work order', detail: 'Schedule flushing or a line inspection.', control: 'workorder' },
    { step: 'Flush or clear the line', detail: 'Use controlled flushing or a pig where the line allows it.' },
    VERIFY,
  ],
  PRESSURE_DROP: () => [
    { step: 'Check supply side', detail: 'Look at the pump station, reservoir level and any pressure-reducing valve upstream of this section.' },
    { step: 'Raise a work order if it persists', detail: 'A drop on both sensors points to supply or valve settings rather than a pipe fault.', control: 'workorder' },
    VERIFY,
  ],
  ABNORMAL_FLOW: () => [
    { step: 'Check for demand or valve changes', detail: 'Flow moved while pressure stayed normal. Look for a large new draw, an open hydrant or a flow-meter fault.' },
    { step: 'Raise a work order if unexplained', detail: 'Verify the flow meter and field conditions.', control: 'workorder' },
    VERIFY,
  ],
  STRESS: () => [
    { step: 'Look for the source of pressure surges', detail: 'Rapid valve closures, pump starts and stops and air in the line are the usual causes of repeated fluctuation.' },
    { step: 'Raise an inspection work order', detail: 'Inspect supports, joints and valves. This output is an AI risk estimate, not a structural inspection.', control: 'workorder' },
    { step: 'Slow the operation that causes surges', detail: 'For example slower valve closing or soft-start pumps.' },
    VERIFY,
  ],
  HIGH_PH: () => water('Check chemical dosing and any recent source blending.'),
  LOW_PH: () => water('Check chemical dosing and corrosion control. Low pH water can leach metals from pipes.'),
  PH_RAPID_CHANGE: () => water('A fast pH shift inside the range often means a dosing or blending change. Check the dosing log.'),
  HIGH_TURBIDITY: () => water('Check recent flushing, flow reversals and treatment performance. Optical sensors also foul, so rule out the sensor.'),
  TURBIDITY_SPIKE: () => water('A sudden rise often follows a main break, flow reversal or valve operation that disturbs sediment.'),
  CONTAMINATION: () => [
    { step: 'Take a grab sample', detail: 'Confirm with laboratory or field-kit testing before declaring an event.' },
    { step: 'Isolate if risk is credible', detail: 'Isolating the section prevents spread while results are pending. Follow your local protocol and notify the responsible authority.', control: 'isolate' },
    { step: 'Raise a work order', detail: 'Track flushing, disinfection and re-sampling.', control: 'workorder' },
    { step: 'Flush and re-test', detail: 'Flush, check chlorine residual and re-sample before returning to service.' },
    VERIFY,
  ],
  SENSOR_FAILURE: () => [
    { step: 'Do not act on the affected reading', detail: 'The value has been excluded from detection. Use a handheld instrument to check the true value.' },
    { step: 'Raise a sensor work order', detail: 'Calibrate, clean or replace the sensor.', control: 'workorder' },
    VERIFY,
  ],
  MISSING_DATA: () => [
    { step: 'Check power and communications', detail: 'A dropout is most often a power, cable or gateway problem rather than a sensor failure.' },
    { step: 'Raise a work order', detail: 'Restore the data link.', control: 'workorder' },
    VERIFY,
  ],
};

function water(first: string): ResponseStep[] {
  return [
    { step: 'Confirm with a sample', detail: first + ' Confirm with a grab sample or handheld meter.' },
    { step: 'Raise a work order', detail: 'Track the investigation and any corrective action.', control: 'workorder' },
    VERIFY,
  ];
}

/** Recommended response steps for each active finding, most severe first. */
export function recommendedActions(anomalies: Anomaly[]): ResponsePlan[] {
  return anomalies.map((a) => ({ type: a.type, title: a.title, severity: a.severity, steps: PLANS[a.type](a) }));
}

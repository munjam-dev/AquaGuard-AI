/**
 * Curated research notes shown in the Assistant's library and supplied to the model as grounding.
 * Values reflect widely published guidance; users must confirm limits against the current official standard.
 */
export interface Topic { id: string; title: string; summary: string; points: string[]; sources: string[]; ask: string }

export const KNOWLEDGE: Topic[] = [
  {
    id: 'ph', title: 'pH in drinking water',
    summary: 'pH is a corrosivity and disinfection indicator. The usual acceptable range is 6.5 to 8.5.',
    points: [
      'BIS IS 10500 and the WHO operational guidance both use 6.5 to 8.5 as the acceptable range.',
      'Low pH (acidic) water is corrosive: it can leach metals such as lead and copper from pipes and fittings.',
      'High pH reduces the effectiveness of chlorine disinfection and encourages scaling.',
      'A fast shift, even inside the range, can point to a dosing fault, a blending change or an ingress event.',
    ],
    sources: ['BIS IS 10500:2012', 'WHO Guidelines for Drinking-water Quality'], ask: 'Why does pH matter in a distribution network, and what causes sudden pH changes?',
  },
  {
    id: 'turbidity', title: 'Turbidity (NTU)',
    summary: 'Turbidity is cloudiness from suspended particles. It matters because particles can shield microbes from disinfectant.',
    points: [
      'BIS IS 10500 lists 1 NTU as acceptable and 5 NTU as the permissible limit where no alternative source exists.',
      'WHO advises keeping turbidity low (ideally below 1 NTU) so disinfection stays effective.',
      'Sudden rises in a distribution main often come from flow reversals, flushing, main breaks, sediment or biofilm disturbance, or a treatment upset.',
      'Optical turbidity sensors foul over time, so slow upward drift can be a sensor problem rather than a water problem.',
    ],
    sources: ['BIS IS 10500:2012', 'WHO Guidelines for Drinking-water Quality'], ask: 'What can cause a sudden turbidity increase in a pipeline, and how do I tell a real event from a fouled sensor?',
  },
  {
    id: 'chlorine', title: 'Chlorine residual',
    summary: 'Free residual chlorine keeps water safe between the plant and the tap. It decays with time and temperature.',
    points: [
      'A free residual of at least 0.2 mg/L at the point of delivery is the common target (BIS acceptable range 0.2 to 1.0 mg/L).',
      'WHO sets a health-based guideline value of 5 mg/L for chlorine.',
      'A falling residual along a line can indicate long retention time, biofilm or organic ingress that is consuming chlorine.',
    ],
    sources: ['BIS IS 10500:2012', 'WHO Guidelines for Drinking-water Quality'], ask: 'Why does chlorine residual drop along a distribution line and what should I check?',
  },
  {
    id: 'tds', title: 'TDS and conductivity',
    summary: 'Both measure dissolved ions. TDS in mg/L is roughly 0.5 to 0.7 times conductivity in microsiemens per cm.',
    points: [
      'BIS IS 10500 lists 500 mg/L TDS as acceptable and 2000 mg/L as permissible where no better source exists.',
      'AquaGuard cross-checks the two: a conductivity-to-TDS ratio far from about 1.56 suggests one sensor is faulty.',
      'A sudden conductivity rise can indicate ingress, a blending change or a dosing problem.',
    ],
    sources: ['BIS IS 10500:2012'], ask: 'How are TDS and conductivity related, and what does a mismatch between them mean?',
  },
  {
    id: 'leak', title: 'Leak detection basics',
    summary: 'A leak removes water and pressure from the system. The strongest evidence is both together.',
    points: [
      'Signature: flow falls below what is expected while outlet pressure drops and the inlet-outlet differential grows.',
      'Blockage differs: flow falls but pressure upstream rises, because water is being held back.',
      'Utilities also use minimum night flow analysis in district metered areas, acoustic loggers and correlators, and pressure-transient analysis.',
      'Confirm any suspected leak in the field, since an AI estimate is a prompt to inspect, not proof.',
    ],
    sources: ['AWWA M36 Water Audits and Loss Control Programs', 'IWA water loss guidance'], ask: 'How can I tell a leak from a blockage using pressure and flow readings?',
  },
  {
    id: 'pressure', title: 'Pressure management and water hammer',
    summary: 'Excess and fluctuating pressure increases leakage and shortens pipe life.',
    points: [
      'Lowering excess pressure usually reduces both leakage rates and the frequency of bursts.',
      'Water hammer comes from rapid valve closure or pump trips. Repeated pressure cycles cause fatigue in joints and pipe walls.',
      'Slow sampling can miss fast transients, so high-frequency pressure logging is used when surges are suspected.',
      'AquaGuard stress output is an AI risk estimate from fluctuation and vibration. It is not a structural inspection.',
    ],
    sources: ['AWWA M51 Air-Release, Air/Vacuum, and Combination Air Valves', 'IWA pressure management guidance'], ask: 'What causes repeated pressure fluctuations and what damage can they do?',
  },
  {
    id: 'sensors', title: 'Sensor reliability and calibration',
    summary: 'Bad sensor data causes more false alarms than real events. Validate before trusting.',
    points: [
      'Frozen readings (identical for a long time), impossible values, jumps, dropouts, drift and conflicting sensors are the common fault patterns.',
      'pH probes lose slope and need regular multi-point calibration with fresh buffers. Turbidity optics foul.',
      'Redundant or cross-checking sensors (for example TDS against conductivity, inlet against outlet pressure) catch faults a single sensor cannot.',
      'Use the calibration offsets in Admin Settings to correct a known constant bias.',
    ],
    sources: ['Manufacturer calibration guidance', 'WHO Guidelines for Drinking-water Quality (monitoring)'], ask: 'How often should pH and turbidity sensors be calibrated and what are the signs of failure?',
  },
  {
    id: 'nrw', title: 'Non-revenue water (NRW)',
    summary: 'NRW is water put into the system that earns no revenue. Leakage is usually its largest controllable part.',
    points: [
      'IWA water balance: system input minus billed authorized consumption equals NRW.',
      'NRW has three parts: real losses (leaks and overflows), apparent losses (metering errors and theft) and unbilled authorized use.',
      'Cutting real losses saves treatment and pumping energy as well as water.',
    ],
    sources: ['IWA standard water balance', 'AWWA M36'], ask: 'Explain non-revenue water and where leak detection fits in.',
  },
  {
    id: 'india', title: 'Indian standards and programmes',
    summary: 'BIS IS 10500 is the main drinking-water specification in India. Several national missions fund supply and quality monitoring.',
    points: [
      'IS 10500 defines acceptable and permissible limits for physical, chemical and microbiological parameters.',
      'Jal Jeevan Mission targets tap water connections for rural households and includes water quality surveillance.',
      'AMRUT 2.0 addresses urban water supply and its management. CPHEEO publishes design and operation manuals.',
      'Programme details change over time, so check the current official documents before quoting targets.',
    ],
    sources: ['BIS IS 10500:2012', 'Jal Jeevan Mission', 'AMRUT 2.0', 'CPHEEO manuals'], ask: 'Which Indian standards apply to drinking water quality monitoring?',
  },
  {
    id: 'contam', title: 'Possible contamination response',
    summary: 'When pH, turbidity and other signals move together, treat it as a possible contamination event and verify.',
    points: [
      'Confirm with a grab sample and laboratory or field-kit testing before declaring an event.',
      'Common steps: isolate the section if possible, flush, check disinfectant residual, and notify the responsible authority following local protocol.',
      'AquaGuard flags the pattern early. It cannot identify the contaminant.',
    ],
    sources: ['WHO Water Safety Plan guidance'], ask: 'What should operators do when the system flags a possible contamination event?',
  },
  {
    id: 'app', title: 'How AquaGuard makes a decision',
    summary: 'Validation first, then rules plus baseline statistics, with probability and confidence on every finding.',
    points: [
      'Faulty sensor values are removed first. Then water-quality, leak, stress and flow detectors run on medians of recent readings.',
      'A leak needs both flow loss and pressure loss. Rising inlet pressure is classed as blockage instead.',
      'Confidence reflects sensor reliability, how many signals agree and how much history exists. It is capped below 100%.',
      'Accuracy figures on the AI Performance page come from simulated test scenarios, not field data.',
    ],
    sources: ['AquaGuard AI documentation (README)'], ask: 'Explain how AquaGuard decides that something is a leak and how confident it is.',
  },
];

export function knowledgeText(): string {
  return KNOWLEDGE.map((t) => `## ${t.title}\n${t.summary}\n${t.points.map((p) => `- ${p}`).join('\n')}\nSources: ${t.sources.join('; ')}`).join('\n\n');
}

export type Num = number | null;

export const FIELDS = [
  'pH', 'turbidity', 'temperature', 'tds', 'conductivity', 'dissolved_oxygen', 'orp', 'chlorine',
  'pressure_in', 'pressure_out', 'flow_rate', 'vibration', 'acoustic',
] as const;
export type Field = (typeof FIELDS)[number];

export interface Reading {
  ts: number; // epoch ms
  pipeline_id: string;
  pH: Num; turbidity: Num; temperature: Num; tds: Num;
  conductivity?: Num; dissolved_oxygen?: Num; orp?: Num; chlorine?: Num;
  pressure_in: Num; pressure_out: Num; flow_rate: Num; vibration: Num; acoustic?: Num;
}

export type Severity = 'critical' | 'warning' | 'attention' | 'normal';
export type AnomalyType =
  | 'HIGH_PH' | 'LOW_PH' | 'PH_RAPID_CHANGE' | 'HIGH_TURBIDITY' | 'TURBIDITY_SPIKE' | 'CONTAMINATION'
  | 'LEAK' | 'BLOCKAGE' | 'PRESSURE_DROP' | 'ABNORMAL_FLOW' | 'STRESS' | 'SENSOR_FAILURE' | 'MISSING_DATA';
export const ANOMALY_TYPES: AnomalyType[] = [
  'HIGH_PH', 'LOW_PH', 'PH_RAPID_CHANGE', 'HIGH_TURBIDITY', 'TURBIDITY_SPIKE', 'CONTAMINATION',
  'LEAK', 'BLOCKAGE', 'PRESSURE_DROP', 'ABNORMAL_FLOW', 'STRESS', 'SENSOR_FAILURE', 'MISSING_DATA',
];
export type AlertCategory =
  | 'pH' | 'Turbidity' | 'Pressure' | 'Flow' | 'Leakage' | 'Pipeline stress' | 'Sensor failure' | 'Water-quality anomaly';

export interface Anomaly {
  type: AnomalyType;
  category: AlertCategory;
  severity: Exclude<Severity, 'normal'>;
  probability: number; // 0-100
  confidence: number; // 0-100
  title: string;
  summary: string;
  evidence: string[];
}

export interface SensorFlag {
  field: Field;
  kind: 'FROZEN' | 'IMPOSSIBLE' | 'JUMP' | 'MISSING' | 'DRIFT' | 'CONFLICT';
  severity: 'warning' | 'critical';
  message: string;
}

export interface Standard {
  name: string;
  params: Partial<Record<Field, { min?: number; max?: number; margin: number; weight: number; unit: string }>>;
}

export interface Settings {
  standard: string;
  standards: Record<string, Standard>;
  limits: {
    pressure: { min: number; max: number };
    flow: { min: number; max: number };
    temperature: { min: number; max: number };
    vibration: { warn: number; crit: number };
  };
  sensors: { frozenCount: number; maxJump: Partial<Record<Field, number>>; missingCount: number };
  sensitivity: { alert: 'low' | 'medium' | 'high'; ai: number };
  calibration: Record<string, Partial<Record<Field, number>>>; // pipeline -> field offsets
}

export interface PipelineCfg {
  id: string; name: string; location: string; lat: number; lng: number;
  diameter_mm: number; material: string;
  nominal: { pressure_in: number; pressure_out: number; flow: number; vibration: number; pH: number; turbidity: number; temperature: number; tds: number };
  map: { x1: number; y1: number; x2: number; y2: number };
}

export interface QualityPart {
  field: Field; label: string; value: number; unit: string; score: number; status: 'Normal' | 'Warning' | 'Critical'; range: string;
}
export interface LeakResult {
  probability: number; confidence: number;
  class: 'No Leak' | 'Low Probability' | 'Possible Leak' | 'High Probability' | 'Critical Leak';
  evidence: string[]; explanation: string;
  expectedFlow: number; actualFlow: number | null; pressureIn: number | null; pressureOut: number | null; pressureDiff: number | null;
}
export interface StressResult {
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; score: number; confidence: number; explanation: string; evidence: string[];
  label: string;
}
export interface Prediction {
  kind: 'turbidity_trend' | 'ph_trend' | 'pressure_instability' | 'future_leak' | 'sensor_degradation';
  severity: 'attention' | 'warning' | 'critical';
  title: string; text: string; probability: number; confidence: number;
}
export type PipelineStatus = 'Healthy' | 'Warning' | 'Risk' | 'Critical' | 'Isolated';

export interface Analysis {
  ts: number; pipeline_id: string;
  flags: SensorFlag[];
  reliability: { overall: number; byField: Partial<Record<Field, number>> };
  quality: { score: number; status: 'Normal' | 'Warning' | 'Critical'; parts: QualityPart[]; standard: string };
  leak: LeakResult; stress: StressResult;
  anomalies: Anomaly[];
  health: { score: number; label: 'GOOD' | 'FAIR' | 'DEGRADED' | 'CRITICAL' };
  status: PipelineStatus;
  predictions: Prediction[];
  current: Partial<Record<Field, number | null>>;
}

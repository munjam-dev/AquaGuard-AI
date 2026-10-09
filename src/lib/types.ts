import type { Analysis, PipelineCfg, Reading, Settings } from '@/engine/types';

export interface PipeState { cfg: PipelineCfg; reading: Reading | null; analysis: Analysis | null; scenario: string }
export interface AppState {
  clock: number;
  sim: { running: boolean; tick: number };
  pipelines: PipeState[];
  alertCounts: Record<string, number>;
  settingsStandard?: string;
}
export interface AlertRow {
  id: number; pipeline_id: string; type: string; category: string; severity: 'critical' | 'warning' | 'attention';
  title: string; summary: string; evidence: string[]; probability: number; confidence: number;
  status: 'open' | 'acknowledged' | 'resolved' | 'false_positive'; created_ts: number; updated_ts: number; resolved_ts: number | null; note: string | null;
}
export interface SeriesPoint { ts: number; [k: string]: number | null }
export interface PipelineDetail {
  cfg: PipelineCfg; reading: Reading | null; analysis: Analysis | null; scenario: string; clock: number;
  stats: Record<'pH' | 'turbidity', { min: number; max: number; avg: number; trend: string } | null>;
  alerts: AlertRow[];
}
export type { Settings };

import type { PipelineStatus } from '@/engine/types';

export type Tone = 'ok' | 'att' | 'warn' | 'crit';
export const sevTone = (s: string): Tone => (s === 'critical' ? 'crit' : s === 'warning' ? 'warn' : s === 'attention' ? 'att' : 'ok');
export const statusTone = (s: PipelineStatus | string): Tone => (s === 'Critical' ? 'crit' : s === 'Risk' ? 'warn' : s === 'Warning' || s === 'Isolated' ? 'att' : 'ok');
export const qualityTone = (s: string): Tone => (s === 'Critical' ? 'crit' : s === 'Warning' ? 'warn' : 'ok');
export const scoreTone = (v: number): Tone => (v >= 85 ? 'ok' : v >= 70 ? 'att' : v >= 50 ? 'warn' : 'crit');
export const riskTone = (v: number): Tone => (v >= 75 ? 'crit' : v >= 50 ? 'warn' : v >= 25 ? 'att' : 'ok');
export const stressTone = (r: string): Tone => (r === 'CRITICAL' ? 'crit' : r === 'HIGH' ? 'warn' : r === 'MEDIUM' ? 'att' : 'ok');
export const sevLabel = (s: string) => ({ critical: 'CRITICAL', warning: 'WARNING', attention: 'ATTENTION', normal: 'NORMAL' } as Record<string, string>)[s] ?? s.toUpperCase();

export const num = (v: number | null | undefined, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d));
const TZ = 'Asia/Kolkata';
export const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });
export const fmtDateTime = (ms: number) => new Date(ms).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });
export const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: TZ });
export const fmtFull = (ms: number) => new Date(ms).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: TZ });

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? res.statusText);
  return body as T;
}
export const post = <T,>(url: string, body: unknown, method = 'POST') => api<T>(url, { method, body: JSON.stringify(body) });

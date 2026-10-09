import type { Field, QualityPart, Settings } from './types';
import { clamp } from './stats';
import { LABEL } from './validate';

const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2).replace(/\.?0+$/, ''));

export function rangeText(p: { min?: number; max?: number; unit: string }): string {
  const u = p.unit ? ` ${p.unit}` : '';
  if (p.min !== undefined && p.max !== undefined) return `${p.min}–${p.max}${u}`;
  if (p.max !== undefined) return `≤ ${p.max}${u}`;
  if (p.min !== undefined) return `≥ ${p.min}${u}`;
  return '—';
}

/** Distance outside the configured reference range (0 when inside). */
export function outsideBy(v: number, p: { min?: number; max?: number }): number {
  if (p.max !== undefined && v > p.max) return v - p.max;
  if (p.min !== undefined && v < p.min) return p.min - v;
  return 0;
}

/** Combined Water Quality Score (0-100) against an admin-selectable reference standard. */
export function scoreQuality(values: Partial<Record<Field, number | null>>, s: Settings) {
  const std = s.standards[s.standard] ?? Object.values(s.standards)[0];
  const parts: QualityPart[] = [];
  let wsum = 0, acc = 0;
  for (const [f, p] of Object.entries(std.params) as [Field, NonNullable<(typeof std.params)[Field]>][]) {
    const v = values[f];
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    const dist = outsideBy(v, p);
    const score = dist === 0 ? 100 : clamp(100 - (100 * dist) / (2 * p.margin), 0, 100);
    const status = dist === 0 ? 'Normal' : dist < p.margin ? 'Warning' : 'Critical';
    parts.push({ field: f, label: LABEL[f], value: Number(fmt(v)), unit: p.unit, score: Math.round(score), status, range: rangeText(p) });
    wsum += p.weight; acc += p.weight * score;
  }
  const score = wsum ? Math.round(acc / wsum) : 0;
  const worst = parts.some((x) => x.status === 'Critical') ? 'Critical' : parts.some((x) => x.status === 'Warning') ? 'Warning' : 'Normal';
  return { score, status: worst as 'Normal' | 'Warning' | 'Critical', parts, standard: std.name };
}

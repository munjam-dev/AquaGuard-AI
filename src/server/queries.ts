import { FIELDS, type Analysis, type Field, type Reading } from '@/engine/types';
import { mean, median, linfit } from '@/engine/stats';
import { getDb } from './db';
import { PHYSICAL } from '@/engine/validate';
import { getRuntime } from './runtime';

export const RANGES: Record<string, number> = { '1h': 3600e3, '6h': 6 * 3600e3, '24h': 24 * 3600e3, '7d': 7 * 86400e3, '30d': 30 * 86400e3 };
const SERIES_COLS = [...FIELDS, 'quality', 'health', 'leak', 'stress', 'reliability'] as const;

export function series(pipeline: string, range: string, from?: number, to?: number, maxPoints = 240) {
  const rt = getRuntime();
  const end = to ?? rt.sim.clock + 60000;
  const start = from ?? end - (RANGES[range] ?? RANGES['24h']);
  const rows = getDb().prepare(`SELECT ts, ${SERIES_COLS.join(',')} FROM readings WHERE pipeline_id = ? AND ts BETWEEN ? AND ? ORDER BY ts`).all(pipeline, start, end) as Record<string, number | null>[];
  // readings outside physical limits are sensor faults: keep them out of the charts (they remain in the DB and drive sensor alerts)
  for (const r of rows) for (const f of FIELDS) { const v = r[f]; if (typeof v === 'number' && (v < PHYSICAL[f][0] || v > PHYSICAL[f][1])) r[f] = null; }
  if (rows.length <= maxPoints) return { start, end, points: rows };
  const size = Math.ceil(rows.length / maxPoints);
  const points: Record<string, number | null>[] = [];
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const p: Record<string, number | null> = { ts: Math.round(mean(chunk.map((c) => c.ts as number))) };
    for (const c of SERIES_COLS) {
      const v = chunk.map((x) => x[c]).filter((x): x is number => typeof x === 'number');
      p[c] = v.length ? Math.round(mean(v) * 1000) / 1000 : null;
    }
    points.push(p);
  }
  return { start, end, points };
}

/** Min / max / average / trend for one field over a window (used by the pH and turbidity cards). */
export function fieldStats(pipeline: string, field: Field, windowMs = 24 * 3600e3) {
  const rt = getRuntime();
  const rows = getDb().prepare(`SELECT ${field} AS v FROM readings WHERE pipeline_id = ? AND ts >= ? AND ${field} IS NOT NULL ORDER BY ts`).all(pipeline, rt.sim.clock - windowMs) as { v: number }[];
  const v = rows.map((r) => r.v).filter((x) => x > -1 && x < 1000);
  if (!v.length) return null;
  const tail = v.slice(-30);
  const slope = linfit(tail).slope * (tail.length - 1);
  return {
    min: Math.min(...v), max: Math.max(...v), avg: mean(v), median: median(v),
    trend: Math.abs(slope) < (field === 'pH' ? 0.1 : 0.4) ? 'stable' : slope > 0 ? 'rising' : 'falling',
  };
}

export function listAlerts(opts: { status?: string; pipeline?: string; severity?: string; category?: string; limit?: number }) {
  const w: string[] = []; const p: (string | number)[] = [];
  if (opts.status === 'active') w.push("status IN ('open','acknowledged')");
  else if (opts.status && opts.status !== 'all') { w.push('status = ?'); p.push(opts.status); }
  if (opts.pipeline && opts.pipeline !== 'all') { w.push('pipeline_id = ?'); p.push(opts.pipeline); }
  if (opts.severity && opts.severity !== 'all') { w.push('severity = ?'); p.push(opts.severity); }
  if (opts.category && opts.category !== 'all') { w.push('category = ?'); p.push(opts.category); }
  const rows = getDb().prepare(`SELECT * FROM alerts ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, updated_ts DESC LIMIT ?`).all(...p, opts.limit ?? 200) as Record<string, unknown>[];
  return rows.map((r) => ({ ...r, evidence: JSON.parse((r.evidence as string) || '[]') }));
}

export function updateAlert(id: number, action: 'ack' | 'resolve' | 'false_positive', note?: string) {
  const rt = getRuntime();
  const status = action === 'ack' ? 'acknowledged' : action === 'resolve' ? 'resolved' : 'false_positive';
  getDb().prepare('UPDATE alerts SET status = ?, note = ?, updated_ts = ?, resolved_ts = ? WHERE id = ?').run(status, note ?? null, rt.sim.clock, action === 'ack' ? null : rt.sim.clock, id);
  rt.absent.delete(id);
}

/** Dashboard-level state: every pipeline's latest reading + analysis, plus alert counts and simulator status. */
export function state() {
  const rt = getRuntime();
  const pipelines = rt.pipelines.map((cfg) => {
    const hist = rt.hist.get(cfg.id) ?? [];
    const a = rt.latest.get(cfg.id) as Analysis | undefined;
    return { cfg, reading: (hist[hist.length - 1] ?? null) as Reading | null, analysis: a ?? null, scenario: rt.sim.scenarios[cfg.id]?.scenario ?? 'normal' };
  });
  const counts = getDb().prepare("SELECT severity, COUNT(*) AS c FROM alerts WHERE status IN ('open','acknowledged') GROUP BY severity").all() as { severity: string; c: number }[];
  return {
    clock: rt.sim.clock, sim: { running: rt.sim.running, tick: rt.sim.tick }, pipelines,
    alertCounts: Object.fromEntries(counts.map((c) => [c.severity, c.c])),
    settingsStandard: rt.settings.standards[rt.settings.standard]?.name,
  };
}

/** Historical analysis: daily aggregates, event list and a generated narrative summary. */
export function history(pipeline: string, days: number) {
  const rt = getRuntime();
  const db = getDb();
  const since = rt.sim.clock - days * 86400e3;
  const where = pipeline === 'all' ? '' : 'AND pipeline_id = ?';
  const args = pipeline === 'all' ? [since] : [since, pipeline];
  const daily = db.prepare(`SELECT CAST(ts/86400000 AS INTEGER) AS day, ROUND(AVG(pH),2) AS ph, ROUND(AVG(turbidity),2) AS turb, ROUND(MAX(CASE WHEN turbidity BETWEEN 0 AND 1000 THEN turbidity END),2) AS turbMax,
      ROUND(AVG(pressure_in),2) AS pin, ROUND(AVG(flow_rate),1) AS flow, ROUND(AVG(quality),1) AS quality, ROUND(AVG(health),1) AS health, ROUND(MAX(leak),0) AS leakMax, ROUND(MAX(stress),0) AS stressMax,
      ROUND(AVG(reliability),1) AS reliability, ROUND(AVG(pressure_in*pressure_in) - AVG(pressure_in)*AVG(pressure_in),4) AS pVar
      FROM readings WHERE ts >= ? ${where} GROUP BY day ORDER BY day`).all(...args) as Record<string, number>[];
  const events = db.prepare(`SELECT id, pipeline_id, ts, type, severity, probability, confidence, explanation FROM anomalies WHERE ts >= ? ${where} ORDER BY ts DESC LIMIT 300`).all(...args) as Record<string, unknown>[];
  const parsed = events.map((e) => ({ ...e, explanation: JSON.parse(e.explanation as string) }));
  const byType: Record<string, number> = {};
  for (const e of events) byType[e.type as string] = (byType[e.type as string] ?? 0) + 1;
  const maintenance = db.prepare(`SELECT * FROM maintenance_events WHERE ts >= ? ${where} ORDER BY ts DESC`).all(...args);
  return { days: daily.map((d) => ({ ...d, date: d.day * 86400000 })), events: parsed, byType, maintenance, summary: narrative(daily, events, pipeline, days) };
}

const fmtDay = (ms: number) => new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function narrative(daily: Record<string, number>[], events: Record<string, unknown>[], pipeline: string, days: number): string {
  const scope = pipeline === 'all' ? 'across all pipelines' : `on ${pipeline}`;
  if (daily.length < 2) return `Not enough data to summarize the last ${days} days yet.`;
  const parts: string[] = [];
  const tm = daily.map((d) => d.turb);
  const base = median(tm);
  const dt = (d: Record<string, number>) => d.day * 86400000;
  const worst = daily.reduce((a, b) => (b.turbMax > a.turbMax ? b : a));
  if (worst.turbMax > Math.max(4, base * 1.8)) parts.push(`Over the last ${days} days turbidity ${scope} remained stable for most of the period but increased significantly on ${fmtDay(dt(worst))} (peak ${worst.turbMax} NTU vs typical ${base.toFixed(1)} NTU).`);
  else parts.push(`Over the last ${days} days turbidity ${scope} stayed within its normal band (typical ${base.toFixed(1)} NTU).`);
  const pv = daily.reduce((a, b) => (b.pVar > a.pVar ? b : a));
  if (pv.pVar > 0.03) parts.push(`Pressure fluctuations were highest on ${fmtDay(dt(pv))}${pv.day === worst.day ? ', the same period as the turbidity increase' : ''}.`);
  const q = daily.reduce((a, b) => (b.quality < a.quality ? b : a));
  if (q.quality < 90) parts.push(`The lowest average Water Quality Score was ${q.quality}/100 on ${fmtDay(dt(q))}.`);
  const leaks = events.filter((e) => e.type === 'LEAK').length, fails = events.filter((e) => e.type === 'SENSOR_FAILURE' || e.type === 'MISSING_DATA').length, stress = events.filter((e) => e.type === 'STRESS').length;
  const bits = [leaks && `${leaks} possible leakage event${leaks > 1 ? 's' : ''}`, stress && `${stress} pipeline stress event${stress > 1 ? 's' : ''}`, fails && `${fails} sensor failure/missing-data event${fails > 1 ? 's' : ''}`].filter(Boolean);
  parts.push(bits.length ? `Detected: ${bits.join(', ')}. These are AI estimates and should be verified in the field.` : 'No leakage, stress or sensor-failure events were detected in this period.');
  return parts.join(' ');
}

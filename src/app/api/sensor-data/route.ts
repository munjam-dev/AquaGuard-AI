import { NextResponse } from 'next/server';
import { FIELDS, type Reading } from '@/engine/types';
import { ingest } from '@/server/runtime';

export const dynamic = 'force-dynamic';

const ALIASES: Record<string, string> = { ph: 'pH', flow: 'flow_rate', do: 'dissolved_oxygen' };

/** Parses one sensor payload. Missing sensors may be omitted or null; anything non-numeric is rejected. */
function parse(body: Record<string, unknown>): Reading {
  if (typeof body.pipeline_id !== 'string') throw new Error('pipeline_id is required');
  const ts = body.timestamp ? Date.parse(String(body.timestamp)) : Date.now();
  if (Number.isNaN(ts)) throw new Error('timestamp is not a valid date');
  const r: Record<string, unknown> = { ts, pipeline_id: body.pipeline_id };
  for (const f of FIELDS) r[f] = null;
  for (const [k, raw] of Object.entries(body)) {
    const f = (ALIASES[k.toLowerCase()] ?? k) as string;
    if (!(FIELDS as readonly string[]).includes(f)) continue;
    if (raw === null || raw === '' || raw === undefined) { r[f] = null; continue; }
    const v = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(v)) throw new Error(`${k} must be a number`);
    r[f] = v;
  }
  return r as unknown as Reading;
}

/** POST /api/sensor-data — one reading or an array. Real IoT gateways call this endpoint. */
export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const items = Array.isArray(body) ? body : [body];
  if (!items.length || items.length > 500) return NextResponse.json({ error: 'Send 1-500 readings' }, { status: 400 });
  try {
    const results = items.map((it) => {
      const a = ingest(parse(it as Record<string, unknown>), 'api');
      return {
        pipeline_id: a.pipeline_id, status: a.status, health: a.health, water_quality_score: a.quality.score,
        leak: { probability: a.leak.probability, confidence: a.leak.confidence, class: a.leak.class },
        stress: { risk: a.stress.risk, label: a.stress.label },
        sensor_reliability: a.reliability.overall, sensor_flags: a.flags.map((f) => f.message),
        anomalies: a.anomalies.map((x) => ({ type: x.type, severity: x.severity, probability: x.probability, confidence: x.confidence, title: x.title })),
      };
    });
    return NextResponse.json(Array.isArray(body) ? { ok: true, results } : { ok: true, ...results[0] });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

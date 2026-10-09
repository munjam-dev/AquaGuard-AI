import { NextResponse } from 'next/server';
import { listAlerts, updateAlert } from '@/server/queries';
import { getRuntime } from '@/server/runtime';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  getRuntime();
  const u = new URL(req.url).searchParams;
  return NextResponse.json({
    alerts: listAlerts({ status: u.get('status') ?? 'active', pipeline: u.get('pipeline') ?? undefined, severity: u.get('severity') ?? undefined, category: u.get('category') ?? undefined, limit: Number(u.get('limit') ?? 200) }),
  });
}

export async function PATCH(req: Request) {
  const { id, action, note } = await req.json();
  if (!Number.isInteger(id) || !['ack', 'resolve', 'false_positive'].includes(action)) return NextResponse.json({ error: 'id and action (ack|resolve|false_positive) required' }, { status: 400 });
  updateAlert(id, action, note);
  return NextResponse.json({ ok: true });
}

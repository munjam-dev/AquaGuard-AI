import { NextResponse } from 'next/server';
import { createWorkOrder, listWorkOrders } from '@/server/workorders';
import { getRuntime } from '@/server/runtime';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  getRuntime();
  return NextResponse.json({ workOrders: listWorkOrders(new URL(req.url).searchParams.get('status') ?? 'all') });
}

export async function POST(req: Request) {
  getRuntime();
  try {
    const b = await req.json();
    if (typeof b.pipeline_id !== 'string') return NextResponse.json({ error: 'pipeline_id is required' }, { status: 400 });
    const id = createWorkOrder({ pipeline_id: b.pipeline_id, alert_id: Number.isInteger(b.alert_id) ? b.alert_id : null, type: b.type, title: b.title, priority: b.priority, assignee: b.assignee, note: b.note });
    return NextResponse.json({ ok: true, id });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}

import { NextResponse } from 'next/server';
import { actOnWorkOrder, type WoAction } from '@/server/workorders';
import { getRuntime } from '@/server/runtime';

export const dynamic = 'force-dynamic';
const ACTIONS = ['assign', 'start', 'repaired', 'verify', 'close', 'cancel', 'note'];

/** { action: assign|start|repaired|verify|close|cancel|note, assignee?, note? } */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  getRuntime();
  const id = Number((await params).id);
  try {
    const b = await req.json();
    if (!Number.isInteger(id) || !ACTIONS.includes(b.action)) return NextResponse.json({ error: 'valid id and action required' }, { status: 400 });
    actOnWorkOrder(id, b.action as WoAction, { assignee: b.assignee, note: b.note });
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}

import { NextResponse } from 'next/server';
import { setValve, valveState } from '@/server/workorders';
import { getRuntime, tickAll } from '@/server/runtime';

export const dynamic = 'force-dynamic';

export async function GET() {
  getRuntime();
  return NextResponse.json(valveState());
}

/** { pipeline, action: 'isolate' | 'restore' }. Simulated: no physical valve is operated. */
export async function POST(req: Request) {
  getRuntime();
  try {
    const b = await req.json();
    if (typeof b.pipeline !== 'string' || !['isolate', 'restore'].includes(b.action)) return NextResponse.json({ error: 'pipeline and action (isolate|restore) required' }, { status: 400 });
    setValve(b.pipeline, b.action, 'Operator', typeof b.note === 'string' ? b.note.slice(0, 200) : undefined);
    tickAll(); // show the effect on the next reading immediately
    return NextResponse.json({ ok: true, ...valveState() });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}

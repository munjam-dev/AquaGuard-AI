import { NextResponse } from 'next/server';
import { simControl } from '@/server/runtime';
import { SCENARIO_META } from '@/engine/simulator';

export const dynamic = 'force-dynamic';

/** { action: 'start'|'stop'|'scenario', scenario?: key|'random', pipeline?: id|'ALL' } */
export async function POST(req: Request) {
  const body = await req.json();
  if (!['start', 'stop', 'scenario'].includes(body.action)) return NextResponse.json({ error: 'invalid action' }, { status: 400 });
  if (body.action === 'scenario' && body.scenario !== 'random' && !(body.scenario in SCENARIO_META)) return NextResponse.json({ error: 'unknown scenario' }, { status: 400 });
  return NextResponse.json({ ok: true, ...simControl(body) });
}

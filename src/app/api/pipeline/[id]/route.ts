import { NextResponse } from 'next/server';
import { fieldStats, listAlerts } from '@/server/queries';
import { getRuntime } from '@/server/runtime';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rt = getRuntime();
  const cfg = rt.pipelines.find((p) => p.id === id);
  if (!cfg) return NextResponse.json({ error: 'Unknown pipeline' }, { status: 404 });
  const hist = rt.hist.get(id) ?? [];
  return NextResponse.json({
    cfg, reading: hist[hist.length - 1] ?? null, analysis: rt.latest.get(id) ?? null,
    stats: { pH: fieldStats(id, 'pH'), turbidity: fieldStats(id, 'turbidity') },
    alerts: listAlerts({ pipeline: id, status: 'active', limit: 20 }),
    scenario: rt.sim.scenarios[id]?.scenario ?? 'normal', clock: rt.sim.clock,
  });
}

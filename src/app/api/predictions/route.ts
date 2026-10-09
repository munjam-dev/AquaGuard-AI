import { NextResponse } from 'next/server';
import { getRuntime } from '@/server/runtime';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rt = getRuntime();
  const predictions = rt.pipelines.flatMap((p) => (rt.latest.get(p.id)?.predictions ?? []).map((x) => ({ ...x, pipeline_id: p.id, location: p.location })));
  return NextResponse.json({ predictions });
}

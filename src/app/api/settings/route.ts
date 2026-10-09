import { NextResponse } from 'next/server';
import { getRuntime, setSettings } from '@/server/runtime';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rt = getRuntime();
  return NextResponse.json({ settings: rt.settings, pipelines: rt.pipelines });
}

export async function PUT(req: Request) {
  const { settings, pipelines } = await req.json();
  if (!settings && !pipelines) return NextResponse.json({ error: 'settings or pipelines required' }, { status: 400 });
  const next = setSettings(settings ?? {}, pipelines);
  return NextResponse.json({ settings: next, pipelines: getRuntime().pipelines });
}

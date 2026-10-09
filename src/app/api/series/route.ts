import { NextResponse } from 'next/server';
import { series } from '@/server/queries';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const from = u.get('from') ? Number(u.get('from')) : undefined;
  const to = u.get('to') ? Number(u.get('to')) : undefined;
  return NextResponse.json(series(u.get('pipeline') ?? 'PIPE-001', u.get('range') ?? '24h', from, to));
}

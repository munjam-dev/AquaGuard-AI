import { NextResponse } from 'next/server';
import { history } from '@/server/queries';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  return NextResponse.json(history(u.get('pipeline') ?? 'all', Math.min(30, Math.max(1, Number(u.get('days') ?? 7)))));
}

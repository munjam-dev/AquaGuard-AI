import { NextResponse } from 'next/server';
import { state } from '@/server/queries';
import { tickIfDue } from '@/server/runtime';

export const dynamic = 'force-dynamic';

/** Polled by the dashboard. While the simulator runs, each poll advances the simulation when a tick is due. */
export async function GET() {
  tickIfDue();
  return NextResponse.json(state());
}

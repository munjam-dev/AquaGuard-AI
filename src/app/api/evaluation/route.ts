import { NextResponse } from 'next/server';
import { runEvaluation, type EvalReport } from '@/engine/evaluation';
import { getDb } from '@/server/db';
import { getRuntime } from '@/server/runtime';

export const dynamic = 'force-dynamic';

function latest(): EvalReport | null {
  const row = getDb().prepare('SELECT report FROM evaluation_runs ORDER BY id DESC LIMIT 1').get() as { report: string } | undefined;
  return row ? JSON.parse(row.report) : null;
}
function rerun(): EvalReport {
  const t0 = performance.now();
  const rep = runEvaluation(getRuntime().settings, 6);
  getDb().prepare('INSERT INTO evaluation_runs (ts, report) VALUES (?, ?)').run(Date.now(), JSON.stringify(rep));
  void t0;
  return rep;
}

export async function GET() {
  getRuntime();
  return NextResponse.json(latest() ?? rerun());
}

/** Re-run all known test conditions against the current settings. */
export async function POST() {
  getRuntime();
  return NextResponse.json(rerun());
}

'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Anomaly } from '@/engine/types';
import { recommendedActions } from '@/engine/response';
import { post, sevLabel, sevTone } from '@/lib/format';
import { useApi, useApp } from './provider';
import { Card, Pill } from './ui';

interface Valves { valves: { pipeline_id: string; isolated: boolean; since: number | null }[] }
const PRIORITY: Record<string, string> = { critical: 'urgent', warning: 'high', attention: 'normal' };

/** Isolate / restore a section (simulated valve) and raise a repair work order straight from a finding. */
export function useControls(pipeline: string) {
  const { state, refresh } = useApp();
  const [bump, setBump] = useState(0);
  const [msg, setMsg] = useState<{ text: string; ok: boolean; link?: boolean } | null>(null);
  const { data } = useApi<Valves>('/api/valves', `${state?.clock}-${bump}`);
  const isolated = data?.valves.find((v) => v.pipeline_id === pipeline)?.isolated ?? false;
  const run = async (fn: () => Promise<unknown>, ok: string, link = false) => {
    try { await fn(); setMsg({ text: ok, ok: true, link }); setBump((b) => b + 1); await refresh(); } catch (e) { setMsg({ text: (e as Error).message, ok: false }); }
  };
  return {
    isolated, msg,
    isolate: () => run(() => post('/api/valves', { pipeline, action: 'isolate' }), `${pipeline} isolated (simulated).`),
    restore: () => run(() => post('/api/valves', { pipeline, action: 'restore' }), `Flow restored on ${pipeline} (simulated).`),
    createWorkOrder: (a: Anomaly, alertId?: number) => run(async () => {
      const r = await post<{ id: number }>('/api/workorders', { pipeline_id: pipeline, alert_id: alertId, type: a.type, title: `${a.title} on ${pipeline}`, priority: PRIORITY[a.severity] ?? 'normal' });
      return r;
    }, 'Work order created.', true),
  };
}

export function ResponsePanel({ pipeline, anomalies, status }: { pipeline: string; anomalies: Anomaly[]; status?: string }) {
  const c = useControls(pipeline);
  const plans = recommendedActions(anomalies);
  const isolated = c.isolated || status === 'Isolated';
  return (
    <Card title="Response and control" right={isolated ? <Pill tone="att">Section isolated</Pill> : plans.length ? <Pill tone={sevTone(plans[0].severity)}>{plans.length} active</Pill> : <Pill tone="ok">No action needed</Pill>} flag={isolated ? 'att' : plans.length ? sevTone(plans[0].severity) : 'ok'}>
      <div className="note" style={{ marginBottom: 12 }}>Simulation: no physical valve is operated. In production this connects to your SCADA or PLC with operator authorisation and safety interlocks.</div>
      {isolated && (
        <div className="finding att" style={{ marginBottom: 12 }}>
          <h4>{pipeline} is isolated</h4>
          <p>Flow is stopped and the section is depressurising. The underlying fault is not fixed by isolating. Repair it, then restore flow so AquaGuard can verify the repair.</p>
          <div className="row"><button className="btn sm primary" onClick={c.restore}>Restore flow</button><Link href="/maintenance" className="btn sm">Open Control and Repair</Link></div>
        </div>
      )}
      {!isolated && plans.length === 0 && <p className="muted" style={{ margin: 0 }}>No active findings on {pipeline}. If a leak or fault is detected, the recommended response steps appear here.</p>}
      <div className="stack">
        {plans.map((p, pi) => (
          <div key={p.type} className={`finding ${sevTone(p.severity)}`}>
            <h4><Pill tone={sevTone(p.severity)}>{sevLabel(p.severity)}</Pill>{p.title}: recommended response</h4>
            <ol className="evidence" style={{ marginTop: 8 }}>
              {p.steps.map((s) => (
                <li key={s.step} style={{ marginBottom: 6 }}>
                  <b>{s.step}.</b> <span className="muted">{s.detail}</span>
                  {s.control === 'isolate' && !isolated && <div><button className="btn sm danger" style={{ marginTop: 6 }} onClick={() => { if (window.confirm(`Isolate ${pipeline}? Flow to this section will stop (simulated).`)) c.isolate(); }}>Isolate section</button></div>}
                  {s.control === 'workorder' && <div><button className="btn sm primary" style={{ marginTop: 6 }} onClick={() => c.createWorkOrder(anomalies[pi])}>Create work order</button></div>}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      {c.msg && <div className="note" style={{ marginTop: 12, borderLeftColor: c.msg.ok ? 'var(--ok)' : 'var(--crit)' }}>{c.msg.text} {c.msg.link && c.msg.ok && <Link href="/maintenance" style={{ color: 'var(--accent)', fontWeight: 600 }}>Open Control and Repair</Link>}</div>}
    </Card>
  );
}

'use client';

import { useState } from 'react';
import { useApi, useApp } from '@/components/provider';
import { Card, Pill } from '@/components/ui';
import { fmtDateTime, post, statusTone } from '@/lib/format';
import type { WorkOrder } from '@/server/workorders';

interface Valves { valves: { pipeline_id: string; isolated: boolean; since: number | null }[]; log: { id: number; ts: number; pipeline_id: string; action: string; by: string; note: string | null }[] }
const PRIO: Record<string, 'crit' | 'warn' | 'att' | 'neutral'> = { urgent: 'crit', high: 'warn', normal: 'att', low: 'neutral' };
const COLS: { key: string; title: string; hint: string; statuses: string[] }[] = [
  { key: 'open', title: 'Open', hint: 'Waiting for a crew', statuses: ['open', 'assigned'] },
  { key: 'prog', title: 'In progress', hint: 'Crew on site', statuses: ['in_progress'] },
  { key: 'rep', title: 'Repaired', hint: 'Awaiting verification', statuses: ['repaired'] },
  { key: 'done', title: 'Verified and closed', hint: 'Fix confirmed', statuses: ['verified', 'closed', 'cancelled'] },
];
const TYPES = ['LEAK', 'BLOCKAGE', 'PRESSURE_DROP', 'ABNORMAL_FLOW', 'STRESS', 'SENSOR_FAILURE', 'MISSING_DATA', 'HIGH_TURBIDITY', 'HIGH_PH', 'LOW_PH', 'CONTAMINATION'];

function Order({ wo, act, busy }: { wo: WorkOrder; act: (id: number, action: string, extra?: Record<string, string>) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState('');
  const [note, setNote] = useState('');
  return (
    <div className="finding" style={{ background: 'var(--panel)' }}>
      <h4 style={{ justifyContent: 'space-between' }}><span>#{wo.id} {wo.title}</span><Pill tone={PRIO[wo.priority]}>{wo.priority}</Pill></h4>
      <div className="small muted">{wo.pipeline_id} · {wo.type.replace(/_/g, ' ').toLowerCase()} · {wo.assignee ? `assigned to ${wo.assignee}` : 'unassigned'}</div>
      <div className="small" style={{ marginTop: 4 }}><b>{wo.status.replace('_', ' ')}</b> · updated {fmtDateTime(wo.updated_ts)}</div>
      <div className="row" style={{ marginTop: 8, gap: 6 }}>
        {(wo.status === 'open' || wo.status === 'assigned') && <button className="btn sm" disabled={busy} onClick={() => act(wo.id, 'start')}>Start work</button>}
        {['open', 'assigned', 'in_progress'].includes(wo.status) && <button className="btn sm primary" disabled={busy} onClick={() => act(wo.id, 'repaired')}>Mark repaired</button>}
        {wo.status === 'repaired' && <button className="btn sm" disabled={busy} onClick={() => act(wo.id, 'verify')}>Verify manually</button>}
        {wo.status === 'verified' && <button className="btn sm" disabled={busy} onClick={() => act(wo.id, 'close')}>Close</button>}
        {!['closed', 'cancelled'].includes(wo.status) && <button className="btn sm" disabled={busy} onClick={() => { if (window.confirm('Cancel this work order?')) act(wo.id, 'cancel'); }}>Cancel</button>}
        <button className="btn sm" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Details'}</button>
      </div>
      {open && (
        <div style={{ marginTop: 10 }}>
          {!['closed', 'cancelled'].includes(wo.status) && (
            <div className="row" style={{ marginBottom: 8 }}>
              <input className="field" style={{ minHeight: 30, flex: 1 }} placeholder="Assign to (name or crew)" value={who} onChange={(e) => setWho(e.target.value)} />
              <button className="btn sm" disabled={!who.trim() || busy} onClick={() => { act(wo.id, 'assign', { assignee: who }); setWho(''); }}>Assign</button>
            </div>
          )}
          <div className="row" style={{ marginBottom: 8 }}>
            <input className="field" style={{ minHeight: 30, flex: 1 }} placeholder="Add a note" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn sm" disabled={!note.trim() || busy} onClick={() => { act(wo.id, 'note', { note }); setNote(''); }}>Add</button>
          </div>
          <ul className="evidence small">{wo.events.map((e) => <li key={e.id}><span className="mono muted">{fmtDateTime(e.ts)}</span> {e.text} <span className="muted">({e.by})</span></li>)}</ul>
        </div>
      )}
    </div>
  );
}

export default function Maintenance() {
  const { state, refresh } = useApp();
  const [bump, setBump] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({ pipeline_id: 'PIPE-001', type: 'LEAK', title: '', priority: 'high', assignee: '', note: '' });
  const key = `${state?.clock}-${bump}`;
  const wos = useApi<{ workOrders: WorkOrder[] }>('/api/workorders', key).data?.workOrders ?? [];
  const valves = useApi<Valves>('/api/valves', key).data;

  const wrap = async (fn: () => Promise<unknown>) => { setBusy(true); setErr(null); try { await fn(); setBump((b) => b + 1); await refresh(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  const act = (id: number, action: string, extra: Record<string, string> = {}) => wrap(() => post(`/api/workorders/${id}`, { action, ...extra }, 'PATCH'));
  const valve = (pipeline: string, action: 'isolate' | 'restore') => wrap(() => post('/api/valves', { pipeline, action }));
  const create = () => wrap(async () => { await post('/api/workorders', { ...form, title: form.title || `${form.type.replace(/_/g, ' ').toLowerCase()} on ${form.pipeline_id}` }); setForm({ ...form, title: '', note: '' }); });

  const active = wos.filter((w) => !['closed', 'cancelled'].includes(w.status)).length;

  return (
    <>
      <div className="note">Simulation: valve actions change the simulated sensors only. No physical valve is operated. In production, connect this page to your SCADA or PLC with operator authorisation and safety interlocks. Isolating stops the loss but does not fix the fault. Record a repair, restore flow, and AquaGuard verifies the fix from live readings.</div>
      {err && <div className="note" style={{ borderLeftColor: 'var(--crit)' }}>{err}</div>}

      <Card title="Valve control (simulated)" bodyClass="scroll-x" right={<span className="small muted">{valves?.valves.filter((v) => v.isolated).length ?? 0} isolated</span>}>
        <table className="tbl">
          <thead><tr><th>Pipeline</th><th>Status</th><th>Health</th><th>Leak prob.</th><th>Valve</th><th /></tr></thead>
          <tbody>{state?.pipelines.map((p) => {
            const iso = valves?.valves.find((v) => v.pipeline_id === p.cfg.id)?.isolated ?? false;
            return (
              <tr key={p.cfg.id}>
                <td><b>{p.cfg.id}</b> <span className="muted">{p.cfg.name}</span></td>
                <td>{p.analysis && <Pill tone={statusTone(p.analysis.status)}>{p.analysis.status}</Pill>}</td>
                <td className="mono">{p.analysis?.health.score}%</td><td className="mono">{p.analysis?.leak.probability}%</td>
                <td>{iso ? <Pill tone="att">Closed (isolated)</Pill> : <Pill tone="ok">Open</Pill>}</td>
                <td>{iso ? <button className="btn sm primary" disabled={busy} onClick={() => valve(p.cfg.id, 'restore')}>Restore flow</button>
                  : <button className="btn sm danger" disabled={busy} onClick={() => { if (window.confirm(`Isolate ${p.cfg.id}? Flow to this section will stop (simulated).`)) valve(p.cfg.id, 'isolate'); }}>Isolate section</button>}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </Card>

      <Card title="New work order" bodyClass="card-b">
        <div className="formgrid">
          <label>Pipeline<select className="field" value={form.pipeline_id} onChange={(e) => setForm({ ...form, pipeline_id: e.target.value })}>{state?.pipelines.map((p) => <option key={p.cfg.id}>{p.cfg.id}</option>)}</select></label>
          <label>Issue<select className="field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ').toLowerCase()}</option>)}</select></label>
          <label>Priority<select className="field" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option value="urgent">urgent</option><option value="high">high</option><option value="normal">normal</option><option value="low">low</option></select></label>
          <label>Assign to<input className="field" placeholder="optional" value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })} /></label>
          <label style={{ gridColumn: 'span 2' }}>Title<input className="field" placeholder="e.g. Clamp leak near Katraj junction" maxLength={140} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
        </div>
        <div className="row" style={{ marginTop: 12 }}><button className="btn primary" disabled={busy} onClick={create}>Create work order</button></div>
      </Card>

      <h2 style={{ fontSize: 15 }}>Repair board <span className="muted" style={{ fontWeight: 400 }}>({active} active)</span></h2>
      <div className="grid g4" style={{ alignItems: 'start' }}>
        {COLS.map((c) => {
          const items = wos.filter((w) => c.statuses.includes(w.status));
          return (
            <Card key={c.key} title={`${c.title} (${items.length})`} right={<span className="small muted">{c.hint}</span>}>
              <div className="stack">
                {items.length === 0 && <div className="muted small">Nothing here.</div>}
                {items.map((w) => <Order key={w.id} wo={w} act={act} busy={busy} />)}
              </div>
            </Card>
          );
        })}
      </div>

      <Card title="Valve action log" bodyClass="">
        {(valves?.log.length ?? 0) === 0 ? <div className="empty">No valve actions yet.</div> : (
          <table className="tbl"><thead><tr><th>When</th><th>Pipeline</th><th>Action</th><th>By</th><th>Note</th></tr></thead>
            <tbody>{valves!.log.map((l) => <tr key={l.id}><td className="mono small nowrap">{fmtDateTime(l.ts)}</td><td className="mono">{l.pipeline_id}</td><td>{l.action === 'isolate' ? 'Isolated' : 'Restored'}</td><td>{l.by}</td><td className="muted">{l.note}</td></tr>)}</tbody></table>
        )}
      </Card>
    </>
  );
}

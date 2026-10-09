import type { Analysis } from '@/engine/types';
import { bind, getDb, prep, tx } from './db';
import { getRuntime } from './runtime';

export type WoStatus = 'open' | 'assigned' | 'in_progress' | 'repaired' | 'verified' | 'closed' | 'cancelled';
export type WoAction = 'assign' | 'start' | 'repaired' | 'verify' | 'close' | 'cancel' | 'note';
export interface WorkOrder {
  id: number; pipeline_id: string; alert_id: number | null; type: string; title: string; priority: 'urgent' | 'high' | 'normal' | 'low';
  status: WoStatus; assignee: string | null; created_ts: number; updated_ts: number; closed_ts: number | null;
  events: { id: number; ts: number; kind: string; text: string; by: string }[];
}
const VERIFY_READINGS = 5;
const PRIORITIES = ['urgent', 'high', 'normal', 'low'];

function event(woId: number, kind: string, text: string, by = 'System') {
  const rt = getRuntime();
  prep(getDb(), 'INSERT INTO work_order_events (wo_id, ts, kind, text, by) VALUES (?,?,?,?,?)').run(...bind(woId, rt.sim.clock, kind, text, by));
}

export function listWorkOrders(status = 'all'): WorkOrder[] {
  const db = getDb();
  const where = status === 'active' ? "WHERE status NOT IN ('closed','cancelled')" : status === 'all' ? '' : 'WHERE status = ?';
  const rows = db.prepare(`SELECT * FROM work_orders ${where} ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, created_ts DESC`).all(...(where.includes('?') ? [status] : [])) as unknown as Omit<WorkOrder, 'events'>[];
  const ev = db.prepare('SELECT * FROM work_order_events WHERE wo_id = ? ORDER BY id');
  return rows.map((r) => ({ ...r, events: ev.all(r.id) as unknown as WorkOrder['events'] }));
}

export function createWorkOrder(i: { pipeline_id: string; alert_id?: number | null; type?: string; title?: string; priority?: string; assignee?: string | null; note?: string; by?: string }) {
  const rt = getRuntime(); const db = getDb();
  if (!rt.pipelines.some((p) => p.id === i.pipeline_id)) throw new Error('Unknown pipeline');
  const title = (i.title ?? '').trim().slice(0, 140) || `Inspect ${i.pipeline_id}`;
  const priority = PRIORITIES.includes(i.priority ?? '') ? i.priority! : 'normal';
  const assignee = i.assignee?.trim().slice(0, 60) || null;
  return tx(db, () => {
    const r = prep(db, 'INSERT INTO work_orders (pipeline_id, alert_id, type, title, priority, status, assignee, created_ts, updated_ts) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(...bind(i.pipeline_id, i.alert_id ?? null, i.type ?? 'LEAK', title, priority, assignee ? 'assigned' : 'open', assignee, rt.sim.clock, rt.sim.clock));
    const id = Number(r.lastInsertRowid);
    event(id, 'created', `Work order created${i.alert_id ? ` from alert #${i.alert_id}` : ''}. Priority ${priority}.`, i.by ?? 'Operator');
    if (assignee) event(id, 'assigned', `Assigned to ${assignee}.`, i.by ?? 'Operator');
    if (i.note?.trim()) event(id, 'note', i.note.trim().slice(0, 500), i.by ?? 'Operator');
    if (i.alert_id) prep(db, "UPDATE alerts SET status='acknowledged', note=?, updated_ts=? WHERE id=? AND status='open'").run(...bind(`Work order #${id}`, rt.sim.clock, i.alert_id));
    return id;
  });
}

function resolveAlert(wo: { alert_id: number | null; pipeline_id: string; type: string }, note: string) {
  const rt = getRuntime();
  const db = getDb();
  if (wo.alert_id) prep(db, "UPDATE alerts SET status='resolved', resolved_ts=?, updated_ts=?, note=? WHERE id=? AND status IN ('open','acknowledged')").run(...bind(rt.sim.clock, rt.sim.clock, note, wo.alert_id));
  prep(db, "UPDATE alerts SET status='resolved', resolved_ts=?, updated_ts=?, note=? WHERE pipeline_id=? AND type=? AND status IN ('open','acknowledged')").run(...bind(rt.sim.clock, rt.sim.clock, note, wo.pipeline_id, wo.type));
}

export function actOnWorkOrder(id: number, action: WoAction, p: { assignee?: string; note?: string; by?: string }) {
  const rt = getRuntime(); const db = getDb();
  const wo = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id) as unknown as Omit<WorkOrder, 'events'> | undefined;
  if (!wo) throw new Error('Work order not found');
  const by = p.by ?? 'Operator'; const now = rt.sim.clock;
  const set = (status: WoStatus, extra = '') => prep(db, `UPDATE work_orders SET status=?, updated_ts=?${extra} WHERE id=?`).run(...bind(status, now, id));
  const done = wo.status === 'closed' || wo.status === 'cancelled';
  if (done && action !== 'note') throw new Error(`Work order is already ${wo.status}`);
  tx(db, () => {
    switch (action) {
      case 'assign': {
        const who = p.assignee?.trim().slice(0, 60); if (!who) throw new Error('Assignee is required');
        prep(db, 'UPDATE work_orders SET assignee=?, status=CASE WHEN status=? THEN ? ELSE status END, updated_ts=? WHERE id=?').run(...bind(who, 'open', 'assigned', now, id));
        event(id, 'assigned', `Assigned to ${who}.`, by); break;
      }
      case 'start': if (!['open', 'assigned'].includes(wo.status)) throw new Error('Only open or assigned orders can be started'); set('in_progress'); event(id, 'started', 'Crew on site, work started.', by); break;
      case 'repaired': {
        if (!['open', 'assigned', 'in_progress'].includes(wo.status)) throw new Error('This order is not awaiting repair');
        set('repaired'); rt.verify.set(id, 0);
        // the physical fix: the underlying fault in the simulated pipeline is removed
        rt.sim.scenarios[wo.pipeline_id] = { scenario: 'normal', k: -1 };
        event(id, 'repaired', rt.isolated.has(wo.pipeline_id) ? 'Repair recorded. Restore flow to verify the fix.' : 'Repair recorded. Verifying against live readings.', by); break;
      }
      case 'verify': if (wo.status !== 'repaired') throw new Error('Only repaired orders can be verified'); set('verified'); event(id, 'verified', 'Verified manually by operator.', by); resolveAlert(wo, `Resolved by work order #${id}`); break;
      case 'close': if (wo.status !== 'verified') throw new Error('Verify the repair before closing'); set('closed', ', closed_ts=' + now); event(id, 'closed', 'Work order closed.', by); break;
      case 'cancel': set('cancelled', ', closed_ts=' + now); event(id, 'cancelled', p.note?.trim() ? `Cancelled: ${p.note.trim().slice(0, 200)}` : 'Cancelled.', by); break;
      case 'note': { const t = p.note?.trim(); if (!t) throw new Error('Note is empty'); prep(db, 'UPDATE work_orders SET updated_ts=? WHERE id=?').run(now, id); event(id, 'note', t.slice(0, 500), by); break; }
      default: throw new Error('Unknown action');
    }
  });
}

// ------------------------------------------------------------------ valves (simulated)
export function valveState() {
  const rt = getRuntime();
  const rows = getDb().prepare('SELECT * FROM valve_actions ORDER BY id DESC LIMIT 40').all() as unknown as { id: number; ts: number; pipeline_id: string; action: string; by: string; note: string | null }[];
  const since = new Map<string, number>();
  for (const r of [...rows].reverse()) if (r.action === 'isolate') since.set(r.pipeline_id, r.ts); else since.delete(r.pipeline_id);
  return { valves: rt.pipelines.map((p) => ({ pipeline_id: p.id, isolated: rt.isolated.has(p.id), since: since.get(p.id) ?? null })), log: rows };
}

export function setValve(pipeline: string, action: 'isolate' | 'restore', by = 'Operator', note?: string) {
  const rt = getRuntime();
  if (!rt.pipelines.some((p) => p.id === pipeline)) throw new Error('Unknown pipeline');
  if (action === 'isolate' && rt.isolated.has(pipeline)) throw new Error('Section is already isolated');
  if (action === 'restore' && !rt.isolated.has(pipeline)) throw new Error('Section is not isolated');
  if (action === 'isolate') rt.isolated.add(pipeline); else rt.isolated.delete(pipeline);
  prep(getDb(), 'INSERT INTO valve_actions (ts, pipeline_id, action, by, note) VALUES (?,?,?,?,?)').run(...bind(rt.sim.clock, pipeline, action, by, note ?? (action === 'isolate' ? 'Section isolated (simulated).' : 'Flow restored (simulated).')));
  // pending repairs on this pipeline start verification again once flow is back
  if (action === 'restore') for (const [id] of rt.verify) { const w = getDb().prepare('SELECT pipeline_id FROM work_orders WHERE id = ?').get(id) as { pipeline_id: string } | undefined; if (w?.pipeline_id === pipeline) rt.verify.set(id, 0); }
}

export function loadIsolated() {
  const rt = getRuntime();
  const rows = getDb().prepare('SELECT pipeline_id, action FROM valve_actions ORDER BY id').all() as { pipeline_id: string; action: string }[];
  for (const r of rows) if (r.action === 'isolate') rt.isolated.add(r.pipeline_id); else rt.isolated.delete(r.pipeline_id);
}

/** Called after every reading: repaired work orders are verified automatically once the fault stays gone. */
export function afterIngest(pipeline: string, a: Analysis) {
  const rt = getRuntime();
  if (rt.isolated.has(pipeline) || rt.verify.size === 0) return;
  const db = getDb();
  for (const [id, n] of [...rt.verify]) {
    const wo = db.prepare("SELECT * FROM work_orders WHERE id = ? AND status = 'repaired'").get(id) as unknown as Omit<WorkOrder, 'events'> | undefined;
    if (!wo) { rt.verify.delete(id); continue; }
    if (wo.pipeline_id !== pipeline) continue;
    const still = a.anomalies.some((x) => x.type === wo.type);
    if (still) { rt.verify.set(id, 0); continue; }
    if (n + 1 >= VERIFY_READINGS) {
      prep(db, "UPDATE work_orders SET status='verified', updated_ts=? WHERE id=?").run(rt.sim.clock, id);
      event(id, 'verified', `Verified automatically: ${VERIFY_READINGS} consecutive clean readings after the repair.`);
      resolveAlert(wo, `Resolved: repair verified (work order #${id})`);
      rt.verify.delete(id);
    } else rt.verify.set(id, n + 1);
  }
}

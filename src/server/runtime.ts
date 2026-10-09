import { analyze } from '@/engine/analyze';
import { DEFAULT_SETTINGS, PIPELINES } from '@/engine/config';
import { RANDOM_POOL, makeReading, type Scenario } from '@/engine/simulator';
import { FIELDS, type Analysis, type Anomaly, type PipelineCfg, type Reading, type Settings } from '@/engine/types';
import { mulberry32 } from '@/engine/stats';
import { bind, getDb, prep, tx } from './db';
import { afterIngest, loadIsolated } from './workorders';

export interface SimState {
  running: boolean;
  tick: number;
  scenarios: Record<string, { scenario: Scenario; k: number }>;
  clock: number; // simulated clock (epoch ms)
  speed: number; // simulated minutes per tick
}
interface Runtime {
  settings: Settings;
  pipelines: PipelineCfg[];
  hist: Map<string, Reading[]>;
  latest: Map<string, Analysis>;
  absent: Map<number, number>;
  isolated: Set<string>;
  verify: Map<number, number>;
  sim: SimState;
  lastTickAt: number;
  rnd: () => number;
}
const g = globalThis as unknown as { __aquaRt?: Runtime };
const STEP = 20 * 60000;
const DAYS = 30;

export function getRuntime(): Runtime {
  if (g.__aquaRt) return g.__aquaRt;
  const db = getDb();
  const row = prep(db, 'SELECT value FROM settings WHERE key = ?').get('settings') as { value: string } | undefined;
  const settings: Settings = row ? { ...DEFAULT_SETTINGS, ...JSON.parse(row.value) } : structuredClone(DEFAULT_SETTINGS);
  const prow = prep(db, 'SELECT cfg FROM pipelines').all() as { cfg: string }[];
  const pipelines = prow.length ? prow.map((p) => JSON.parse(p.cfg) as PipelineCfg) : structuredClone(PIPELINES);
  const rt: Runtime = {
    settings, pipelines, hist: new Map(), latest: new Map(), absent: new Map(), isolated: new Set(), verify: new Map(), lastTickAt: 0, rnd: mulberry32(Date.now() & 0xffffff),
    sim: { running: false, tick: 0, scenarios: {}, clock: Date.now(), speed: 1 },
  };
  g.__aquaRt = rt;
  const n = (prep(db, 'SELECT COUNT(*) AS c FROM readings').get() as { c: number }).c;
  if (n === 0) seed(rt); else { restore(rt); loadIsolated(); }
  return rt;
}

function restore(rt: Runtime) {
  const db = getDb();
  for (const p of rt.pipelines) {
    const rows = prep(db, 'SELECT * FROM readings WHERE pipeline_id = ? ORDER BY ts DESC LIMIT 120').all(p.id) as unknown as Record<string, number | null>[];
    const hist = rows.reverse().map((r) => rowToReading(r));
    rt.hist.set(p.id, hist);
    if (hist.length) rt.latest.set(p.id, analyze(hist.slice(-60), p, rt.settings));
    rt.sim.clock = Math.max(rt.sim.clock, hist.length ? hist[hist.length - 1].ts : 0);
    rt.sim.scenarios[p.id] = { scenario: 'normal', k: -1 };
  }
}

const rowToReading = (r: Record<string, unknown>): Reading => {
  const out: Record<string, unknown> = { ts: r.ts, pipeline_id: r.pipeline_id };
  for (const f of FIELDS) out[f] = r[f] ?? null;
  return out as unknown as Reading;
};

// ---------------------------------------------------------------- seeding
interface Episode { pipe: string; daysAgo: number; durSteps: number; scenario: Scenario; ongoing?: boolean }
const EPISODES: Episode[] = [
  { pipe: 'PIPE-002', daysAgo: 2, durSteps: 14, scenario: 'turbidity_spike' },
  { pipe: 'PIPE-004', daysAgo: 5, durSteps: 20, scenario: 'leak' },
  { pipe: 'PIPE-007', daysAgo: 3, durSteps: 14, scenario: 'stress' },
  { pipe: 'PIPE-006', daysAgo: 8, durSteps: 6, scenario: 'pressure_drop' },
  { pipe: 'PIPE-005', daysAgo: 10, durSteps: 22, scenario: 'sensor_failure' },
  { pipe: 'PIPE-008', daysAgo: 12, durSteps: 14, scenario: 'blockage' },
  { pipe: 'PIPE-003', daysAgo: 14, durSteps: 15, scenario: 'low_ph' },
  { pipe: 'PIPE-001', daysAgo: 20, durSteps: 16, scenario: 'high_turbidity' },
  { pipe: 'PIPE-002', daysAgo: 25, durSteps: 8, scenario: 'missing_data' },
];
const ONGOING: { pipe: string; scenario: Scenario; steps: number }[] = [
  { pipe: 'PIPE-007', scenario: 'stress', steps: 9 },
  { pipe: 'PIPE-003', scenario: 'high_turbidity', steps: 10 },
];

function seed(rt: Runtime) {
  const db = getDb();
  const N = (DAYS * 24 * 3600000) / STEP;
  const end = Math.floor(Date.now() / STEP) * STEP;
  tx(db, () => {
    for (const p of rt.pipelines) {
      prep(db, 'INSERT OR REPLACE INTO pipelines (id,name,location,lat,lng,cfg) VALUES (?,?,?,?,?,?)').run(...bind(p.id, p.name, p.location, p.lat, p.lng, JSON.stringify(p)));
      for (const f of ['pH', 'turbidity', 'temperature', 'tds', 'pressure_in', 'pressure_out', 'flow_rate', 'vibration']) {
        prep(db, 'INSERT OR REPLACE INTO sensors (id,pipeline_id,type,status,last_seen) VALUES (?,?,?,?,?)').run(...bind(`${p.id}-${f}`, p.id, f, 'online', end));
      }
    }
    const users: [string, string, string][] = [
      ['Asha Kulkarni', 'engineer', 'Utility Engineer'], ['Rohan Deshmukh', 'engineer', 'Operations Supervisor'],
      ['Meera Iyer', 'admin', 'System Administrator'], ['Vikram Joshi', 'viewer', 'City Water Manager'],
      ['Sana Sheikh', 'viewer', 'Dashboard Analyst'], ['Dev Patil', 'engineer', 'AI Analyst'],
      ['Imran Khan', 'engineer', 'Maintenance Technician'], ['Priya Nair', 'viewer', 'Quality Assurance Inspector'],
      ['Arjun Rao', 'admin', 'Sensor Integration Engineer'], ['Kavita Menon', 'admin', 'Regulatory Compliance Officer'],
    ];
    for (const u of users) prep(db, 'INSERT INTO users (name,role,persona) VALUES (?,?,?)').run(...u);
    prep(db, 'INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run('settings', JSON.stringify(rt.settings));

    for (const p of rt.pipelines) {
      const rnd = mulberry32(p.id.split('-')[1].length * 977 + Number(p.id.slice(-3)) * 131);
      const eps = EPISODES.filter((e) => e.pipe === p.id).map((e) => ({ s: N - e.daysAgo * 72 - 10, d: e.durSteps, sc: e.scenario }));
      for (const o of ONGOING.filter((x) => x.pipe === p.id)) eps.push({ s: N - o.steps, d: o.steps + 1, sc: o.scenario });
      const hist: Reading[] = [];
      for (let i = 0; i < N; i++) {
        const ep = eps.find((e) => i >= e.s && i < e.s + e.d);
        const r = makeReading(p, end - (N - 1 - i) * STEP, ep ? ep.sc : 'normal', ep ? i - ep.s : -1, rnd);
        hist.push(r);
        if (hist.length > 120) hist.shift();
        const a = analyze(hist.slice(-60), p, rt.settings);
        persist(rt, r, a, "seed", i === N - 1);
        if (i === N - 1) rt.latest.set(p.id, a);
      }
      rt.hist.set(p.id, hist);
      const on = ONGOING.find((x) => x.pipe === p.id);
      rt.sim.scenarios[p.id] = on ? { scenario: on.scenario, k: on.steps } : { scenario: 'normal', k: -1 };
    }
    // a couple of maintenance events for the audit trail
    const me = prep(db, 'INSERT INTO maintenance_events (pipeline_id,ts,kind,note,status) VALUES (?,?,?,?,?)');
    me.run('PIPE-004', end - 4.8 * 86400000, 'Leak repair', 'Clamp installed after leak alert; pressure restored.', 'completed');
    me.run('PIPE-005', end - 9.7 * 86400000, 'Sensor replacement', 'pH probe replaced after frozen-reading alert.', 'completed');
    me.run('PIPE-007', end - 2 * 3600000, 'Inspection requested', 'Booster station vibration inspection requested.', 'open');
  });
  rt.sim.clock = end;
}

// ---------------------------------------------------------------- persistence + alerts
function persist(rt: Runtime, r: Reading, a: Analysis, source: string, final: boolean) {
  const db = getDb();
  prep(db, `INSERT INTO readings (pipeline_id,ts,${FIELDS.join(',')},quality,health,leak,stress,reliability,status,source)
    VALUES (?,?,${FIELDS.map(() => '?').join(',')},?,?,?,?,?,?,?)`).run(
    ...bind(r.pipeline_id, r.ts, ...FIELDS.map((f) => r[f] ?? null), a.quality.score, a.health.score, a.leak.probability, a.stress.score, a.reliability.overall, a.status, source),
  );
  processAlerts(rt, r.pipeline_id, a, r.ts);
  if (final) {
    prep(db, 'DELETE FROM predictions WHERE pipeline_id = ?').run(r.pipeline_id);
    for (const p of a.predictions) prep(db, 'INSERT INTO predictions (pipeline_id,ts,kind,severity,title,text,probability,confidence) VALUES (?,?,?,?,?,?,?,?)').run(...bind(r.pipeline_id, r.ts, p.kind, p.severity, p.title, p.text, p.probability, p.confidence));
  }
}

function allowed(a: Anomaly, s: Settings) {
  const minConf = { low: 70, medium: 50, high: 30 }[s.sensitivity.alert];
  if (s.sensitivity.alert === 'low' && a.severity === 'attention') return false;
  return a.confidence >= minConf;
}

function processAlerts(rt: Runtime, pipe: string, a: Analysis, ts: number) {
  if (rt.isolated.has(pipe)) return; // an isolated section keeps its alerts open until the repair is verified
  const db = getDb();
  const open = prep(db, "SELECT id, type FROM alerts WHERE pipeline_id = ? AND status IN ('open','acknowledged')").all(pipe) as { id: number; type: string }[];
  const active = a.anomalies.filter((x) => allowed(x, rt.settings));
  for (const an of active) {
    const ex = open.find((o) => o.type === an.type);
    if (ex) {
      prep(db, 'UPDATE alerts SET severity=?, summary=?, evidence=?, probability=?, confidence=?, updated_ts=? WHERE id=?').run(...bind(an.severity, an.summary, JSON.stringify(an.evidence), an.probability, an.confidence, ts, ex.id));
      rt.absent.set(ex.id, 0);
    } else {
      prep(db, `INSERT INTO alerts (pipeline_id,type,category,severity,title,summary,evidence,probability,confidence,status,created_ts,updated_ts)
        VALUES (?,?,?,?,?,?,?,?,?,'open',?,?)`).run(...bind(pipe, an.type, an.category, an.severity, an.title, an.summary, JSON.stringify(an.evidence), an.probability, an.confidence, ts, ts));
      prep(db, 'INSERT INTO anomalies (pipeline_id,ts,type,severity,probability,confidence,explanation) VALUES (?,?,?,?,?,?,?)').run(...bind(pipe, ts, an.type, an.severity, an.probability, an.confidence, JSON.stringify({ title: an.title, summary: an.summary, evidence: an.evidence })));
    }
  }
  for (const o of open) {
    if (active.some((x) => x.type === o.type)) continue;
    const c = (rt.absent.get(o.id) ?? 0) + 1;
    rt.absent.set(o.id, c);
    if (c >= 3) {
      prep(db, "UPDATE alerts SET status='resolved', resolved_ts=?, updated_ts=?, note=COALESCE(note,'Auto-resolved: condition cleared') WHERE id=?").run(ts, ts, o.id);
      rt.absent.delete(o.id);
    }
  }
}

// ---------------------------------------------------------------- ingestion (POST /api/sensor-data lands here)
export function ingest(input: Reading, source = 'api'): Analysis {
  const rt = getRuntime();
  const cfg = rt.pipelines.find((p) => p.id === input.pipeline_id);
  if (!cfg) throw new Error(`Unknown pipeline_id ${input.pipeline_id}`);
  const r: Reading = { ...input };
  const cal = rt.settings.calibration[cfg.id] ?? {};
  for (const f of FIELDS) {
    const v = r[f];
    if (typeof v === 'number' && cal[f]) (r as unknown as Record<string, number>)[f] = v + cal[f]!;
    if (v === undefined) (r as unknown as Record<string, null>)[f] = null;
  }
  const hist = rt.hist.get(cfg.id) ?? [];
  hist.push(r); if (hist.length > 200) hist.shift();
  rt.hist.set(cfg.id, hist);
  let a = analyze(hist.slice(-60), cfg, rt.settings);
  if (rt.isolated.has(cfg.id)) a = applyIsolation(a, rt.latest.get(cfg.id));
  rt.latest.set(cfg.id, a);
  const db = getDb();
  tx(db, () => persist(rt, r, a, source, true));
  afterIngest(cfg.id, a);
  return a;
}

/** An operator-isolated section has no flow by design: report that state instead of flagging the dead line as a fault. */
function applyIsolation(a: Analysis, prev?: Analysis): Analysis {
  const note = 'Section isolated by operator (simulated valve closed). Flow is intentionally stopped.';
  return {
    ...a, status: 'Isolated', anomalies: [], flags: [], predictions: [],
    health: prev?.health ?? a.health, // keep the pre-isolation health rather than scoring a dead line
    leak: { ...a.leak, probability: 0, class: 'No Leak', evidence: [note], explanation: note },
    stress: { ...a.stress, risk: 'LOW', score: 0, evidence: [], explanation: note },
  };
}

// ---------------------------------------------------------------- simulation
export function tickAll(): void {
  const rt = getRuntime();
  rt.sim.tick++;
  rt.sim.clock += rt.sim.speed * 60000;
  for (const p of rt.pipelines) {
    const st = rt.sim.scenarios[p.id] ?? { scenario: 'normal' as Scenario, k: -1 };
    if (rt.isolated.has(p.id)) {
      // closed valve: no flow, section depressurises, vibration stops; the underlying fault is frozen in place
      const r = makeReading(p, rt.sim.clock, 'normal', -1, rt.rnd);
      r.flow_rate = Math.max(0, rt.rnd() * 0.4); r.pressure_out = Math.max(0.1, r.pressure_out! * 0.08); r.vibration = 0.03 + rt.rnd() * 0.01;
      ingest(r, 'simulator');
      continue;
    }
    const k = st.scenario === 'normal' ? -1 : st.k;
    const r = makeReading(p, rt.sim.clock, st.scenario, k, rt.rnd);
    if (st.scenario !== 'normal') st.k++;
    rt.sim.scenarios[p.id] = st;
    ingest(r, 'simulator');
  }
}
export function tickIfDue(): void {
  const rt = getRuntime();
  if (!rt.sim.running) return;
  const now = Date.now();
  if (now - rt.lastTickAt < 1500) return;
  rt.lastTickAt = now;
  tickAll();
}
export function simControl(body: { action: string; scenario?: Scenario | 'random'; pipeline?: string }) {
  const rt = getRuntime();
  if (body.action === 'start') { rt.sim.running = true; rt.lastTickAt = 0; }
  else if (body.action === 'stop') rt.sim.running = false;
  else if (body.action === 'scenario') {
    let sc = body.scenario ?? 'normal'; let pipe = body.pipeline;
    if (sc === 'random') { sc = RANDOM_POOL[Math.floor(rt.rnd() * RANDOM_POOL.length)]; pipe = rt.pipelines[Math.floor(rt.rnd() * rt.pipelines.length)].id; }
    if (sc === 'normal' && (!pipe || pipe === 'ALL')) for (const p of rt.pipelines) rt.sim.scenarios[p.id] = { scenario: 'normal', k: -1 };
    else if (pipe) rt.sim.scenarios[pipe] = { scenario: sc as Scenario, k: 0 };
    if (!rt.sim.running) { rt.sim.running = true; rt.lastTickAt = 0; }
    tickAll(); // react immediately
    rt.lastTickAt = Date.now();
    return { scenario: sc, pipeline: pipe };
  }
  return {};
}

export function setSettings(next: Partial<Settings>, pipelines?: PipelineCfg[]) {
  const rt = getRuntime();
  rt.settings = { ...rt.settings, ...next, limits: { ...rt.settings.limits, ...(next.limits ?? {}) }, sensors: { ...rt.settings.sensors, ...(next.sensors ?? {}) }, sensitivity: { ...rt.settings.sensitivity, ...(next.sensitivity ?? {}) } };
  const db = getDb();
  prep(db, 'INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run('settings', JSON.stringify(rt.settings));
  if (pipelines) {
    rt.pipelines = pipelines;
    for (const p of pipelines) prep(db, 'INSERT OR REPLACE INTO pipelines (id,name,location,lat,lng,cfg) VALUES (?,?,?,?,?,?)').run(...bind(p.id, p.name, p.location, p.lat, p.lng, JSON.stringify(p)));
  }
  for (const p of rt.pipelines) { const h = rt.hist.get(p.id); if (h?.length) rt.latest.set(p.id, analyze(h.slice(-60), p, rt.settings)); }
  return rt.settings;
}

export const statusRank = { Healthy: 0, Warning: 1, Risk: 2, Critical: 3 } as const;

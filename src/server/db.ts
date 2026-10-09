import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';

type Db = DatabaseSync;
const g = globalThis as unknown as { __aquaDb?: Db };

/** SQLite via Node's built-in driver (no native build step). Swap this module for Postgres in production. */
export function getDb(): Db {
  if (g.__aquaDb) return g.__aquaDb;
  const req = createRequire(path.join(process.cwd(), 'noop.js'));
  const { DatabaseSync: DB } = req('node:sqlite') as typeof import('node:sqlite');
  const dir = path.join(process.cwd(), 'data');
  fs.mkdirSync(dir, { recursive: true });
  const db = new DB(path.join(dir, 'aquaguard.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT, role TEXT, persona TEXT);
    CREATE TABLE IF NOT EXISTS pipelines (id TEXT PRIMARY KEY, name TEXT, location TEXT, lat REAL, lng REAL, cfg TEXT);
    CREATE TABLE IF NOT EXISTS sensors (id TEXT PRIMARY KEY, pipeline_id TEXT, type TEXT, status TEXT, last_seen INTEGER);
    CREATE TABLE IF NOT EXISTS readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT, pipeline_id TEXT NOT NULL, ts INTEGER NOT NULL,
      pH REAL, turbidity REAL, temperature REAL, tds REAL, conductivity REAL, dissolved_oxygen REAL, orp REAL, chlorine REAL,
      pressure_in REAL, pressure_out REAL, flow_rate REAL, vibration REAL, acoustic REAL,
      quality REAL, health REAL, leak REAL, stress REAL, reliability REAL, status TEXT, source TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_readings ON readings (pipeline_id, ts);
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, pipeline_id TEXT, type TEXT, category TEXT, severity TEXT, title TEXT, summary TEXT,
      evidence TEXT, probability REAL, confidence REAL, status TEXT, created_ts INTEGER, updated_ts INTEGER, resolved_ts INTEGER, note TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_alerts ON alerts (status, created_ts);
    CREATE TABLE IF NOT EXISTS anomalies (
      id INTEGER PRIMARY KEY AUTOINCREMENT, pipeline_id TEXT, ts INTEGER, type TEXT, severity TEXT, probability REAL, confidence REAL, explanation TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_anom ON anomalies (pipeline_id, ts);
    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, pipeline_id TEXT, ts INTEGER, kind TEXT, severity TEXT, title TEXT, text TEXT, probability REAL, confidence REAL
    );
    CREATE TABLE IF NOT EXISTS maintenance_events (id INTEGER PRIMARY KEY AUTOINCREMENT, pipeline_id TEXT, ts INTEGER, kind TEXT, note TEXT, status TEXT);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS work_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT, pipeline_id TEXT, alert_id INTEGER, type TEXT, title TEXT, priority TEXT, status TEXT,
      assignee TEXT, created_ts INTEGER, updated_ts INTEGER, closed_ts INTEGER
    );
    CREATE TABLE IF NOT EXISTS work_order_events (id INTEGER PRIMARY KEY AUTOINCREMENT, wo_id INTEGER, ts INTEGER, kind TEXT, text TEXT, by TEXT);
    CREATE TABLE IF NOT EXISTS valve_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, pipeline_id TEXT, action TEXT, by TEXT, note TEXT);
    CREATE TABLE IF NOT EXISTS evaluation_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, report TEXT);
  `);
  g.__aquaDb = db;
  return db;
}

type Bind = string | number | null;
export const bind = (...v: unknown[]): Bind[] => v.map((x) => (x === undefined || (typeof x === 'number' && !Number.isFinite(x)) ? null : (x as Bind)));

export function tx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

const cache = new WeakMap<object, Map<string, ReturnType<Db['prepare']>>>();
/** Prepared-statement cache: re-preparing SQL per row dominated seeding time. */
export function prep(db: Db, sql: string) {
  let m = cache.get(db);
  if (!m) { m = new Map(); cache.set(db, m); }
  let s = m.get(sql);
  if (!s) { s = db.prepare(sql); m.set(sql, s); }
  return s;
}

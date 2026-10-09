'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { PipelineCfg, Settings } from '@/engine/types';
import type { AppState, PipelineDetail } from '@/lib/types';
import { api, post } from '@/lib/format';

interface Ctx {
  state: AppState | null;
  error: string | null;
  selected: string;
  select: (id: string) => void;
  settings: Settings | null;
  pipelines: PipelineCfg[];
  reloadSettings: () => Promise<void>;
  refresh: () => Promise<void>;
  simulate: (body: { action: string; scenario?: string; pipeline?: string }) => Promise<void>;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}
const C = createContext<Ctx | null>(null);
export const useApp = () => { const c = useContext(C); if (!c) throw new Error('AppProvider missing'); return c; };

const safe = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState('PIPE-001');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [pipelines, setPipelines] = useState<PipelineCfg[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try { setState(await api<AppState>('/api/state')); setError(null); } catch (e) { setError((e as Error).message); } finally { busy.current = false; }
  }, []);
  const reloadSettings = useCallback(async () => {
    const r = await api<{ settings: Settings; pipelines: PipelineCfg[] }>('/api/settings');
    setSettings(r.settings); setPipelines(r.pipelines);
  }, []);

  useEffect(() => {
    const t = safe.get('aq-theme');
    const dark = t === 'dark'; // light is the default; dark only when the user chose it
    setTheme(dark ? 'dark' : 'light');
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const s = safe.get('aq-pipe'); if (s) setSelected(s);
    refresh(); reloadSettings().catch(() => undefined);
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [refresh, reloadSettings]);

  const select = (id: string) => { setSelected(id); safe.set('aq-pipe', id); };
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next); document.documentElement.dataset.theme = next; safe.set('aq-theme', next);
  };
  const simulate: Ctx['simulate'] = async (body) => { await post('/api/simulate', body); await refresh(); };

  return <C.Provider value={{ state, error, selected, select, settings, pipelines, reloadSettings, refresh, simulate, theme, toggleTheme }}>{children}</C.Provider>;
}

/** Fetches JSON and refetches whenever `key` changes (e.g. the simulated clock). Keeps the previous data while loading. */
export function useApi<T>(url: string | null, key?: unknown) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    let live = true;
    api<T>(url).then((d) => { if (live) { setData(d); setErr(null); } }).catch((e) => { if (live) setErr((e as Error).message); });
    return () => { live = false; };
  }, [url, key]);
  return { data, err, setData };
}

export function usePipeline(id: string) {
  const { state } = useApp();
  return useApi<PipelineDetail>(`/api/pipeline/${id}`, state?.clock);
}

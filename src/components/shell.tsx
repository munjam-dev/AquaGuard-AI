'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { fmtFull } from '@/lib/format';
import { useApp } from './provider';
import { Icon } from './ui';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/map', label: 'Pipeline Map', icon: 'map' },
  { href: '/leak', label: 'Leak & Stress', icon: 'leak' },
  { href: '/alerts', label: 'Alerts', icon: 'bell' },
  { href: '/maintenance', label: 'Control & Repair', icon: 'wrench' },
  { href: '/history', label: 'Historical Analysis', icon: 'history' },
  { href: '/insights', label: 'Predictive Insights', icon: 'insight' },
  { href: '/performance', label: 'AI Performance', icon: 'gauge' },
  { href: '/assistant', label: 'AI Assistant', icon: 'chat' },
  { href: '/simulation', label: 'Simulation & Input', icon: 'sim' },
  { href: '/admin', label: 'Admin Settings', icon: 'gear' },
];
const TITLES: Record<string, string> = Object.fromEntries(NAV.map((n) => [n.href, n.label]));

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { state, error, simulate, theme, toggleTheme, selected, select } = useApp();
  const [open, setOpen] = useState(false);
  const running = state?.sim.running ?? false;
  const active = (state?.alertCounts.critical ?? 0) + (state?.alertCounts.warning ?? 0) + (state?.alertCounts.attention ?? 0);

  return (
    <div className="shell">
      <aside className={`side ${open ? 'open' : ''}`} aria-label="Primary">
        <Link href="/" className="brand" aria-label="AquaGuard AI home">
          <div className="brand-mark"><Icon name="drop" size={18} /></div>
          <div><b>AquaGuard AI</b><span>Pipeline monitoring</span></div>
        </Link>
        <nav className="nav">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={path === n.href ? 'active' : ''} onClick={() => setOpen(false)} aria-current={path === n.href ? 'page' : undefined}>
              <Icon name={n.icon} />{n.label}
              {n.href === '/alerts' && active > 0 && <span className="badge-n">{active}</span>}
            </Link>
          ))}
        </nav>
        <div className="side-foot">
          <div>Reference standard</div>
          <div style={{ color: 'var(--text)', fontWeight: 500 }}>{state?.settingsStandard ?? '—'}</div>
          <div style={{ marginTop: 8 }}>AI outputs are probabilistic estimates. Verify in the field before acting.</div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="btn menu-btn sm" aria-label="Open menu" onClick={() => setOpen((o) => !o)}><Icon name="menu" /></button>
          <h1>{TITLES[path] ?? 'AquaGuard AI'}</h1>
          <span className={`live ${running ? 'on' : ''}`}><span className={`dot ${running ? 'ok pulse' : ''}`} style={running ? undefined : { background: 'var(--muted)' }} />{running ? 'LIVE SIMULATION' : 'Demo data'}</span>
          <span className="spacer" />
          {state && <span className="mono small muted nowrap" title="Simulated clock (IST)">{fmtFull(state.clock)}</span>}
          <select className="field" aria-label="Active pipeline" value={selected} onChange={(e) => select(e.target.value)}>
            {state?.pipelines.map((p) => <option key={p.cfg.id} value={p.cfg.id}>{p.cfg.id} — {p.cfg.name}</option>)}
          </select>
          <button className={`btn ${running ? 'danger' : 'primary'}`} onClick={() => simulate({ action: running ? 'stop' : 'start' })}>
            <Icon name={running ? 'stop' : 'sim'} size={15} />{running ? 'STOP SIMULATION' : 'START LIVE SIMULATION'}
          </button>
          <button className="btn sm" onClick={toggleTheme} aria-label="Toggle dark mode"><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} /></button>
        </header>
        {error && <div className="note" style={{ margin: '12px 24px 0' }}>Cannot reach the monitoring service: {error}</div>}
        <main className="content">{state ? children : <div className="empty">Loading live sensor data…</div>}</main>
      </div>
    </div>
  );
}

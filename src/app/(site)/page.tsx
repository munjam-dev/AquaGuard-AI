'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight, ArrowsLeftRight, Bell, Brain, ChartLineUp, Database, Drop, LinkBreak, Moon, Path, Play, Prohibit,
  ShieldCheck, Snowflake, Sun, TrendUp, WaveSine,
} from '@phosphor-icons/react';
import { useApi, useApp } from '@/components/provider';
import { Finding, Pill } from '@/components/ui';
import { scoreTone, stressTone } from '@/lib/format';
import type { Prediction } from '@/engine/types';

const PipelineScene = dynamic(() => import('@/components/home/PipelineScene'), { ssr: false });

function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} initial={reduce ? false : { opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  );
}

function Shot({ pos = 'top' }: { pos?: string }) {
  /* real screenshots of the running dashboard, one per theme */
  const style = { objectPosition: pos } as React.CSSProperties;
  return (
    <>
      <img className="shot-light" src="/shots/dash-light.jpg" width={1440} height={900} alt="AquaGuard AI dashboard in light mode showing a detected leak on PIPE-004" loading="lazy" decoding="async" style={style} />
      <img className="shot-dark" src="/shots/dash-dark.jpg" width={1440} height={900} alt="AquaGuard AI dashboard in dark mode showing a detected leak on PIPE-004" loading="lazy" decoding="async" style={style} />
    </>
  );
}

function ScoreRing({ value }: { value: number }) {
  const r = 54, c = 2 * Math.PI * r;
  const tone = scoreTone(value);
  return (
    <div className="ring" role="img" aria-label={`Average water quality score ${value} out of 100`}>
      <svg viewBox="0 0 132 132"><circle cx="66" cy="66" r={r} fill="none" stroke="var(--border)" strokeWidth="10" /><circle cx="66" cy="66" r={r} fill="none" stroke={`var(--${tone})`} strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} style={{ transition: 'stroke-dashoffset 1s ease' }} /></svg>
      <span className="v">{value}</span>
    </div>
  );
}

const CHECKS = [
  { icon: Snowflake, t: 'Frozen readings', d: 'The same value for too long' },
  { icon: Prohibit, t: 'Impossible values', d: 'Outside what physics allows' },
  { icon: WaveSine, t: 'Sudden jumps', d: 'Spikes no real flow can make' },
  { icon: LinkBreak, t: 'Missing data', d: 'Dropped or disconnected sensors' },
  { icon: TrendUp, t: 'Drift', d: 'Slow creep away from calibration' },
  { icon: ArrowsLeftRight, t: 'Conflicting sensors', d: 'Readings that disagree with each other' },
];
const STEPS = [
  { icon: Database, t: 'Collect', d: 'Readings arrive from IoT sensors through one API endpoint, from the simulator, or from manual entry.' },
  { icon: ShieldCheck, t: 'Validate', d: 'Faulty sensors are caught and their values set aside before any detector sees them.' },
  { icon: Brain, t: 'Analyse', d: 'Engineering rules, a historical baseline and cross-sensor checks combine, rather than one fixed threshold.' },
  { icon: Path, t: 'Explain', d: 'Each finding carries a probability, a confidence and the readings that led to it.' },
  { icon: Bell, t: 'Alert', d: 'Critical, warning and attention alerts are raised once, tracked, and cleared when the condition ends.' },
  { icon: ChartLineUp, t: 'Predict', d: 'Trends in turbidity, pressure stability and flow point to problems before they become alarms.' },
];

export default function Home() {
  const { state, theme, toggleTheme } = useApp();
  const preds = useApi<{ predictions: (Prediction & { pipeline_id: string })[] }>('/api/predictions', state?.clock);
  const [scrolled, setScrolled] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => setScrolled(!e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const pipes = state?.pipelines.filter((p) => p.analysis) ?? [];
  const avg = (f: (p: (typeof pipes)[number]) => number) => (pipes.length ? Math.round(pipes.reduce((a, p) => a + f(p), 0) / pipes.length) : 0);
  const alerts = Object.values(state?.alertCounts ?? {}).reduce((a, b) => a + b, 0);
  const quality = avg((p) => p.analysis!.quality.score);
  const reliability = avg((p) => p.analysis!.reliability.overall);
  const worst = [...pipes].sort((a, b) => a.analysis!.health.score - b.analysis!.health.score)[0];
  const worstStress = [...pipes].sort((a, b) => b.analysis!.stress.score - a.analysis!.stress.score)[0];
  const finding = worst?.analysis?.anomalies[0];
  const pred = preds.data?.predictions[0];

  return (
    <>
      <header className={`hnav ${scrolled ? 'scrolled' : ''}`}>
        <div className="wrap">
          <Link href="/" className="hbrand" aria-label="AquaGuard AI home"><span className="mark"><Drop size={18} weight="bold" /></span>AquaGuard AI</Link>
          <nav aria-label="Sections"><a href="#features">Features</a><a href="#how">How it works</a><a href="#principles">Principles</a></nav>
          <span className="grow" />
          <button className="hicon" onClick={toggleTheme} aria-label="Toggle dark mode">{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
          <Link href="/dashboard" className="hbtn primary sm">Open dashboard</Link>
        </div>
      </header>

      <section className="hero" aria-label="Introduction">
        <PipelineScene />
        <div className="wrap" style={{ width: '100%' }}>
          <div className="hero-copy">
            <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}>
              Catch the <em>leak</em> before the street floods.
            </motion.h1>
            <motion.p className="sub" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}>
              AquaGuard AI watches pH, turbidity, pressure and flow across your network, and explains every alert it raises.
            </motion.p>
            <motion.div className="ctas" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.24, ease: [0.16, 1, 0.3, 1] }}>
              <Link href="/dashboard" className="hbtn primary">Open dashboard <ArrowRight className="arrow" size={18} weight="bold" /></Link>
              <Link href="/simulation" className="hbtn"><Play size={16} weight="fill" />Run a leak simulation</Link>
            </motion.div>
          </div>
        </div>
      </section>
      <div ref={sentinel} style={{ position: 'absolute', top: 80, height: 1, width: 1 }} aria-hidden="true" />

      <section className="strip" aria-label="Live network summary">
        <div className="wrap">
          <div className="stats">
            <div className="stat"><div className="num">{pipes.length || '-'}</div><div className="lbl">Pipelines monitored</div></div>
            <div className="stat"><div className="num">{state ? alerts : '-'}</div><div className="lbl">Active alerts</div></div>
            <div className="stat"><div className="num">{pipes.length ? `${quality}/100` : '-'}</div><div className="lbl">Average water quality score</div></div>
            <div className="stat"><div className="num">{pipes.length ? `${reliability}%` : '-'}</div><div className="lbl">Average sensor reliability</div></div>
          </div>
          <p className="snote">Live values from the demo network running in this app.</p>
        </div>
      </section>

      <section className="sec" aria-labelledby="shot-h">
        <div className="wrap">
          <Reveal><h2 id="shot-h">One screen for the whole network.</h2><p className="lead">Health, water quality, leak probability and sensor status for every pipeline, updating as readings arrive.</p></Reveal>
          <Reveal delay={0.1}><div className="shotbox"><Shot /></div></Reveal>
        </div>
      </section>

      <section className="sec" id="features" aria-labelledby="feat-h">
        <div className="wrap">
          <Reveal><h2 id="feat-h">Everything a control room needs, explained.</h2></Reveal>
          <div className="bento">
            <Reveal className="c7"><div className="cell warm" style={{ height: '100%' }}>
              <h3>Leak detection</h3>
              <p className="t">Compares expected flow with actual flow, and inlet with outlet pressure. A leak is only raised when both drop together.</p>
              <div className="crop"><Shot pos="top" /></div>
            </div></Reveal>
            <Reveal className="c5" delay={0.06}><div className="cell" style={{ height: '100%' }}>
              <h3>Water quality score</h3>
              <p className="t">Scored against the standard you choose: BIS, WHO, or your own ranges.</p>
              <div style={{ marginTop: 'auto' }}><ScoreRing value={quality} /></div>
            </div></Reveal>
            <Reveal className="c4"><div className="cell tint" style={{ height: '100%' }}>
              <h3>Stress estimation</h3>
              <p className="t">Repeated pressure swings and vibration raise a risk level. It is an AI estimate, not a structural inspection.</p>
              <div style={{ marginTop: 'auto' }}>
                {worstStress?.analysis && <><div className="bigtone" style={{ color: `var(--${stressTone(worstStress.analysis.stress.risk)})` }}>{worstStress.analysis.stress.risk}</div><div className="small muted" style={{ marginTop: 8 }}>Highest right now: {worstStress.cfg.id}</div></>}
              </div>
            </div></Reveal>
            <Reveal className="c8" delay={0.06}><div className="cell deep" style={{ height: '100%' }}>
              <h3>Sensors are checked before they are trusted</h3>
              <p className="t">Bad data produces false alarms, so it is filtered out first.</p>
              <div className="checks">{CHECKS.map((c) => <div className="check" key={c.t}><c.icon size={22} /><div><b>{c.t}</b><span>{c.d}</span></div></div>)}</div>
            </div></Reveal>
            <Reveal className="c5"><div className="cell" style={{ height: '100%' }}>
              <h3>Early warnings</h3>
              {pred ? <p className="t"><b style={{ color: 'var(--text)' }}>{pred.title}.</b> {pred.text}</p> : <p className="t">Trend analysis watches turbidity, pressure stability and flow. No adverse trends right now.</p>}
              {pred && <div className="row small muted" style={{ marginTop: 'auto' }}><Pill tone="att">Likelihood {pred.probability}%</Pill><span>Confidence {pred.confidence}%</span></div>}
            </div></Reveal>
            <Reveal className="c7" delay={0.06}><div className="cell tint" style={{ height: '100%' }}>
              <h3>Every alert shows its reasoning</h3>
              {finding ? <Finding a={finding} /> : <p className="t">When something is detected you see the probability, the confidence and the readings behind it. Nothing is flagged right now.</p>}
            </div></Reveal>
          </div>
        </div>
      </section>

      <section className="sec" id="how" aria-labelledby="how-h">
        <div className="wrap how">
          <div className="sticky"><Reveal><h2 id="how-h">From raw reading to a clear action.</h2><p className="lead">The same six stages run on every reading, whether it comes from a real sensor or the simulator.</p></Reveal></div>
          <div className="steps">
            {STEPS.map((s, i) => (
              <Reveal key={s.t} delay={i * 0.03}><div className="step"><div className="ic"><s.icon size={26} /></div><div><h3>{s.t}</h3><p>{s.d}</p></div></div></Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="sec" id="principles" aria-labelledby="pr-h">
        <div className="wrap">
          <Reveal><h2 id="pr-h">Honest about what it knows.</h2></Reveal>
          <div className="princ">
            <Reveal className="row-p"><div><h3>Every prediction shows its confidence.</h3><p>Findings are worded as detected, likely or possible, with a probability and a confidence. Nothing is presented as certain.</p></div></Reveal>
            <Reveal className="row-p"><div><h3>No system is perfect, and this one says so.</h3><p>Accuracy figures come from tests you can re-run. Real-world results depend on sensor quality, calibration and communications.</p></div></Reveal>
            <Reveal className="row-p"><div><h3>You set the thresholds, not us.</h3><p>Reference ranges, limits and sensitivity are configurable per network, because one drinking-water standard does not fit every system.</p></div></Reveal>
          </div>
          <Reveal>
            <div className="ctaband">
              <h2>See it catch a leak in real time.</h2>
              <div className="ctas">
                <Link href="/dashboard" className="hbtn primary">Open dashboard <ArrowRight className="arrow" size={18} weight="bold" /></Link>
                <Link href="/simulation" className="hbtn"><Play size={16} weight="fill" />Run a leak simulation</Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="hfoot">
        <div className="wrap">
          <div><Link href="/" className="hbrand"><span className="mark"><Drop size={18} weight="bold" /></span>AquaGuard AI</Link><p className="fine">A prototype for water pipeline quality and infrastructure monitoring. AI outputs are estimates and should be verified in the field.</p></div>
          <div><h4>Product</h4><Link href="/dashboard">Dashboard</Link><Link href="/map">Pipeline map</Link><Link href="/leak">Leak and stress</Link><Link href="/alerts">Alerts</Link></div>
          <div><h4>Platform</h4><Link href="/history">Historical analysis</Link><Link href="/insights">Predictive insights</Link><Link href="/performance">AI performance</Link><Link href="/admin">Admin settings</Link></div>
        </div>
      </footer>
      
    </>
  );
}

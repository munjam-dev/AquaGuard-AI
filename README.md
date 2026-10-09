# AquaGuard AI — Intelligent Water Pipeline Quality & Infrastructure Monitoring

Next.js + TypeScript + SQLite prototype. Pega Blueprint BP-2548170 was used **only** for workflow design
(see [AquaGuard-Blueprint-and-Workflow.md](AquaGuard-Blueprint-and-Workflow.md)); the application itself runs outside Pega.

## Run

```bash
npm install
npm run dev        # http://localhost:3000 = home page, /dashboard = app (first request seeds 30 days of demo data, ~5 s)
npm test           # 20 engine + evaluation tests
npm run build && npm start
```

Set `GROQ_API_KEY` in `.env.local` (see `.env.example`) to enable the AI Assistant. The key is only used server-side.

Requires Node 22.5+ (uses the built-in `node:sqlite`; no native build step). Data lives in `data/aquaguard.db`;
delete it to re-seed.

## What you get

| Page | Purpose |
|---|---|
| Home (`/`) | Landing page with a Three.js pipeline-network hero, live network stats and real dashboard screenshots |
| Dashboard (`/dashboard`) | pH / turbidity cards, water-quality score breakdown, pipeline health (e.g. *97% — GOOD*), leak & stress probability, AI explanations, active alerts, 9 charts (1h–30d + custom range) |
| Pipeline Map | Clickable network, sections coloured Healthy / Warning / Risk / Critical |
| Leak & Stress | Expected vs actual flow, inlet vs outlet pressure, leak probability + confidence + "why", stress risk (labelled *AI-based risk estimation*) |
| Alerts | Critical / Warning / Attention, filters, acknowledge / resolve / mark false-positive |
| Historical Analysis | Daily/weekly/monthly trends, anomaly history, maintenance events, AI-written summary |
| Predictive Insights | Rising turbidity, pH drift, pressure instability, future leakage, sensor degradation |
| AI Performance | Accuracy, precision, recall, F1, FPR, FNR, latency, and Actual-vs-Predicted table for 14 scenarios |
| AI Assistant | Groq-powered chat limited to water and pipeline topics. Uses live data for the selected pipeline, plus a built-in research library (pH, turbidity, chlorine, TDS, leaks, pressure, sensors, NRW, Indian standards) |
| Simulation & Input | START LIVE SIMULATION, scenario buttons, manual data entry, API example |
| Admin Settings | Reference standard (BIS / WHO / industrial) and every range, limits, sensor thresholds, sensitivity, pipeline config, calibration offsets |

## Architecture

```
src/engine/    pure TypeScript AI/analysis layer (no framework deps)
  validate · waterQuality · hydraulics (leak, blockage, pressure, flow, stress)
  predict · analyze (orchestrator) · simulator · evaluation
src/server/    SQLite repository (db), live runtime + alert lifecycle (runtime), read queries
src/app/api/   REST: sensor-data, state, pipeline/[id], series, history, alerts, settings, simulate, evaluation, predictions
src/app/*      UI pages;  src/components  shared UI
tests/         engine tests incl. the evaluation matrix and a false-alarm sweep
```

Pipeline: Sensors → `POST /api/sensor-data` → validation → preprocessing (invalid values removed) → quality / leak / stress /
anomaly analysis → confidence → risk → alert → dashboard → history → predictions.

### Sending real sensor data

```bash
curl -X POST http://localhost:3000/api/sensor-data -H "content-type: application/json" \
  -d '{"timestamp":"2026-10-08T12:00:00","pipeline_id":"PIPE-001","pH":7.2,"turbidity":2.4,"temperature":27.5,"tds":320,"pressure_in":4.8,"pressure_out":4.5,"flow_rate":125.4,"vibration":0.18}'
```

One object or an array (max 500). Any sensor may be omitted or `null`. **Add authentication before exposing this endpoint.**

## Honest limits

- AI outputs are probabilistic estimates; every one carries a probability and a confidence (capped below 100%).
- The AI Performance numbers come from simulated test conditions (a regression test). They are **not** a field-accuracy
  guarantee. Real accuracy depends on sensors, calibration, communications and site conditions.
- Leak detection needs both flow loss and pressure loss; rising inlet pressure is classed as blockage; invalid sensors are
  excluded before detection. Normal water produced 0 alarms over ~1,850 simulated analyses.
- Stress output is an AI-based risk estimation, not a structural inspection.
- Not yet implemented: user login / role enforcement (roles are modelled in the DB only), real GIS map tiles, model retraining
  from verified field labels (the false-positive button records feedback but does not retrain).

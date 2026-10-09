# AquaGuard AI — Blueprint & End-to-End Workflow

**Intelligent Water Pipeline Quality & Infrastructure Monitoring**
Source: Pega Blueprint BP-2548170 (workflow design only) · Build stack: Next.js + TypeScript + SQLite

> Pega is used **only** to design the workflow and process model. The application itself is built outside Pega.
> The AI layer is a transparent hybrid of engineering rules, statistics and cross-sensor checks. It reports probability *and* confidence. It never claims 0% error, and the stress module is labeled **AI-based risk estimation**, not a structural inspection.

---

## 1. Blueprint Summary

| Item | Value |
|---|---|
| Application | AquaGuard AI |
| Industry | Energy & Utilities → Utilities |
| Location / Language | India / English |
| Scope | Water pipelines, distribution systems, industrial pipelines, municipal water, smart-city |
| Pega Blueprint size | 11 personas/channels · 18 workflows · 31 data objects |
| Goal | Real-time monitoring, historical analysis, AI anomaly detection, alerts, explainable dashboard |

### 1.1 Personas (from Blueprint) → App roles

| Persona | Responsibility | App role |
|---|---|---|
| Utility Engineer | Investigates anomalies, leaks, stress | engineer |
| Operations Supervisor | Oversees alerts, assigns work | engineer |
| System Administrator | Thresholds, pipelines, sensors, calibration | admin |
| City Water Manager | Executive view, health and compliance KPIs | viewer |
| Dashboard Analyst | Trends, charts, historical analysis | viewer |
| AI Analyst | Model performance, evaluation, sensitivity | engineer |
| Maintenance Technician | Maintenance events, sensor repair | engineer |
| Quality Assurance Inspector | Water-quality verification | viewer |
| Sensor Integration Engineer | API ingestion, calibration, sensor health | admin |
| Regulatory Compliance Officer | Reference-standard configuration, audit | admin |
| Application Control (system) | Scheduler, simulator, automated processing | system |

### 1.2 Pega workflows → Application modules

| # | Pega workflow | Engine module | UI area | API |
|---|---|---|---|---|
| 1 | Sensor Data Collection | `engine/ingest` | Manual entry, device status | `POST /api/sensor-data` |
| 2 | Sensor Validation | `engine/validate` | Sensor Reliability panel | (internal) |
| 3 | AI Analysis & Anomaly Detection | `engine/anomaly`, `engine/confidence` | AI Insights, anomaly cards | `GET /api/anomalies` |
| 4 | Leakage Detection & Assessment | `engine/leak` | Leak Detection page | `GET /api/leak/:pipe` |
| 5 | Pipeline Stress Assessment | `engine/stress` | Stress panel | `GET /api/stress/:pipe` |
| 6 | Water Quality Analysis / Score | `engine/waterQuality` | Water-quality cards, score breakdown | `GET /api/quality/:pipe` |
| 7 | Pipeline Health Monitoring | `engine/health` | Dashboard health card | `GET /api/health/:pipe` |
| 8 | Alert Management | `engine/alerts` | Alert center (ack/resolve) | `GET/PATCH /api/alerts` |
| 9 | Anomaly Investigation | Anomaly detail + explanation | History → anomaly detail | `GET /api/anomalies/:id` |
| 10 | Simulation Scenario | `engine/simulator` | Demo controls | `POST /api/simulate` |
| 11 | Predictive analytics | `engine/predict` | Predictions panel | `GET /api/predictions` |
| 12 | Model evaluation | `engine/evaluation` | AI Accuracy / Evaluation page | `GET /api/evaluation` |
| 13 | Admin configuration | Settings service | Admin Settings | `GET/PUT /api/settings` |

### 1.3 Data objects (Blueprint noise removed)

The Blueprint lists 31 data objects, many of which are generic template items (Consumer/Business/Service Account, Statement, Product, Appointment, Transaction, Asset). These do not apply to this domain. The application models only the entities required by the project spec:

`User · Pipeline · Location · Sensor · SensorReading · Alert · Anomaly · AIPrediction · MaintenanceEvent · Setting (reference ranges, thresholds) · EvaluationRun`

---

## 2. End-to-End Workflow

```
Sensors → Data Collection → Data Validation → Preprocessing → AI Analysis
   → Anomaly Detection → Risk Assessment → Confidence Score → Alert
   → Dashboard → Historical Analysis → Predictive Monitoring
```

### Stage-by-stage

| Stage | What happens | Output |
|---|---|---|
| 1. Sensors | IoT devices, simulator or manual form produce readings (pH, turbidity, temp, TDS, conductivity, DO, ORP, chlorine, pressure in/out, flow, vibration, acoustic). | Raw JSON |
| 2. Data Collection | `POST /api/sensor-data` accepts and schema-checks the payload, stamps receipt time, persists the raw reading. | Stored reading |
| 3. Data Validation | Detects missing data, impossible values, sudden unrealistic jumps, frozen/stuck readings, drift, disconnected sensors, conflicting sensors, communication gaps. | Per-sensor flags + **Sensor Reliability Score** |
| 4. Preprocessing | Drops or down-weights invalid values, smooths with a rolling window, computes baselines (hour-of-day / rolling mean and SD), derives pressure differential and flow differential. | Clean feature vector |
| 5. AI Analysis | Runs the detectors: water-quality, leak, stress, blockage, flow. Combines engineering rules, time-series trends, z-score anomaly detection, cross-sensor checks and baseline comparison. | Signal scores |
| 6. Anomaly Detection | Fuses signals into anomaly records. A signal must persist across N readings (configurable) before it counts, to cut false positives. | Anomaly records |
| 7. Risk Assessment | Computes Leak Probability (No Leak / Low / Possible / High / Critical), Structural Stress Risk (Low / Medium / High / Critical), Water Quality Score (0–100), Pipeline Health (0–100). | Risk levels |
| 8. Confidence Score | Confidence reflects sensor reliability, number of agreeing signals, data completeness and baseline depth. Every prediction carries probability **and** confidence, with hedged wording (Detected, Likely, Possible, Suspected). | Probability + confidence |
| 9. Alert | Maps risk to 🔴 Critical / 🟠 Warning / 🟡 Attention / 🟢 Normal, de-duplicates, applies sensitivity settings, stores alerts with an explanation. | Alert records |
| 10. Dashboard | Live cards, charts, pipeline map, alert feed, AI explanation. | Real-time UI |
| 11. Historical Analysis | Daily/weekly/monthly trends, anomaly history, leakage events, quality deterioration, sensor failures, stress events, AI-written summaries. | Reports |
| 12. Predictive Monitoring | Trend extrapolation: rising turbidity, pressure instability, future leakage risk, sensor degradation. | Predictions |

### Sensor-data input format

```json
{
  "timestamp": "2026-10-08T12:00:00",
  "pipeline_id": "PIPE-001",
  "pH": 7.2, "turbidity": 2.4, "temperature": 27.5, "tds": 320,
  "pressure_in": 4.8, "pressure_out": 4.5,
  "flow_rate": 125.4, "vibration": 0.18
}
```

Optional: `conductivity`, `dissolved_oxygen`, `orp`, `chlorine`, `pipeline_temperature`, `acoustic`.

---

## 3. Detection Logic

### 3.1 Sensor validation
| Check | Rule (configurable) |
|---|---|
| Frozen reading | Identical value for N readings / M minutes (e.g. pH exactly 7.00 for 45 min) |
| Impossible value | Outside physical range (pH not in 0–14, negative flow, etc.) |
| Unrealistic jump | Change greater than K × rolling SD or max rate per interval |
| Missing / disconnected | No reading within expected interval |
| Drift | Slow monotonic deviation from a redundant sensor or baseline |
| Conflict | Cross-sensor inconsistency, e.g. TDS vs conductivity, pressure_in vs flow |

### 3.2 Leak engine
Compares **expected vs actual flow** and **inlet vs outlet pressure**, then adds pressure fluctuation, vibration/acoustic pattern and historical behavior.
Output: Leak Probability %, class, Confidence %, and a plain-language explanation.

> **Possible Leakage Detected — 91% probability (confidence 94%)**
> • 18% reduction in expected flow · • 1.3 bar pressure difference · • abnormal pressure fluctuation · • increased vibration
> These combined signals indicate a possible pipeline leak.

### 3.3 Stress engine (AI-based risk estimation)
Inputs: pressure level and fluctuation, flow, temperature, vibration, sudden pressure changes, long-term trend. Output: Low / Medium / High / Critical with explanation. It is not a structural engineering inspection.

### 3.4 Water Quality Score (0–100)
Weighted sub-scores for pH, turbidity, temperature, TDS, conductivity and other sensors. Reference ranges come from an **admin-selectable standard**, not a single hard-coded one. Each sub-score is shown in the breakdown.

### 3.5 Anomaly detection (not fixed thresholds only)
Engineering threshold rules + time-series analysis + statistical z-score + sensor cross-validation + historical baseline + anomaly scoring. Covers high/low pH, rapid pH change, high or sudden turbidity, contamination pattern (pH + turbidity + temperature), pressure drop, flow reduction/increase, pressure/flow mismatch, blockage, abnormal vibration, pipe damage.

### 3.6 False-positive control
Persistence windows, multi-sensor agreement, sensor-reliability weighting, rule-based verification of statistical hits, alert de-duplication and cool-down, and adjustable sensitivity.

---

## 4. Alert Lifecycle

```
Detected → Scored (prob + confidence) → Deduplicated → Raised (🔴🟠🟡🟢)
   → Acknowledged (engineer) → Investigated (anomaly detail) → Resolved / False-positive
   → Feedback stored → feeds model-performance metrics
```

Alert categories: pH · Turbidity · Pressure · Flow · Leakage · Pipeline stress · Sensor failure · Water-quality anomaly.

---

## 5. Architecture

```
src/
  engine/            pure TypeScript, no framework dependency
    ingest · validate · preprocess · waterQuality · leak · stress
    anomaly · confidence · alerts · health · predict · simulator · evaluation
  server/            SQLite + repository layer
  app/
    api/             sensor-data, alerts, anomalies, quality, leak, stress,
                     health, predictions, simulate, settings, evaluation, history
    (pages)          Dashboard · Map · Leak · Alerts · History · AI Insights
                     · AI Performance · Simulation · Admin
  components/        cards, charts, status indicators, map, panels
tests/               engine unit tests + 13-scenario evaluation suite
docs/                workflow, API reference
```

- **Modular:** each detector implements a common interface, so new sensors and models plug in without touching the rest.
- **Hardware-ready:** real IoT devices only need to call `POST /api/sensor-data`.
- **Database tables:** users, pipelines, locations, sensors, readings, alerts, anomalies, predictions, maintenance_events, settings, evaluation_runs.

---

## 6. UI Blueprint

Look: professional industrial control-center. Neutral slate palette, status colors reserved for state only, dense data cards, no glow, no heavy gradients, no oversized AI graphics. Dark/light mode, responsive for mobile and desktop.

| Screen | Content |
|---|---|
| **Dashboard** | pH card (current, status, min/max/avg, trend, graph) · Turbidity card · Pipeline health (e.g. *92% — GOOD*) · pressure, flow, differential, vibration · leak and stress probability · water-quality score · live alert feed |
| **Charts** | pH, turbidity, pressure, flow, temperature, vibration, quality score, health score, leak probability. Ranges: 1h, 6h, 24h, 7d, 30d, custom |
| **Pipeline Map** | Interactive SVG network. Sections colored 🟢 Healthy / 🟡 Warning / 🟠 Risk / 🔴 Critical. Click shows ID, location, pH, turbidity, pressure, flow, health, leak and stress probability, sensor status, last update |
| **Leak Detection** | Expected vs actual flow, pressure comparison, probability, class, explanation |
| **Alerts** | Filter by type/severity, acknowledge, resolve, mark false positive |
| **History** | Daily/weekly/monthly trends, anomaly, leak, quality, sensor and stress events, AI summary text |
| **AI Insights / Predictions** | Predictive findings, e.g. "PIPE-007 shows increasing pressure instability…" |
| **AI Accuracy** | Accuracy, precision, recall, F1, FPR, FNR, detection latency, sensor reliability |
| **Evaluation** | Actual condition vs AI prediction, PASS/FAIL per scenario |
| **Simulation** | **START LIVE SIMULATION** + Normal · Leakage · High Turbidity · Abnormal pH · Pipeline Stress · Sensor Failure · Random Anomaly |
| **Admin** | pH/turbidity/pressure/flow/temperature ranges, sensor thresholds, alert and AI sensitivity, pipeline config, calibration, reference standard |

On launch, the app seeds realistic demo history so the dashboard looks live immediately.

---

## 7. Five-Phase Delivery Plan

| Phase | Scope | Exit criteria |
|---|---|---|
| **1. Foundation & data pipeline** | Next.js scaffold, SQLite schema, seed data (~8 pipelines, 24h history), `POST /api/sensor-data`, validation engine and reliability score, manual entry form, `docs/workflow.md` | A reading posted to the API is validated, stored and visible in the DB; validation unit tests pass |
| **2. AI analysis engine** | Water-quality score with configurable standard, anomaly detection, leak engine, stress engine, confidence scoring, explanations, alert generation | Engine tests pass for each detector; every output has probability, confidence and explanation |
| **3. Dashboard, charts & alerts** | Control-center UI, dark/light mode, status cards, 9 time-series charts with range selector, alert center | Dashboard renders live data; alerts raise and can be acknowledged |
| **4. Simulation, map & history** | Simulator with all scenarios, START LIVE SIMULATION, pipeline map, historical analysis with AI summaries, predictive analytics | Selecting a scenario changes the dashboard in real time; map click shows section details |
| **5. Admin, evaluation & hardening** | Admin settings and calibration, AI Performance page, 13-scenario test suite, Model Evaluation dashboard, README, API docs | All 13 scenarios shown with PASS/FAIL; metrics computed from real test runs |

---

## 8. Test Scenarios (Model Evaluation)

| # | Scenario | Expected detection |
|---|---|---|
| 1 | Normal water | Normal |
| 2 | High pH | High pH |
| 3 | Low pH | Low pH |
| 4 | High turbidity | High turbidity |
| 5 | Sudden turbidity increase | Sudden turbidity rise |
| 6 | Pipeline leakage | Leakage |
| 7 | Pipeline blockage | Blockage |
| 8 | Pressure drop | Pressure drop |
| 9 | Abnormal flow | Abnormal flow |
| 10 | Pipeline stress | Stress |
| 11 | Sensor failure | Sensor failure |
| 12 | Missing sensor data | Missing data |
| 13 | Multiple simultaneous anomalies | All present anomalies |

Evaluation compares **Actual Condition vs AI Prediction → PASS / FAIL**. Metrics (accuracy, precision, recall, F1, FPR, FNR, latency) are computed from these runs, never hard-coded. The design supports retraining or recalibrating when verified historical data becomes available.

---

## 9. Success Criteria & Honest Limits

- Target: very high detection accuracy with minimal false positives and false negatives.
- No claim of guaranteed 0% error. Sensor faults, communication loss, environment, calibration error and incomplete data make perfect detection impossible.
- Mitigations: sensor validation, calibration checks, multi-sensor verification, redundancy where available, baseline comparison, rule-based verification, confidence scoring, false-positive reduction and false-negative monitoring.
- Priority order: (1) accurate sensor processing, (2) reliable anomaly detection, (3) leakage detection, (4) stress monitoring, (5) water-quality monitoring, (6) sensor-failure detection, (7) real-time visualization, (8) explainable AI, (9) high-confidence alerts, (10) scalable architecture.

---

## 10. Status

Design approved. No application code has been scaffolded yet (the scaffold command was declined). Next step is Phase 1, once you give the go-ahead on how to proceed.

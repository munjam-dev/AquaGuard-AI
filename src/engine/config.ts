import type { PipelineCfg, Settings, Standard } from './types';

export const STANDARDS: Record<string, Standard> = {
  bis: {
    name: 'BIS IS 10500 (India drinking water)',
    params: {
      pH: { min: 6.5, max: 8.5, margin: 1.0, weight: 25, unit: '' },
      turbidity: { max: 5, margin: 5, weight: 25, unit: 'NTU' },
      temperature: { min: 10, max: 35, margin: 8, weight: 10, unit: '°C' },
      tds: { max: 500, margin: 1000, weight: 15, unit: 'mg/L' },
      conductivity: { max: 1000, margin: 1000, weight: 10, unit: 'µS/cm' },
      chlorine: { min: 0.2, max: 1.0, margin: 0.5, weight: 8, unit: 'mg/L' },
      dissolved_oxygen: { min: 5, margin: 3, weight: 7, unit: 'mg/L' },
    },
  },
  who: {
    name: 'WHO guideline values',
    params: {
      pH: { min: 6.5, max: 8.5, margin: 1.0, weight: 25, unit: '' },
      turbidity: { max: 4, margin: 4, weight: 25, unit: 'NTU' },
      temperature: { min: 10, max: 30, margin: 8, weight: 10, unit: '°C' },
      tds: { max: 600, margin: 600, weight: 15, unit: 'mg/L' },
      conductivity: { max: 1000, margin: 1000, weight: 10, unit: 'µS/cm' },
      chlorine: { min: 0.2, max: 5, margin: 1, weight: 8, unit: 'mg/L' },
      dissolved_oxygen: { min: 5, margin: 3, weight: 7, unit: 'mg/L' },
    },
  },
  industrial: {
    name: 'Industrial process water',
    params: {
      pH: { min: 6.0, max: 9.0, margin: 1.5, weight: 25, unit: '' },
      turbidity: { max: 10, margin: 10, weight: 25, unit: 'NTU' },
      temperature: { min: 5, max: 45, margin: 10, weight: 10, unit: '°C' },
      tds: { max: 1500, margin: 1000, weight: 15, unit: 'mg/L' },
      conductivity: { max: 3000, margin: 2000, weight: 10, unit: 'µS/cm' },
    },
  },
};

export const DEFAULT_SETTINGS: Settings = {
  standard: 'bis',
  standards: STANDARDS,
  limits: {
    pressure: { min: 2.5, max: 7 },
    flow: { min: 60, max: 200 },
    temperature: { min: 10, max: 35 },
    vibration: { warn: 0.4, crit: 0.8 },
  },
  sensors: {
    frozenCount: 12,
    missingCount: 3,
    maxJump: { pH: 2, turbidity: 60, temperature: 8, tds: 400, pressure_in: 3, pressure_out: 3, flow_rate: 200, vibration: 3 },
  },
  sensitivity: { alert: 'medium', ai: 1 },
  calibration: {},
};

const mk = (
  id: string, name: string, location: string, lat: number, lng: number, d: number, material: string,
  pin: number, flow: number, map: PipelineCfg['map'], tweak: Partial<PipelineCfg['nominal']> = {},
): PipelineCfg => ({
  id, name, location, lat, lng, diameter_mm: d, material,
  nominal: { pressure_in: pin, pressure_out: +(pin - 0.3).toFixed(2), flow, vibration: 0.18, pH: 7.2, turbidity: 2.2, temperature: 27.5, tds: 320, ...tweak },
  map,
});

export const PIPELINES: PipelineCfg[] = [
  mk('PIPE-001', 'Plant Outlet Main', 'Parvati WTP, Pune', 18.4967, 73.8446, 900, 'DI', 4.8, 125, { x1: 60, y1: 200, x2: 220, y2: 200 }),
  mk('PIPE-002', 'North Trunk Line', 'Aundh Zone, Pune', 18.559, 73.8077, 600, 'DI', 4.6, 98, { x1: 220, y1: 200, x2: 360, y2: 110 }, { turbidity: 2.6 }),
  mk('PIPE-003', 'East Distribution', 'Viman Nagar, Pune', 18.5679, 73.9143, 450, 'HDPE', 4.2, 72, { x1: 220, y1: 200, x2: 380, y2: 200 }, { pH: 7.4 }),
  mk('PIPE-004', 'South Feeder', 'Katraj, Pune', 18.4575, 73.8677, 500, 'CI', 4.4, 84, { x1: 220, y1: 200, x2: 360, y2: 300 }, { tds: 380 }),
  mk('PIPE-005', 'Industrial Supply', 'Hadapsar MIDC, Pune', 18.5089, 73.926, 400, 'MS', 5.2, 66, { x1: 380, y1: 200, x2: 540, y2: 250 }, { tds: 420, temperature: 29 }),
  mk('PIPE-006', 'West Ring Main', 'Kothrud, Pune', 18.5074, 73.8077, 350, 'HDPE', 4.0, 58, { x1: 360, y1: 110, x2: 520, y2: 90 }),
  mk('PIPE-007', 'Hill Zone Booster', 'Sinhagad Rd, Pune', 18.4814, 73.8142, 300, 'DI', 4.9, 48, { x1: 360, y1: 300, x2: 520, y2: 340 }),
  mk('PIPE-008', 'Smart-City Loop', 'Baner-Balewadi, Pune', 18.5642, 73.7769, 400, 'HDPE', 4.3, 62, { x1: 520, y1: 90, x2: 640, y2: 150 }),
];

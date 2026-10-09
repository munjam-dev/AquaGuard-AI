export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const round = (x: number, d = 2) => { const f = 10 ** d; return Math.round(x * f) / f; };
export const nums = (a: (number | null | undefined)[]): number[] => a.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
export const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
export function median(a: number[]): number {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y); const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function sd(a: number[]): number {
  if (a.length < 2) return 0;
  const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}
/** Least-squares fit y ~ a + b*i. Returns slope per index, r2 and residual SD (detrended spread). */
export function linfit(y: number[]) {
  const n = y.length;
  if (n < 3) return { slope: 0, r2: 0, resSd: 0 };
  const xm = (n - 1) / 2, ym = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (i - xm) * (y[i] - ym); sxx += (i - xm) ** 2; syy += (y[i] - ym) ** 2; }
  const slope = sxy / sxx;
  const ssRes = y.reduce((s, v, i) => s + (v - (ym + slope * (i - xm))) ** 2, 0);
  return { slope, r2: syy > 0 ? 1 - ssRes / syy : 0, resSd: Math.sqrt(ssRes / (n - 1)) };
}
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

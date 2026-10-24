// Estadística descriptiva básica. No se calculan baremos ni equivalencias poblacionales.

export function mean(xs: number[]): number {
  if (xs.length === 0) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function sd(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

export function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Pendiente por mínimos cuadrados de y respecto a x. */
export function slope(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return NaN;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Inversa aproximada de la normal estándar (Acklam). */
export function probit(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= 1 - pl) {
    const q = p - 0.5;
    const r = q * q;
    return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

/** d' de detección de señales con corrección log-lineal (Hautus, 1995). */
export function dPrime(hits: number, misses: number, fas: number, crs: number): number {
  const hr = (hits + 0.5) / (hits + misses + 1);
  const far = (fas + 0.5) / (fas + crs + 1);
  return probit(hr) - probit(far);
}

/** Puntuación de Brier: media de (confianza - acierto)^2. 0 = calibración perfecta. */
export function brier(pairs: { confidence: number; correct: number }[]): number {
  if (pairs.length === 0) return NaN;
  return mean(pairs.map((p) => (p.confidence - p.correct) ** 2));
}

export interface CalibrationBin {
  from: number;
  to: number;
  n: number;
  meanConfidence: number;
  accuracy: number;
}

export function calibrationBins(pairs: { confidence: number; correct: number }[], edges = [0, 0.4, 0.6, 0.8, 0.95, 1.0001]): CalibrationBin[] {
  const bins: CalibrationBin[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const inBin = pairs.filter((p) => p.confidence >= edges[i] && p.confidence < edges[i + 1]);
    bins.push({
      from: edges[i],
      to: Math.min(1, edges[i + 1]),
      n: inBin.length,
      meanConfidence: mean(inBin.map((p) => p.confidence)),
      accuracy: mean(inBin.map((p) => p.correct)),
    });
  }
  return bins;
}

export interface PeriodComparison {
  status: 'ok' | 'insuficiente';
  nA: number;
  nB: number;
  meanA: number;
  meanB: number;
  diff: number;
  /** Diferencia estandarizada con DE combinada. Descriptiva, no inferencial. */
  standardizedDiff: number;
}

/** Compara dos periodos. Devuelve 'insuficiente' si alguno tiene menos de minN observaciones. */
export function comparePeriods(a: number[], b: number[], minN = 3): PeriodComparison {
  const meanA = mean(a);
  const meanB = mean(b);
  const pooled = Math.sqrt(((a.length - 1) * (sd(a) || 0) ** 2 + (b.length - 1) * (sd(b) || 0) ** 2) / Math.max(1, a.length + b.length - 2));
  const status = a.length >= minN && b.length >= minN ? 'ok' : 'insuficiente';
  return {
    status,
    nA: a.length,
    nB: b.length,
    meanA,
    meanB,
    diff: meanB - meanA,
    standardizedDiff: pooled > 0 ? (meanB - meanA) / pooled : NaN,
  };
}

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export function fmt(x: number, digits = 1): string {
  if (!Number.isFinite(x)) return '—';
  return x.toLocaleString('es-ES', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function pct(x: number, digits = 0): string {
  if (!Number.isFinite(x)) return '—';
  return `${(x * 100).toLocaleString('es-ES', { maximumFractionDigits: digits })} %`;
}

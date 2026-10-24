import { useId, useMemo, useState } from 'react';
import { Empty } from './ui';

// Gráficos SVG ligeros (sin dependencias). Paleta categórica validada para daltonismo y
// contraste sobre la superficie oscura (#0e1530): cian, violeta, ámbar en orden fijo.
export const SERIES_COLORS = ['#0891b2', '#8b5cf6', '#d97706'];

export interface ChartSeries {
  name: string;
  points: { t: number; y: number; label?: string }[];
  dashed?: boolean;
}

const fmtDate = (t: number) => new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
const fmtNum = (y: number, pct?: boolean) => (pct ? `${Math.round(y * 100)} %` : y.toLocaleString('es-ES', { maximumFractionDigits: 1 }));

export function LineChart({
  series,
  height = 200,
  yDomain,
  percent,
  yLabel,
  emptyText = 'Evidencia insuficiente: todavía no hay datos.',
  minPoints = 1,
}: {
  series: ChartSeries[];
  height?: number;
  yDomain?: [number, number];
  percent?: boolean;
  yLabel?: string;
  emptyText?: string;
  minPoints?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const id = useId();
  const all = series.flatMap((s) => s.points);
  const W = 640;
  const H = height;
  const pad = { l: 44, r: 12, t: 12, b: 26 };
  const xs = useMemo(() => [...new Set(all.map((p) => p.t))].sort((a, b) => a - b), [all]);
  if (all.length < minPoints) return <Empty title={emptyText} />;
  const tMin = Math.min(...all.map((p) => p.t));
  const tMax = Math.max(...all.map((p) => p.t));
  let [yMin, yMax] = yDomain ?? [Math.min(...all.map((p) => p.y)), Math.max(...all.map((p) => p.y))];
  if (yMin === yMax) { yMin -= 1; yMax += 1; }
  const x = (t: number) => (tMax === tMin ? (pad.l + W - pad.r) / 2 : pad.l + ((t - tMin) / (tMax - tMin)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => yMin + f * (yMax - yMin));
  const xTicks = xs.length <= 6 ? xs : [0, 0.25, 0.5, 0.75, 1].map((f) => tMin + f * (tMax - tMin));
  const hoverT = hover !== null ? xs[hover] : null;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        {series.length >= 2 ? (
          <ul className="flex flex-wrap gap-3 text-xs text-muted" aria-label="Leyenda">
            {series.map((s, i) => (
              <li key={s.name} className="flex items-center gap-1.5">
                <svg width="18" height="8" aria-hidden><line x1="1" y1="4" x2="17" y2="4" stroke={SERIES_COLORS[i]} strokeWidth="2" strokeDasharray={s.dashed ? '4 3' : undefined} /></svg>
                {s.name}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-xs text-faint">{yLabel}</span>
        )}
        <button className="text-xs text-faint underline-offset-2 hover:text-ink hover:underline" onClick={() => setTable((v) => !v)}>
          {table ? 'Ver gráfico' : 'Ver tabla'}
        </button>
      </div>
      {table ? (
        <div className="max-h-64 overflow-auto rounded-lg border border-night-600">
          <table className="w-full text-xs tabular">
            <thead className="bg-night-800 text-muted">
              <tr><th className="p-2 text-left">Fecha</th>{series.map((s) => <th key={s.name} className="p-2 text-right">{s.name}</th>)}</tr>
            </thead>
            <tbody>
              {xs.map((t) => (
                <tr key={t} className="border-t border-night-700">
                  <td className="p-2">{new Date(t).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  {series.map((s) => {
                    const p = s.points.find((q) => q.t === t);
                    return <td key={s.name} className="p-2 text-right">{p ? fmtNum(p.y, percent) : ''}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-labelledby={`${id}-d`} onMouseLeave={() => setHover(null)}>
            <desc id={`${id}-d`}>{`Gráfico temporal de ${series.map((s) => s.name).join(', ')} con ${all.length} puntos.`}</desc>
            {ticks.map((v, i) => (
              <g key={i}>
                <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="#1f2b5c" strokeWidth="1" />
                <text x={pad.l - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="#6b7799">{fmtNum(v, percent)}</text>
              </g>
            ))}
            {xTicks.map((t, i) => (
              <text key={i} x={x(t)} y={H - 8} textAnchor="middle" fontSize="10" fill="#6b7799">{fmtDate(t)}</text>
            ))}
            {series.map((s, si) => {
              const pts = s.points.slice().sort((a, b) => a.t - b.t);
              const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
              return (
                <g key={s.name}>
                  {pts.length > 1 && <path d={d} fill="none" stroke={SERIES_COLORS[si % 3]} strokeWidth="2" strokeLinejoin="round" strokeDasharray={s.dashed ? '5 4' : undefined} />}
                  {pts.map((p, i) => (
                    <circle key={i} cx={x(p.t)} cy={y(p.y)} r={hoverT === p.t ? 5 : 3.5} fill={SERIES_COLORS[si % 3]} stroke="#0e1530" strokeWidth="2" />
                  ))}
                </g>
              );
            })}
            {hoverT !== null && <line x1={x(hoverT)} x2={x(hoverT)} y1={pad.t} y2={H - pad.b} stroke="#9aa6c4" strokeWidth="1" strokeDasharray="2 3" />}
            {/* zonas de captura más anchas que las marcas */}
            {xs.map((t, i) => {
              const prev = i ? x(xs[i - 1]) : pad.l;
              const next = i < xs.length - 1 ? x(xs[i + 1]) : W - pad.r;
              const x0 = i ? (prev + x(t)) / 2 : pad.l;
              const x1 = i < xs.length - 1 ? (x(t) + next) / 2 : W - pad.r;
              return <rect key={t} x={x0} y={pad.t} width={Math.max(1, x1 - x0)} height={H - pad.t - pad.b} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />;
            })}
          </svg>
          {hoverT !== null && (
            <div className="pointer-events-none absolute top-1 rounded-lg border border-night-500 bg-night-950/95 px-2.5 py-1.5 text-xs shadow-lg" style={{ left: `${Math.min(70, (x(hoverT) / W) * 100)}%` }}>
              <div className="mb-0.5 text-faint">{new Date(hoverT).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}</div>
              {series.map((s, si) => {
                const p = s.points.find((q) => q.t === hoverT);
                return p ? (
                  <div key={s.name} className="flex items-center gap-1.5 text-ink">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: SERIES_COLORS[si % 3] }} />
                    {s.name}: <span className="tabular">{fmtNum(p.y, percent)}</span>
                    {p.label && <span className="text-faint"> · {p.label}</span>}
                  </div>
                ) : null;
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function BarChart({ data, height = 140, unit = '' }: { data: { label: string; value: number }[]; height?: number; unit?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = height;
  const pad = { l: 8, r: 8, t: 18, b: 22 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const bw = (W - pad.l - pad.r) / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={data.map((d) => `${d.label}: ${d.value} ${unit}`).join('; ')}>
      <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="#1f2b5c" />
      {data.map((d, i) => {
        const h = (d.value / max) * (H - pad.t - pad.b);
        const x0 = pad.l + i * bw + 2;
        const w = bw - 4;
        const y0 = H - pad.b - h;
        return (
          <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" />
            {h > 0 && <path d={`M${x0},${H - pad.b} V${y0 + 4} Q${x0},${y0} ${x0 + 4},${y0} H${x0 + w - 4} Q${x0 + w},${y0} ${x0 + w},${y0 + 4} V${H - pad.b} Z`} fill={hover === i ? '#06b6d4' : '#0891b2'} />}
            <text x={x0 + w / 2} y={H - 7} textAnchor="middle" fontSize="10" fill="#6b7799">{d.label}</text>
            {(hover === i || i === data.length - 1) && (
              <text x={x0 + w / 2} y={Math.max(11, y0 - 5)} textAnchor="middle" fontSize="11" fill="#e6ebf5">{d.value} {unit}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function CalibrationChart({ bins }: { bins: { from: number; to: number; n: number; meanConfidence: number; accuracy: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 320, H = 260, pad = 36;
  const s = (v: number) => pad + v * (W - 2 * pad);
  const sy = (v: number) => H - pad - v * (H - 2 * pad);
  const pts = bins.filter((b) => b.n > 0);
  return (
    <div className="relative mx-auto max-w-sm">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Calibración: confianza media frente a precisión observada por tramos">
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={pad} x2={W - pad} y1={sy(v)} y2={sy(v)} stroke="#1f2b5c" />
            <text x={pad - 6} y={sy(v) + 3} fontSize="10" textAnchor="end" fill="#6b7799">{v * 100}%</text>
            <text x={s(v)} y={H - pad + 14} fontSize="10" textAnchor="middle" fill="#6b7799">{v * 100}%</text>
          </g>
        ))}
        <line x1={s(0)} y1={sy(0)} x2={s(1)} y2={sy(1)} stroke="#6b7799" strokeDasharray="4 4" />
        <text x={s(0.62)} y={sy(0.7)} fontSize="10" fill="#6b7799" transform={`rotate(-38 ${s(0.62)} ${sy(0.7)})`}>calibración perfecta</text>
        <text x={W / 2} y={H - 4} fontSize="10" textAnchor="middle" fill="#9aa6c4">Confianza declarada</text>
        <text x={10} y={H / 2} fontSize="10" textAnchor="middle" fill="#9aa6c4" transform={`rotate(-90 10 ${H / 2})`}>Precisión real</text>
        {pts.map((b, i) => (
          <circle key={i} cx={s(b.meanConfidence)} cy={sy(b.accuracy)} r={Math.min(12, 5 + Math.sqrt(b.n))} fill="#8b5cf6" fillOpacity="0.85" stroke="#0e1530" strokeWidth="2" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
        ))}
      </svg>
      {hover !== null && pts[hover] && (
        <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-lg border border-night-500 bg-night-950/95 px-2.5 py-1.5 text-xs">
          Confianza {Math.round(pts[hover].meanConfidence * 100)} % → acierto {Math.round(pts[hover].accuracy * 100)} % (n = {pts[hover].n})
        </div>
      )}
    </div>
  );
}

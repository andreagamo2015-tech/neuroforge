import type { CellSpec, ColorName, FigureSpec, ShapeName } from '../../core/types';
import { describeCell } from '../../core/tasks/matrices';

// Las figuras se dibujan con colores de alto contraste y, además, cada color lleva un relleno
// distinto (sólido, rayado, contorno) para no depender solo del color.
export const FIG_COLORS: Record<ColorName, string> = { cian: '#22d3ee', violeta: '#a78bfa', ámbar: '#fbbf24', rosa: '#fb7185' };
const SIZE: Record<string, number> = { pequeño: 0.55, mediano: 0.78, grande: 1 };

function ShapePath({ shape, cx, cy, r, color, fillMode, pid }: { shape: ShapeName; cx: number; cy: number; r: number; color: string; fillMode: 'solid' | 'hatch' | 'outline' | 'dots'; pid: string }) {
  const fill = fillMode === 'solid' ? color : fillMode === 'hatch' ? `url(#h-${pid})` : fillMode === 'dots' ? `url(#d-${pid})` : 'none';
  const common = { fill, stroke: color, strokeWidth: 2 };
  switch (shape) {
    case 'círculo': return <circle cx={cx} cy={cy} r={r} {...common} />;
    case 'cuadrado': return <rect x={cx - r * 0.88} y={cy - r * 0.88} width={r * 1.76} height={r * 1.76} rx={2} {...common} />;
    case 'triángulo': return <polygon points={`${cx},${cy - r} ${cx + r * 0.95},${cy + r * 0.75} ${cx - r * 0.95},${cy + r * 0.75}`} {...common} />;
    case 'rombo': return <polygon points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`} {...common} />;
    case 'hexágono': {
      const pts = Array.from({ length: 6 }, (_, i) => `${cx + r * Math.cos((Math.PI / 3) * i)},${cy + r * Math.sin((Math.PI / 3) * i)}`).join(' ');
      return <polygon points={pts} {...common} />;
    }
    case 'estrella': {
      const pts = Array.from({ length: 10 }, (_, i) => {
        const rr = i % 2 === 0 ? r : r * 0.45;
        const a = -Math.PI / 2 + (Math.PI / 5) * i;
        return `${cx + rr * Math.cos(a)},${cy + rr * Math.sin(a)}`;
      }).join(' ');
      return <polygon points={pts} {...common} />;
    }
  }
}

const FILL_BY_COLOR: Record<ColorName, 'solid' | 'hatch' | 'outline' | 'dots'> = { cian: 'solid', violeta: 'hatch', ámbar: 'outline', rosa: 'dots' };
const POSITIONS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.3, 0.5], [0.7, 0.5]],
  3: [[0.5, 0.28], [0.28, 0.72], [0.72, 0.72]],
  4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
};

let counter = 0;
export function CellSvg({ cell, size = 96, title }: { cell: CellSpec | null; size?: number; title?: string }) {
  const pid = `p${counter++ % 100000}`;
  if (!cell) {
    return (
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label="Celda vacía (la que hay que completar)">
        <rect x="3" y="3" width="94" height="94" rx="10" fill="#0a1024" stroke="#22d3ee" strokeDasharray="6 5" strokeWidth="2" />
        <text x="50" y="62" textAnchor="middle" fontSize="34" fill="#22d3ee">?</text>
      </svg>
    );
  }
  const color = FIG_COLORS[cell.color];
  const n = Math.min(4, cell.count);
  const r = (n === 1 ? 30 : 17) * SIZE[cell.size];
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={title ?? describeCell(cell)}>
      <defs>
        <pattern id={`h-${pid}`} patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="5" stroke={color} strokeWidth="2" />
        </pattern>
        <pattern id={`d-${pid}`} patternUnits="userSpaceOnUse" width="5" height="5">
          <circle cx="2.5" cy="2.5" r="1.2" fill={color} />
        </pattern>
      </defs>
      <rect x="3" y="3" width="94" height="94" rx="10" fill="#0a1024" stroke="#1f2b5c" strokeWidth="2" />
      {POSITIONS[n].map(([px, py], i) => (
        <ShapePath key={i} shape={cell.shape} cx={px * 100} cy={py * 100} r={r} color={color} fillMode={FILL_BY_COLOR[cell.color]} pid={pid} />
      ))}
    </svg>
  );
}

export function Figure({ figure }: { figure: FigureSpec }) {
  if (figure.type === 'symbols') {
    return <div className="whitespace-pre-wrap text-center font-mono text-2xl tracking-wider text-cyan-soft sm:text-3xl">{figure.text}</div>;
  }
  if (figure.type === 'cell') return <CellSvg cell={figure.cell} />;
  return (
    <div className="mx-auto grid w-fit grid-cols-3 gap-2" role="group" aria-label="Matriz de 3 por 3">
      {figure.cells.map((c, i) => (
        <CellSvg key={i} cell={c} size={88} title={c ? `Fila ${Math.floor(i / 3) + 1}, columna ${(i % 3) + 1}: ${describeCell(c)}` : undefined} />
      ))}
    </div>
  );
}

import type { Rng } from '../rng';
import type { Item, ItemTask, Variant } from '../types';
import { baseValidate, lvl } from './common';

// Series numéricas generadas por familias de reglas verificables.
// Las familias "novel" nunca se usan en entrenamiento: sirven para medir generalización.

interface SeriesFamily {
  id: string;
  label: string;
  difficulty: number;
  pool: Variant;
  make(rng: Rng): { terms: number[]; rule: string };
}

const N = 7;
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

export const SERIES_FAMILIES: SeriesFamily[] = [
  {
    id: 'aritmetica', label: 'Suma constante', difficulty: 1, pool: 'train',
    make(r) { const a = r.int(1, 20), d = r.int(2, 9); return { terms: range(N).map((i) => a + i * d), rule: `Se suma ${d} en cada paso.` }; },
  },
  {
    id: 'resta', label: 'Resta constante', difficulty: 2, pool: 'train',
    make(r) { const a = r.int(60, 99), d = r.int(3, 9); return { terms: range(N).map((i) => a - i * d), rule: `Se resta ${d} en cada paso.` }; },
  },
  {
    id: 'geometrica', label: 'Producto constante', difficulty: 2, pool: 'train',
    make(r) { const a = r.int(1, 4), q = r.pick([2, 3]); return { terms: range(N).map((i) => a * q ** i), rule: `Cada término se multiplica por ${q}.` }; },
  },
  {
    id: 'segundo-orden', label: 'Diferencias crecientes', difficulty: 3, pool: 'train',
    make(r) {
      const a = r.int(1, 10), d0 = r.int(1, 5), k = r.int(1, 3);
      const t = [a];
      for (let i = 1; i < N; i++) t.push(t[i - 1] + d0 + (i - 1) * k);
      return { terms: t, rule: `Las diferencias aumentan de ${k} en ${k} (empiezan en ${d0}).` };
    },
  },
  {
    id: 'intercaladas', label: 'Dos series intercaladas', difficulty: 4, pool: 'train',
    make(r) {
      const a = r.int(1, 10), d1 = r.int(2, 5), b = r.int(20, 40), d2 = -r.int(1, 4);
      return {
        terms: range(N).map((i) => (i % 2 === 0 ? a + (i / 2) * d1 : b + ((i - 1) / 2) * d2)),
        rule: `Posiciones impares: empieza en ${a} y suma ${d1}. Posiciones pares: empieza en ${b} y resta ${-d2}.`,
      };
    },
  },
  {
    id: 'fibonacci', label: 'Suma de los dos anteriores', difficulty: 4, pool: 'train',
    make(r) {
      const t = [r.int(1, 5), r.int(1, 6)];
      for (let i = 2; i < N; i++) t.push(t[i - 1] + t[i - 2]);
      return { terms: t, rule: 'Cada término es la suma de los dos anteriores.' };
    },
  },
  {
    id: 'ciclo-operaciones', label: 'Ciclo ×2, +c', difficulty: 5, pool: 'train',
    make(r) {
      const c = r.int(1, 5);
      const t = [r.int(1, 6)];
      for (let i = 1; i < N; i++) t.push(i % 2 === 1 ? t[i - 1] * 2 : t[i - 1] + c);
      return { terms: t, rule: `Se alternan dos operaciones: ×2 y después +${c}.` };
    },
  },
  {
    id: 'cuadrados', label: 'Cuadrados desplazados', difficulty: 6, pool: 'train',
    make(r) {
      const s = r.int(1, 4), c = r.int(-3, 5);
      return { terms: range(N).map((i) => (i + s) ** 2 + c), rule: `Cada término es un cuadrado perfecto (${s}², ${s + 1}², …) ${c >= 0 ? '+' : '−'} ${Math.abs(c)}.` };
    },
  },
  {
    id: 'diferencias-geometricas', label: 'Diferencias que se duplican', difficulty: 6, pool: 'train',
    make(r) {
      const a = r.int(1, 10), d = r.int(1, 3);
      const t = [a];
      for (let i = 1; i < N; i++) t.push(t[i - 1] + d * 2 ** (i - 1));
      return { terms: t, rule: `Las diferencias se duplican: ${d}, ${2 * d}, ${4 * d}, …` };
    },
  },
  {
    id: 'mixta-intercalada', label: 'Intercalada geométrica/aritmética', difficulty: 7, pool: 'train',
    make(r) {
      const a = r.int(1, 3), b = r.int(10, 20), d = r.int(2, 6);
      return {
        terms: range(N).map((i) => (i % 2 === 0 ? a * 2 ** (i / 2) : b + ((i - 1) / 2) * d)),
        rule: `Posiciones impares: se multiplica por 2 desde ${a}. Posiciones pares: se suma ${d} desde ${b}.`,
      };
    },
  },
  {
    id: 'tercer-orden', label: 'Diferencias de segundo orden crecientes', difficulty: 8, pool: 'train',
    make(r) {
      const a = r.int(1, 10), d0 = r.int(1, 3), k = r.int(1, 2);
      const t = [a];
      let diff = d0, step = k;
      for (let i = 1; i < N; i++) { t.push(t[i - 1] + diff); diff += step; step += k; }
      return { terms: t, rule: `Las diferencias son ${d0}, ${d0 + k}, ${d0 + 3 * k}, … y sus incrementos crecen de ${k} en ${k}.` };
    },
  },
  {
    id: 'doble-menos', label: 'Doble menos constante', difficulty: 9, pool: 'train',
    make(r) {
      const c = r.int(1, 4);
      const t = [r.int(c + 2, c + 6)];
      for (let i = 1; i < N; i++) t.push(2 * t[i - 1] - c);
      return { terms: t, rule: `Cada término es el doble del anterior menos ${c}.` };
    },
  },
  // ---- Familias reservadas para variantes nuevas (generalización) ----
  {
    id: 'cruce-negativos', label: 'Resta que cruza el cero', difficulty: 2, pool: 'novel',
    make(r) { const a = r.int(8, 18), d = r.int(4, 7); return { terms: range(N).map((i) => a - i * d), rule: `Se resta ${d} en cada paso (la serie pasa a negativos).` }; },
  },
  {
    id: 'signo-alterno', label: 'Diferencias alternas', difficulty: 3, pool: 'novel',
    make(r) {
      const p = r.int(4, 9), m = r.int(1, p - 2);
      const t = [r.int(1, 15)];
      for (let i = 1; i < N; i++) t.push(t[i - 1] + (i % 2 === 1 ? p : -m));
      return { terms: t, rule: `Se alterna +${p} y −${m}.` };
    },
  },
  {
    id: 'producto-consecutivos', label: 'n·(n+k)', difficulty: 5, pool: 'novel',
    make(r) {
      const s = r.int(1, 4), k = r.int(1, 3);
      return { terms: range(N).map((i) => (i + s) * (i + s + k)), rule: `Cada término es n·(n+${k}) con n = ${s}, ${s + 1}, …` };
    },
  },
  {
    id: 'ciclo-triple-menos', label: 'Ciclo ×3, −c', difficulty: 6, pool: 'novel',
    make(r) {
      const c = r.int(1, 4);
      const t = [r.int(2, 5)];
      for (let i = 1; i < N; i++) t.push(i % 2 === 1 ? t[i - 1] * 3 : t[i - 1] - c);
      return { terms: t, rule: `Se alternan ×3 y −${c}.` };
    },
  },
  {
    id: 'tribonacci', label: 'Suma de los tres anteriores', difficulty: 7, pool: 'novel',
    make(r) {
      const t = [r.int(0, 2), r.int(1, 3), r.int(1, 4)];
      for (let i = 3; i < N; i++) t.push(t[i - 1] + t[i - 2] + t[i - 3]);
      return { terms: t, rule: 'Cada término es la suma de los tres anteriores.' };
    },
  },
  {
    id: 'cubos', label: 'Cubos desplazados', difficulty: 8, pool: 'novel',
    make(r) {
      const s = r.int(1, 3), c = r.int(0, 4);
      return { terms: range(N).map((i) => (i + s) ** 3 - c), rule: `Cubos (${s}³, ${s + 1}³, …) menos ${c}.` };
    },
  },
  {
    id: 'anterior-mas-doble', label: 'Anterior + 2·antepenúltimo', difficulty: 9, pool: 'novel',
    make(r) {
      const t = [r.int(1, 3), r.int(1, 4)];
      for (let i = 2; i < N; i++) t.push(t[i - 1] + 2 * t[i - 2]);
      return { terms: t, rule: 'Cada término es el anterior más el doble del que está dos posiciones antes.' };
    },
  },
];

/** Predicción por el polinomio de menor grado que ajusta los puntos visibles (si existe con grado ≤ 2). */
export function lowDegreePrediction(points: [number, number][], x: number): { degree: number; value: number } | null {
  for (let deg = 0; deg <= 2; deg++) {
    if (points.length < deg + 2) break; // hace falta al menos un punto para comprobar
    const base = points.slice(0, deg + 1);
    const interp = (xx: number) =>
      base.reduce((acc, [xi, yi], i) => {
        let term = yi;
        base.forEach(([xj], j) => { if (j !== i) term *= (xx - xj) / (xi - xj); });
        return acc + term;
      }, 0);
    if (points.every(([xi, yi]) => Math.abs(interp(xi) - yi) < 1e-6)) return { degree: deg, value: interp(x) };
  }
  return null;
}

function geometricPrediction(points: [number, number][], x: number): number | null {
  if (points.length < 3 || points.some(([, y]) => y === 0)) return null;
  // solo si las posiciones visibles son consecutivas alrededor de la incógnita
  const ratios: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0];
    ratios.push(Math.pow(points[i][1] / points[i - 1][1], 1 / dx));
  }
  if (ratios.some((q) => !Number.isFinite(q) || Math.abs(q - ratios[0]) > 1e-9)) return null;
  const [x0, y0] = points[0];
  return y0 * ratios[0] ** (x - x0);
}

function makeSeriesItem(rng: Rng, level: number, variant: Variant, focus?: string): Item {
  const L = lvl(level);
  const pool = SERIES_FAMILIES.filter((f) => f.pool === variant);
  let candidates = focus ? pool.filter((f) => f.id === focus) : [];
  if (!candidates.length) candidates = pool.filter((f) => f.difficulty <= L && f.difficulty >= L - 2);
  if (!candidates.length) candidates = [pool.reduce((best, f) => (Math.abs(f.difficulty - L) < Math.abs(best.difficulty - L) ? f : best))];
  const fam = rng.pick(candidates);
  const { terms, rule } = fam.make(rng);
  const hidden = variant === 'novel' ? rng.int(2, N - 2) : N - 1;
  const shown = terms.map((t, i) => (i === hidden ? '?' : t.toLocaleString('es-ES')));
  const answer = terms[hidden];
  const diffs = terms.slice(1).map((t, i) => t - terms[i]);
  const explanation = [
    `Regla: ${rule}`,
    `Serie completa: ${terms.join(', ')}.`,
    `Diferencias entre términos consecutivos: ${diffs.join(', ')}.`,
    hidden === N - 1 ? `Aplicando la regla al término anterior se obtiene ${answer}.` : `El término que falta (posición ${hidden + 1}) es ${answer}: debe encajar con los términos de ambos lados.`,
  ];
  return {
    signature: `series:${variant}:${terms.join(',')}:${hidden}`,
    taskId: 'A-series',
    level,
    variant,
    seed: rng.seed,
    prompt: hidden === N - 1 ? '¿Qué número continúa la serie?' : '¿Qué número falta en la serie?',
    figure: { type: 'symbols', text: shown.join('   ') },
    response: { type: 'numeric', answer },
    explanation,
    focusKey: fam.id,
    demand: 'razonamiento',
    meta: { family: fam.id, terms, hidden, difficulty: fam.difficulty },
  };
}

export const seriesTask: ItemTask = {
  kind: 'item',
  id: 'A-series',
  module: 'A',
  name: 'Series numéricas',
  short: 'Series',
  objective: 'Inducir la regla que genera una secuencia y aplicarla a un caso nuevo.',
  instructions: [
    'Observa la serie de números y descubre la regla que la genera.',
    'Escribe el número que falta (marcado con «?»).',
    'Las reglas pueden combinar sumas, productos, diferencias que cambian o dos series intercaladas.',
  ],
  strategies: [
    { id: 'diferencias', label: 'Calculé las diferencias' },
    { id: 'cocientes', label: 'Busqué cocientes' },
    { id: 'posiciones', label: 'Separé posiciones pares e impares' },
    { id: 'recurrencia', label: 'Relacioné con términos anteriores' },
    { id: 'intuicion', label: 'Intuición / tanteo' },
  ],
  errorAdvice: {
    'regla-incompleta': { meaning: 'Continuaste la última diferencia sin comprobar si las diferencias cambian.', better: 'Calcula también las diferencias de las diferencias o prueba si hay dos series intercaladas.' },
    'error-calculo': { meaning: 'La regla probablemente era correcta, pero el cálculo final falló por poco.', better: 'Verifica la regla aplicándola a dos términos conocidos antes de calcular el que falta.' },
    'regla-no-identificada': { meaning: 'La respuesta no coincide con la regla ni con continuaciones simples.', better: 'Sigue un orden fijo: diferencias → cocientes → posiciones alternas → relación con los dos anteriores.' },
  },
  transferHint: 'Buscar invariantes (qué se mantiene constante) sirve para detectar tendencias en datos, presupuestos o calendarios.',
  minLevel: 1,
  maxLevel: 10,
  hasNovel: true,
  novelDescription: 'Familias de reglas nunca vistas en entrenamiento y con el hueco en mitad de la serie.',
  blockSeconds: 150,
  itemsPerBlock: 6,
  expectedSeconds: (level) => 15 + level * 4,
  generate: makeSeriesItem,
  validate(item) {
    const errs = baseValidate(item);
    const m = item.meta as { terms: number[]; hidden: number };
    if (item.response.type !== 'numeric') return [...errs, 'tipo de respuesta incorrecto'];
    const answer = item.response.answer;
    if (!Number.isInteger(answer)) errs.push('respuesta no entera');
    if (m.terms.some((t) => Math.abs(t) > 100000)) errs.push('términos demasiado grandes');
    if (m.terms[m.hidden] !== answer) errs.push('la respuesta no coincide con la serie');
    const visible = m.terms.map((t, i) => [i, t] as [number, number]).filter(([i]) => i !== m.hidden);
    // Ambigüedad: si una regla más simple encaja con todos los términos visibles, debe predecir lo mismo.
    const poly = lowDegreePrediction(visible, m.hidden);
    if (poly && Math.abs(poly.value - answer) > 1e-6) errs.push(`ambigua: un polinomio de grado ${poly.degree} predice ${poly.value}`);
    const geo = geometricPrediction(visible, m.hidden);
    if (geo !== null && Math.abs(geo - answer) > 1e-6) errs.push(`ambigua: una regla geométrica predice ${geo}`);
    return errs;
  },
  diagnose(item, raw) {
    const m = item.meta as { terms: number[]; hidden: number };
    const answer = Number(raw);
    const correct = m.terms[m.hidden];
    if (m.hidden > 0 && m.hidden >= 2) {
      const prev = m.terms[m.hidden - 1];
      const prevDiff = m.terms[m.hidden - 1] - m.terms[m.hidden - 2];
      if (answer === prev + prevDiff && answer !== correct) return 'regla-incompleta';
    }
    if (Math.abs(answer - correct) <= Math.max(2, Math.abs(correct) * 0.05)) return 'error-calculo';
    return 'regla-no-identificada';
  },
};

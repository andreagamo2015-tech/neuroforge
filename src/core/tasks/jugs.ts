import type { Rng } from '../rng';
import type { ChoiceOption, Item, ItemTask, Variant } from '../types';
import { baseValidate, lvl } from './common';

// Problemas de jarras (paradigma Einstellung de Luchins). Tras varios problemas que solo se
// resuelven con una fórmula larga, aparecen problemas críticos donde existe una solución más
// corta. Mide si se detecta que la estrategia aprendida ya no es la mejor.

export const FORMULAS = [
  { id: 'larga', label: 'B − A − 2C', ops: 3, f: (A: number, B: number, C: number) => B - A - 2 * C },
  { id: 'suma', label: 'A + C', ops: 1, f: (A: number, _B: number, C: number) => A + C },
  { id: 'resta', label: 'A − C', ops: 1, f: (A: number, _B: number, C: number) => A - C },
  { id: 'doble', label: 'B − 2A', ops: 2, f: (A: number, B: number) => B - 2 * A },
];

type Kind = 'set' | 'critical' | 'extinction';

export function solutionsFor(A: number, B: number, C: number, G: number) {
  return FORMULAS.filter((fm) => fm.f(A, B, C) === G);
}

function makeJug(rng: Rng, level: number, variant: Variant, kind: Kind): Item {
  const L = lvl(level);
  const scale = L <= 3 ? 1 : L <= 6 ? 2 : 3;
  for (let attempt = 0; attempt < 500; attempt++) {
    const C = rng.int(2, 3 + scale * 2);
    const A = rng.int(C * 2 + 1, 12 + scale * 10);
    let B: number, G: number;
    if (kind === 'set') {
      G = rng.int(5, 20 + scale * 15);
      B = G + A + 2 * C;
    } else if (kind === 'critical') {
      if (rng.chance(0.5)) { B = 2 * A + 3 * C; G = A + C; } else { B = 2 * A + C; G = A - C; }
    } else {
      G = rng.chance(0.5) ? A + C : A - C;
      B = rng.int(A + 2 * C + 1, A * 3 + 10);
    }
    if (G <= 0 || B <= A || A <= C) continue;
    const sols = solutionsFor(A, B, C, G);
    const ok = kind === 'set' ? sols.length === 1 && sols[0].id === 'larga'
      : kind === 'critical' ? sols.length === 2 && sols.some((s) => s.id === 'larga') && sols.some((s) => s.ops === 1)
      : sols.length === 1 && sols[0].ops === 1;
    if (!ok) continue;
    const best = sols.reduce((a, b) => (b.ops < a.ops ? b : a));
    const order = rng.shuffle(FORMULAS);
    const options: ChoiceOption[] = order.map((fm) => ({
      label: fm.label,
      errorTag: fm.id === best.id ? undefined : sols.includes(fm) ? 'einstellung' : 'formula-no-valida',
    }));
    return {
      signature: `jug:${A}:${B}:${C}:${G}`,
      taskId: 'D-jugs',
      level,
      variant,
      seed: rng.seed,
      prompt: `¿Cuál es la forma más corta de obtener exactamente ${G} litros?`,
      lines: [`Tienes tres jarras vacías: A = ${A} L, B = ${B} L y C = ${C} L, y agua ilimitada.`, '«B − A − 2C» significa: llenar B, vaciar en A una vez y en C dos veces.'],
      response: { type: 'choice', options, correctIndex: order.indexOf(best) },
      explanation: [
        ...FORMULAS.map((fm) => `${fm.label} = ${fm.f(A, B, C)}${fm.f(A, B, C) === G ? ' ✓' : ''}`),
        kind === 'critical' ? `Aquí funciona la fórmula larga, pero ${best.label} es más corta. Comprobar siempre si hay un camino más simple.` : kind === 'extinction' ? `La fórmula habitual ya no funciona; solo ${best.label} da ${G}.` : `Solo ${best.label} da ${G} litros.`,
      ],
      focusKey: kind,
      demand: 'razonamiento',
      meta: { A, B, C, G, kind },
    };
  }
  throw new Error('No se pudo generar un problema de jarras');
}

export const jugsTask: ItemTask = {
  kind: 'item',
  id: 'D-jugs',
  module: 'D',
  name: 'Jarras: reestructurar estrategia',
  short: 'Jarras',
  objective: 'Detectar cuándo una estrategia aprendida deja de ser la mejor y cambiar de enfoque.',
  instructions: [
    'Cada problema pide obtener una cantidad exacta de agua con tres jarras.',
    'Elige la fórmula MÁS CORTA que funcione (menos operaciones).',
    'No te fíes de lo que funcionó antes: compruébalo cada vez.',
  ],
  strategies: [
    { id: 'comprobar-todas', label: 'Comprobé todas las fórmulas' },
    { id: 'repetir', label: 'Repetí la que me funcionaba' },
    { id: 'simple-primero', label: 'Probé primero las simples' },
  ],
  errorAdvice: {
    einstellung: { meaning: 'Usaste la fórmula habitual aunque había una más corta (efecto Einstellung).', better: 'Antes de aplicar el procedimiento conocido, comprueba si una solución más simple funciona.' },
    'formula-no-valida': { meaning: 'La fórmula elegida no da la cantidad pedida.', better: 'Calcula cada fórmula con los números de este problema.' },
  },
  transferHint: 'Revisar los procedimientos habituales cuando cambian las condiciones evita soluciones ineficientes en el trabajo y el estudio.',
  minLevel: 1,
  maxLevel: 10,
  hasNovel: false,
  blockSeconds: 200,
  itemsPerBlock: 7,
  expectedSeconds: () => 25,
  generate: (rng, level, variant, focus) => makeJug(rng, level, variant, (focus as Kind) ?? rng.pick(['set', 'critical', 'extinction'] as Kind[])),
  generateBlock(rng, level, variant, n) {
    const nSet = Math.max(2, n - 3);
    const kinds: Kind[] = [...Array(nSet).fill('set'), 'critical', 'extinction', 'critical'];
    return kinds.slice(0, Math.max(n, 5)).map((k) => makeJug(rng, level, variant, k));
  },
  validate(item) {
    const errs = baseValidate(item);
    const m = item.meta as { A: number; B: number; C: number; G: number; kind: Kind };
    const sols = solutionsFor(m.A, m.B, m.C, m.G);
    if (!sols.length) errs.push('ninguna fórmula funciona');
    const minOps = Math.min(...sols.map((s) => s.ops));
    if (sols.filter((s) => s.ops === minOps).length !== 1) errs.push('más de una solución mínima');
    if (item.response.type === 'choice' && item.response.options[item.response.correctIndex].label !== sols.find((s) => s.ops === minOps)?.label) errs.push('la opción correcta no es la más corta');
    return errs;
  },
};

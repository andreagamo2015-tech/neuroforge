import type { Rng } from '../rng';
import type { ChoiceOption, Item, ItemTask, Variant } from '../types';
import { NAMES, baseValidate, lvl, ordinal, permutations } from './common';

// Razonamiento deductivo sobre órdenes (transitividad) y detección de contradicciones.
// Un solucionador por fuerza bruta (≤ 6! órdenes) verifica cada ítem.

export interface Premise { a: number; b: number } // a está por delante (más alto / antes) que b

interface Domain { above: string; below: string; firstQ: (k: number) => string; posName: (k: number) => string }
const HEIGHT: Domain = {
  above: 'es más alto que',
  below: 'es más bajo que',
  firstQ: (k) => (k === 0 ? '¿Quién es el más alto?' : `¿Quién es el ${ordinal(k)} más alto?`),
  posName: (k) => (k === 0 ? 'el más alto' : `el ${ordinal(k)} más alto`),
};
const ARRIVAL: Domain = {
  above: 'llegó antes que',
  below: 'llegó después que',
  firstQ: (k) => `¿Quién llegó en ${ordinal(k)} lugar?`,
  posName: (k) => `en ${ordinal(k)} lugar`,
};

export function consistentOrders(n: number, premises: Premise[]): number[][] {
  return permutations([...Array(n).keys()]).filter((perm) => {
    const pos: number[] = [];
    perm.forEach((p, i) => (pos[p] = i));
    return premises.every((pr) => pos[pr.a] < pos[pr.b]);
  });
}

function determinedAt(n: number, premises: Premise[], k: number): number | null {
  const orders = consistentOrders(n, premises);
  if (!orders.length) return null;
  const who = orders[0][k];
  return orders.every((o) => o[k] === who) ? who : null;
}

function render(p: Premise, names: string[], dom: Domain, converse: boolean): string {
  return converse ? `${names[p.b]} ${dom.below} ${names[p.a]}.` : `${names[p.a]} ${dom.above} ${names[p.b]}.`;
}

function makeOrderingItem(rng: Rng, level: number, variant: Variant): Item {
  const L = lvl(level);
  const n = L <= 2 ? 3 : L <= 4 ? 4 : L <= 7 ? 5 : 6;
  const dom = variant === 'novel' ? ARRIVAL : HEIGHT;
  const names = rng.sample(NAMES, n);
  const order = rng.shuffle([...Array(n).keys()]); // order[0] = primero
  const k = rng.int(0, n - 1);
  let premises: Premise[];
  if (L <= 5) {
    premises = order.slice(0, -1).map((a, i) => ({ a, b: order[i + 1] }));
  } else {
    const all: Premise[] = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) all.push({ a: order[i], b: order[j] });
    premises = [];
    for (const p of rng.shuffle(all)) {
      premises.push(p);
      if (determinedAt(n, premises, k) !== null) break;
    }
    // poda de premisas redundantes
    for (const p of premises.slice()) {
      const rest = premises.filter((q) => q !== p);
      if (determinedAt(n, rest, k) === order[k]) premises = rest;
    }
    if (L >= 8) {
      const extra = all.find((p) => !premises.includes(p));
      if (extra) premises.push(extra);
    }
  }
  premises = rng.shuffle(premises);
  const lines = premises.map((p) => render(p, names, dom, L >= 3 && rng.chance(0.4)));
  const answer = order[k];
  const optionIdx = n <= 5 ? rng.shuffle([...Array(n).keys()]) : rng.shuffle([answer, ...rng.sample([...Array(n).keys()].filter((i) => i !== answer), 4)]);
  const mirrored = order[n - 1 - k];
  const options: ChoiceOption[] = optionIdx.map((i) => ({
    label: names[i],
    errorTag: i === answer ? undefined : i === mirrored ? 'inversion-relacion' : 'integracion-incompleta',
  }));
  const fullOrder = consistentOrders(n, premises);
  return {
    signature: `ordering:${variant}:${names.join(',')}:${lines.join('|')}:${k}`,
    taskId: 'A-deduction',
    level,
    variant,
    seed: rng.seed,
    prompt: dom.firstQ(k),
    lines,
    response: { type: 'choice', options, correctIndex: optionIdx.indexOf(answer) },
    explanation: [
      'Reescribe todas las premisas en la misma dirección («X por delante de Y») y encadénalas.',
      fullOrder.length === 1
        ? `Orden completo: ${fullOrder[0].map((i) => names[i]).join(' → ')}.`
        : `El orden completo no está determinado (${fullOrder.length} posibilidades), pero en todas ${names[answer]} está ${dom.posName(k)}.`,
      `Respuesta: ${names[answer]}.`,
    ],
    focusKey: L >= 6 ? 'orden-parcial' : 'cadena',
    demand: 'razonamiento',
    meta: { n, premises, k, answer, names },
  };
}

export const deductionTask: ItemTask = {
  kind: 'item',
  id: 'A-deduction',
  module: 'A',
  name: 'Deducción de órdenes',
  short: 'Deducción',
  objective: 'Integrar premisas relacionales y extraer una conclusión necesaria.',
  instructions: [
    'Lee las afirmaciones: todas son verdaderas.',
    'Combínalas para deducir la posición que se pregunta.',
    'En niveles altos el orden completo puede no estar determinado: basta con que la respuesta lo esté.',
  ],
  strategies: [
    { id: 'linea', label: 'Dibujé mentalmente una línea' },
    { id: 'reescribir', label: 'Reescribí en la misma dirección' },
    { id: 'descartar', label: 'Descarté candidatos' },
    { id: 'intuicion', label: 'Intuición' },
  ],
  errorAdvice: {
    'inversion-relacion': { meaning: 'Invertiste la dirección de alguna relación («más bajo» leído como «más alto»).', better: 'Convierte todas las frases a una sola dirección antes de ordenar.' },
    'integracion-incompleta': { meaning: 'No integraste todas las premisas.', better: 'Coloca primero a quien no tiene a nadie por delante y avanza premisa a premisa.' },
  },
  transferHint: 'Ordenar información relacional es útil al planificar dependencias, prioridades o calendarios.',
  minLevel: 1,
  maxLevel: 10,
  hasNovel: true,
  novelDescription: 'Relaciones temporales (llegadas) en lugar de alturas.',
  blockSeconds: 180,
  itemsPerBlock: 5,
  expectedSeconds: (level) => 20 + level * 6,
  generate: makeOrderingItem,
  validate(item) {
    const errs = baseValidate(item);
    const m = item.meta as { n: number; premises: Premise[]; k: number; answer: number };
    const det = determinedAt(m.n, m.premises, m.k);
    if (det === null) errs.push('la posición preguntada no está determinada');
    else if (det !== m.answer) errs.push('la respuesta no coincide con el solucionador');
    return errs;
  },
};

// ---------- Información contradictoria (Módulo D) ----------

function entailment(n: number, premises: Premise[], s: Premise): 'verdadera' | 'falsa' | 'indeterminada' {
  const orders = consistentOrders(n, premises);
  const holds = orders.map((o) => o.indexOf(s.a) < o.indexOf(s.b));
  if (holds.every(Boolean)) return 'verdadera';
  if (holds.every((h) => !h)) return 'falsa';
  return 'indeterminada';
}

function makeContradictionItem(rng: Rng, level: number, variant: Variant): Item {
  const L = lvl(level);
  const n = L <= 3 ? 4 : L <= 7 ? 5 : 6;
  const dom = variant === 'novel' ? ARRIVAL : HEIGHT;
  for (let attempt = 0; attempt < 200; attempt++) {
    const names = rng.sample(NAMES, n);
    const order = rng.shuffle([...Array(n).keys()]);
    const all: Premise[] = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) all.push({ a: order[i], b: order[j] });
    // premisas: cadena completa (niveles bajos) o subconjunto suficiente para un orden parcial
    let premises: Premise[] = L <= 4 ? order.slice(0, -1).map((a, i) => ({ a, b: order[i + 1] })) : rng.sample(all, n);
    if (!consistentOrders(n, premises).length) continue;
    const contra = rng.pick(all.filter((p) => entailment(n, premises, p) === 'verdadera'));
    const falseStmt: Premise = { a: contra.b, b: contra.a };
    const trueOnes = all.filter((p) => entailment(n, premises, p) === 'verdadera' && p !== contra);
    // en niveles altos, alguna afirmación compatible pero no deducible (no es contradictoria)
    const undetermined: Premise[] = [];
    for (const p of all) {
      const e = entailment(n, premises, p);
      if (e === 'indeterminada') undetermined.push(p);
    }
    const nUnd = L >= 5 ? Math.min(2, undetermined.length) : 0;
    const others = [...rng.sample(undetermined, nUnd), ...rng.sample(trueOnes, 3 - nUnd)];
    if (others.length < 3) continue;
    const cand = rng.shuffle([falseStmt, ...others]);
    const options: ChoiceOption[] = cand.map((p) => ({
      label: render(p, names, dom, rng.chance(0.4)).replace(/\.$/, ''),
      errorTag: p === falseStmt ? undefined : entailment(n, premises, p) === 'indeterminada' ? 'confundir-indeterminado' : 'rechazar-verdadera',
    }));
    premises = rng.shuffle(premises);
    return {
      signature: `contra:${variant}:${names.join(',')}:${premises.map((p) => `${p.a}>${p.b}`).join('|')}:${falseStmt.a}>${falseStmt.b}`,
      taskId: 'D-contradiction',
      level,
      variant,
      seed: rng.seed,
      prompt: '¿Cuál de estas afirmaciones contradice la información anterior?',
      lines: premises.map((p) => render(p, names, dom, L >= 3 && rng.chance(0.4))),
      response: { type: 'choice', options, correctIndex: cand.indexOf(falseStmt) },
      explanation: [
        `Las premisas implican que ${names[contra.a]} ${dom.above} ${names[contra.b]}, así que afirmar lo contrario es contradictorio.`,
        nUnd > 0 ? 'Algunas opciones no se pueden deducir, pero son compatibles: no contradicen nada.' : 'Las demás afirmaciones se deducen de las premisas.',
        'Distingue entre «no se deduce» y «es incompatible»: solo lo segundo es una contradicción.',
      ],
      focusKey: nUnd > 0 ? 'compatibilidad' : 'contradiccion-directa',
      demand: 'razonamiento',
      meta: { n, premises, falseStmt, names, candidates: cand },
    };
  }
  throw new Error('No se pudo generar un ítem de contradicción');
}

export const contradictionTask: ItemTask = {
  kind: 'item',
  id: 'D-contradiction',
  module: 'D',
  name: 'Información contradictoria',
  short: 'Contradicciones',
  objective: 'Detectar qué información es incompatible con lo conocido y distinguirla de lo simplemente no demostrado.',
  instructions: [
    'Las afirmaciones iniciales son verdaderas.',
    'Solo una de las opciones es incompatible con ellas.',
    'Cuidado: una afirmación que no se puede deducir no tiene por qué ser contradictoria.',
  ],
  strategies: [
    { id: 'construir-orden', label: 'Construí el orden y comprobé cada opción' },
    { id: 'buscar-contrario', label: 'Busqué la relación opuesta' },
    { id: 'intuicion', label: 'Intuición' },
  ],
  errorAdvice: {
    'confundir-indeterminado': { meaning: 'Elegiste una afirmación que no se deduce pero tampoco contradice nada.', better: 'Pregúntate: ¿existe algún orden compatible con todo en el que esta afirmación sea cierta? Si existe, no es contradictoria.' },
    'rechazar-verdadera': { meaning: 'Elegiste una afirmación que en realidad se deduce de las premisas.', better: 'Encadena las premisas y verifica la dirección de cada relación.' },
  },
  transferHint: 'Separar «no demostrado» de «falso» evita conclusiones precipitadas al evaluar noticias, informes o argumentos.',
  minLevel: 1,
  maxLevel: 10,
  hasNovel: true,
  novelDescription: 'Relaciones temporales en lugar de alturas.',
  blockSeconds: 180,
  itemsPerBlock: 5,
  expectedSeconds: (level) => 25 + level * 5,
  generate: makeContradictionItem,
  validate(item) {
    const errs = baseValidate(item);
    const m = item.meta as { n: number; premises: Premise[]; falseStmt: Premise };
    if (!consistentOrders(m.n, m.premises).length) errs.push('premisas inconsistentes');
    if (entailment(m.n, m.premises, m.falseStmt) !== 'falsa') errs.push('la opción correcta no es contradictoria');
    const cands = (item.meta as { candidates: Premise[] }).candidates;
    const nContra = cands.filter((c) => entailment(m.n, m.premises, c) === 'falsa').length;
    if (nContra !== 1) errs.push(`hay ${nContra} opciones contradictorias (debe haber 1)`);
    return errs;
  },
};

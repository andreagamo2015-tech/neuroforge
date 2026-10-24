import type { Rng } from '../rng';
import type { ChoiceOption, Item, ItemTask, Variant } from '../types';
import { LETTERS, baseValidate, lvl, normalizeText } from './common';
import { lowDegreePrediction } from './series';

// Banco de transferencia: tareas RESERVADAS que nunca aparecen en el entrenamiento.
// Se administran como formas paralelas de dificultad fija para poder comparar en el tiempo.

// ---------- T1: series de letras (transferencia cercana del razonamiento inductivo) ----------
interface LetterRule { id: string; min: number; make(r: Rng): { idx: number[]; rule: string } }
const LETTER_RULES: LetterRule[] = [
  { id: 'salto', min: 1, make(r) { const k = r.int(1, 3), s = r.int(0, 25 - 6 * k); return { idx: [0, 1, 2, 3, 4, 5, 6].map((i) => s + i * k), rule: `Se avanza ${k} letra${k > 1 ? 's' : ''} cada vez.` }; } },
  { id: 'retroceso', min: 2, make(r) { const k = r.int(1, 3), s = r.int(6 * k, 25); return { idx: [0, 1, 2, 3, 4, 5, 6].map((i) => s - i * k), rule: `Se retrocede ${k} letra${k > 1 ? 's' : ''} cada vez.` }; } },
  {
    id: 'saltos-alternos', min: 4,
    make(r) {
      const a = r.int(1, 2), b = r.int(3, 4), s = r.int(0, 25 - 3 * (a + b) - b);
      const idx = [s];
      for (let i = 1; i < 7; i++) idx.push(idx[i - 1] + (i % 2 === 1 ? a : b));
      return { idx, rule: `Se alternan saltos de ${a} y de ${b}.` };
    },
  },
  {
    id: 'saltos-crecientes', min: 5,
    make(r) { const s = r.int(0, 3); const idx = [s]; for (let i = 1; i < 7; i++) idx.push(idx[i - 1] + i); return { idx, rule: 'Los saltos crecen: +1, +2, +3, …' }; },
  },
  {
    id: 'intercaladas', min: 6,
    make(r) {
      const s1 = r.int(0, 8), s2 = r.int(17, 25);
      return { idx: [0, 1, 2, 3, 4, 5, 6].map((i) => (i % 2 === 0 ? s1 + i : s2 - (i - 1) / 2)), rule: 'Dos series intercaladas: una avanza de 2 en 2 y la otra retrocede de 1 en 1.' };
    },
  },
  {
    id: 'saltos-dobles', min: 8,
    make(r) { const s = r.int(0, 2); const idx = [s]; for (let i = 1; i < 5; i++) idx.push(idx[i - 1] + 2 ** (i - 1)); return { idx, rule: 'Los saltos se duplican: +1, +2, +4, +8…' }; },
  },
];

function makeLetterSeries(rng: Rng, level: number, variant: Variant): Item {
  const L = lvl(level);
  const pool = LETTER_RULES.filter((r) => r.min <= L && r.min >= L - 3);
  for (let attempt = 0; attempt < 100; attempt++) {
    const rule = rng.pick(pool.length ? pool : LETTER_RULES);
    const { idx, rule: text } = rule.make(rng);
    if (idx.some((i) => i < 0 || i > 25)) continue;
    const shown = idx.slice(0, -1).map((i) => LETTERS[i]);
    const answer = LETTERS[idx[idx.length - 1]];
    return {
      signature: `tletters:${idx.join(',')}`,
      taskId: 'T-letters', level, variant, seed: rng.seed,
      prompt: '¿Qué letra continúa la serie? (alfabeto sin Ñ)',
      figure: { type: 'symbols', text: `${shown.join('  ')}  ?` },
      response: { type: 'text', accept: [answer] },
      explanation: [text, `Serie completa: ${idx.map((i) => LETTERS[i]).join(' ')}.`],
      focusKey: rule.id, demand: 'razonamiento',
      meta: { idx },
    };
  }
  throw new Error('No se pudo generar una serie de letras');
}

export const letterSeriesTask: ItemTask = {
  kind: 'item', id: 'T-letters', module: 'T', reserved: true,
  name: 'Series de letras', short: 'Letras',
  objective: 'Transferencia cercana: aplicar el razonamiento inductivo de las series a un material distinto.',
  instructions: ['Escribe la letra que continúa la serie.', 'El alfabeto no incluye la Ñ y no da la vuelta.'],
  strategies: [{ id: 'posiciones', label: 'Convertí letras en posiciones' }, { id: 'visual', label: 'Recité el alfabeto' }],
  errorAdvice: { 'regla-no-identificada': { meaning: 'No se identificó la regla.', better: 'Convierte las letras en números (A=1, B=2…) y aplica lo que sabes de series.' } },
  transferHint: 'Convertir un material nuevo a uno conocido permite reutilizar estrategias.',
  minLevel: 1, maxLevel: 10, hasNovel: false, blockSeconds: 120,
  itemsPerBlock: 6, expectedSeconds: () => 20,
  generate: makeLetterSeries,
  validate(item) {
    const errs = baseValidate(item);
    const idx = (item.meta as { idx: number[] }).idx;
    const visible = idx.slice(0, -1).map((v, i) => [i, v] as [number, number]);
    const pred = lowDegreePrediction(visible, idx.length - 1);
    if (pred && Math.abs(pred.value - idx[idx.length - 1]) > 1e-6) errs.push('ambigua');
    if (item.response.type === 'text' && item.response.accept[0] !== LETTERS[idx[idx.length - 1]]) errs.push('respuesta incorrecta');
    return errs;
  },
  diagnose: () => 'regla-no-identificada',
};

// ---------- T2: inferencia de operaciones nuevas ----------
interface OpRule { id: string; text: string; f: (a: number, b: number) => number }
const TARGET_RULES: { min: number; rule: OpRule }[] = [
  { min: 1, rule: { id: 'a+2b', text: 'a + 2b', f: (a, b) => a + 2 * b } },
  { min: 1, rule: { id: '2a+b', text: '2a + b', f: (a, b) => 2 * a + b } },
  { min: 2, rule: { id: '2a-b', text: '2a − b', f: (a, b) => 2 * a - b } },
  { min: 3, rule: { id: 'ab+a', text: 'a·b + a', f: (a, b) => a * b + a } },
  { min: 4, rule: { id: 'ab-1', text: 'a·b − 1', f: (a, b) => a * b - 1 } },
  { min: 5, rule: { id: 'a2-b', text: 'a² − b', f: (a, b) => a * a - b } },
  { min: 6, rule: { id: 'a+b+ab', text: 'a + b + a·b', f: (a, b) => a + b + a * b } },
  { min: 7, rule: { id: '(a-b)a', text: '(a − b)·a', f: (a, b) => (a - b) * a } },
  { min: 8, rule: { id: 'a2+b2', text: 'a² + b²', f: (a, b) => a * a + b * b } },
  { min: 9, rule: { id: '(a+b)(a-b)', text: '(a + b)·(a − b)', f: (a, b) => (a + b) * (a - b) } },
];

/** Biblioteca amplia de reglas alternativas para descartar ambigüedades. */
export function ruleLibrary(): OpRule[] {
  const lib: OpRule[] = TARGET_RULES.map((t) => t.rule);
  for (let p = -2; p <= 3; p++) for (let q = -2; q <= 3; q++) for (let r = -3; r <= 3; r++) lib.push({ id: `lin:${p},${q},${r}`, text: '', f: (a, b) => p * a + q * b + r });
  lib.push(
    { id: 'ab', text: '', f: (a, b) => a * b },
    { id: 'ab+b', text: '', f: (a, b) => a * b + b },
    { id: 'ab+1', text: '', f: (a, b) => a * b + 1 },
    { id: 'b2-a', text: '', f: (a, b) => b * b - a },
    { id: 'a2+b', text: '', f: (a, b) => a * a + b },
    { id: '(a+b)2', text: '', f: (a, b) => (a + b) ** 2 },
    { id: 'max', text: '', f: (a, b) => Math.max(a, b) },
    { id: '2ab', text: '', f: (a, b) => 2 * a * b },
    { id: 'ab-a', text: '', f: (a, b) => a * b - a },
    { id: 'ab-b', text: '', f: (a, b) => a * b - b },
  );
  return lib;
}
const LIB = ruleLibrary();

export function opAnswers(examples: [number, number, number][], q: [number, number]): Set<number> {
  const out = new Set<number>();
  for (const r of LIB) if (examples.every(([a, b, c]) => r.f(a, b) === c)) out.add(r.f(q[0], q[1]));
  return out;
}

function makeOpItem(rng: Rng, level: number, variant: Variant): Item {
  const L = lvl(level);
  const pool = TARGET_RULES.filter((t) => t.min <= L && t.min >= L - 3);
  for (let attempt = 0; attempt < 300; attempt++) {
    const rule = rng.pick(pool.length ? pool : TARGET_RULES).rule;
    const pairs: [number, number][] = [];
    while (pairs.length < 4) {
      const a = rng.int(2, 9), b = rng.int(1, 8);
      if (!pairs.some(([x, y]) => x === a && y === b)) pairs.push([a, b]);
    }
    const examples = pairs.slice(0, 3).map(([a, b]) => [a, b, rule.f(a, b)] as [number, number, number]);
    const q = pairs[3];
    const ans = opAnswers(examples, q);
    if (ans.size !== 1) continue;
    return {
      signature: `top:${JSON.stringify(examples)}:${q}`,
      taskId: 'T-operations', level, variant, seed: rng.seed,
      prompt: `¿Cuánto vale ${q[0]} ◆ ${q[1]}?`,
      lines: ['El símbolo ◆ representa una operación desconocida entre dos números. Ejemplos:', ...examples.map(([a, b, c]) => `${a} ◆ ${b} = ${c}`)],
      response: { type: 'numeric', answer: rule.f(q[0], q[1]) },
      explanation: [`La operación es a ◆ b = ${rule.text}.`, `${q[0]} ◆ ${q[1]} = ${rule.f(q[0], q[1])}.`, 'Estrategia: prueba hipótesis simples (sumas ponderadas, productos) y verifica con TODOS los ejemplos.'],
      focusKey: rule.id, demand: 'razonamiento',
      meta: { examples, q, rule: rule.id },
    };
  }
  throw new Error('No se pudo generar una operación');
}

export const operationsTask: ItemTask = {
  kind: 'item', id: 'T-operations', module: 'T', reserved: true,
  name: 'Inferencia de operaciones', short: 'Operaciones',
  objective: 'Transferencia: aprender una regla nueva a partir de pocos ejemplos y aplicarla.',
  instructions: ['Descubre qué operación representa ◆ a partir de los ejemplos.', 'Escribe el resultado de la operación pedida.'],
  strategies: [{ id: 'hipotesis', label: 'Formulé y verifiqué hipótesis' }, { id: 'tanteo', label: 'Tanteo' }],
  errorAdvice: { 'regla-no-verificada': { meaning: 'La regla propuesta no encaja con todos los ejemplos.', better: 'Comprueba cada hipótesis con todos los ejemplos antes de aplicarla.' } },
  transferHint: 'Aprender reglas a partir de ejemplos es la base de aprender procedimientos nuevos en cualquier campo.',
  minLevel: 1, maxLevel: 10, hasNovel: false, blockSeconds: 180,
  itemsPerBlock: 5, expectedSeconds: (l) => 30 + l * 5,
  generate: makeOpItem,
  validate(item) {
    const errs = baseValidate(item);
    const m = item.meta as { examples: [number, number, number][]; q: [number, number] };
    const ans = opAnswers(m.examples, m.q);
    if (ans.size !== 1) errs.push(`ambigua (${ans.size} respuestas en la biblioteca de reglas)`);
    if (item.response.type === 'numeric' && !ans.has(item.response.answer)) errs.push('respuesta incorrecta');
    return errs;
  },
  diagnose: () => 'regla-no-verificada',
};

// ---------- T3: razonamiento aplicado ----------
export function longestPath(durations: number[], deps: number[][]): number {
  const finish: number[] = [];
  durations.forEach((d, i) => {
    finish[i] = d + Math.max(0, ...deps[i].map((j) => finish[j]));
  });
  return Math.max(...finish);
}

function makeApplied(rng: Rng, level: number, variant: Variant): Item {
  const L = lvl(level);
  if (rng.chance(0.5)) {
    const n = L <= 3 ? 4 : L <= 6 ? 5 : 6;
    const names = 'ABCDEF'.split('').slice(0, n);
    const durations = names.map(() => rng.int(1, 6));
    const deps = names.map((_, i) => (i === 0 ? [] : rng.sample([...Array(i).keys()], rng.int(i === 1 ? 1 : 0, Math.min(2, i)))));
    const total = longestPath(durations, deps);
    const sum = durations.reduce((a, b) => a + b, 0);
    if (total === sum && n > 4) return makeApplied(rng, level, variant);
    return {
      signature: `tapp:cpm:${durations.join(',')}:${JSON.stringify(deps)}`,
      taskId: 'T-applied', level, variant, seed: rng.seed,
      prompt: '¿Cuál es el tiempo mínimo (en horas) para terminar todo el proyecto?',
      lines: [
        'Un proyecto tiene varias tareas. Hay personas de sobra: las tareas sin dependencias pendientes pueden hacerse a la vez.',
        ...names.map((nm, i) => `Tarea ${nm}: ${durations[i]} h${deps[i].length ? `; requiere terminar antes ${deps[i].map((j) => names[j]).join(' y ')}` : ''}.`),
      ],
      response: { type: 'numeric', answer: total },
      explanation: [
        'Calcula para cada tarea su hora de fin más temprana: su duración más el máximo de los fines de sus requisitos.',
        `El proyecto termina con la cadena de dependencias más larga: ${total} h (sumar todas las duraciones daría ${sum} h).`,
      ],
      focusKey: 'ruta-critica', demand: 'razonamiento',
      meta: { kind: 'cpm', durations, deps, sum },
    };
  }
  // Mejor oferta (precio por unidad)
  for (;;) {
    const base = rng.int(40, 120); // céntimos por unidad
    const offers = [
      (() => { const n = rng.pick([4, 6, 8]); const price = Math.round(base * n * rng.pick([0.85, 0.9, 0.95])); return { text: `Pack de ${n} unidades por ${(price / 100).toFixed(2).replace('.', ',')} €`, unit: price / n }; })(),
      (() => { const p = base; return { text: `Unidad a ${(p / 100).toFixed(2).replace('.', ',')} € con promoción 3×2 (compras 3, pagas 2)`, unit: (p * 2) / 3 }; })(),
      (() => { const n = rng.pick([10, 12]); const price = Math.round(base * n * rng.pick([0.75, 0.8])); const d = rng.pick([10, 20]); return { text: `Pack de ${n} unidades por ${(price / 100).toFixed(2).replace('.', ',')} € con un ${d} % de descuento`, unit: (price * (1 - d / 100)) / n }; })(),
    ];
    const sorted = offers.map((o) => o.unit).sort((a, b) => a - b);
    if ((sorted[1] - sorted[0]) / sorted[0] < 0.03) continue;
    const order = rng.shuffle(offers);
    const best = order.reduce((bi, o, i) => (o.unit < order[bi].unit ? i : bi), 0);
    const options: ChoiceOption[] = order.map((o, i) => ({ label: o.text, errorTag: i === best ? undefined : 'precio-unitario-mal-calculado' }));
    return {
      signature: `tapp:deal:${order.map((o) => o.text).join('|')}`,
      taskId: 'T-applied', level, variant, seed: rng.seed,
      prompt: '¿Qué oferta tiene el precio por unidad más bajo?',
      lines: ['Quieres comprar un producto para un año y te ofrecen:'],
      response: { type: 'choice', options, correctIndex: best },
      explanation: order.map((o) => `${o.text}: ${(o.unit / 100).toFixed(3).replace('.', ',')} € por unidad.`).concat('Compara siempre el precio por unidad, aplicando promociones y descuentos.'),
      focusKey: 'precio-unitario', demand: 'razonamiento',
      meta: { kind: 'deal', units: order.map((o) => o.unit), best },
    };
  }
}

export const appliedTask: ItemTask = {
  kind: 'item', id: 'T-applied', module: 'T', reserved: true,
  name: 'Razonamiento aplicado', short: 'Aplicado',
  objective: 'Transferencia lejana: problemas cotidianos de planificación y decisión.',
  instructions: ['Problemas prácticos de planificación de proyectos y comparación de ofertas.', 'Puedes usar papel.'],
  strategies: [{ id: 'esquema', label: 'Hice un esquema' }, { id: 'calculo', label: 'Calculé cada caso' }, { id: 'intuicion', label: 'Intuición' }],
  errorAdvice: {
    'suma-total': { meaning: 'Sumaste todas las duraciones sin tener en cuenta el paralelismo.', better: 'Busca la cadena de dependencias más larga.' },
    'precio-unitario-mal-calculado': { meaning: 'No elegiste el menor precio por unidad.', better: 'Calcula precio ÷ unidades aplicando la promoción.' },
    otro: { meaning: 'Planificación incorrecta.', better: 'Calcula la hora de fin de cada tarea en orden.' },
  },
  transferHint: 'Estas son situaciones reales donde se aplican las habilidades entrenadas.',
  minLevel: 1, maxLevel: 10, hasNovel: false, blockSeconds: 240,
  itemsPerBlock: 4, expectedSeconds: () => 60,
  generate: makeApplied,
  validate(item) {
    const errs = baseValidate(item);
    const m = item.meta as { kind: string; durations?: number[]; deps?: number[][]; units?: number[]; best?: number };
    if (m.kind === 'cpm' && item.response.type === 'numeric' && longestPath(m.durations!, m.deps!) !== item.response.answer) errs.push('ruta crítica incorrecta');
    if (m.kind === 'deal') {
      const min = Math.min(...m.units!);
      if (m.units!.filter((u) => u === min).length !== 1 || m.units![m.best!] !== min) errs.push('oferta óptima no única o incorrecta');
    }
    return errs;
  },
  diagnose(item, raw) {
    const m = item.meta as { kind: string; sum?: number };
    if (m.kind === 'cpm' && Number(raw) === m.sum) return 'suma-total';
    return 'otro';
  },
};

export const normalizeLetter = (s: string) => normalizeText(s).toUpperCase();

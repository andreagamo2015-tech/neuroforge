import type { Rng } from '../rng';
import type { ChoiceOption, Item, ItemTask, Variant } from '../types';
import { gcd } from '../stats';
import { baseValidate, lvl } from './common';

// Probabilidad con fracciones exactas. Las respuestas se calculan por enumeración o conteo,
// nunca a mano, y los distractores corresponden a errores de razonamiento conocidos.

export interface Frac { n: number; d: number }
export const frac = (n: number, d: number): Frac => {
  const g = gcd(n, d) || 1;
  return { n: n / g, d: d / g };
};
export const fracStr = (f: Frac) => (f.n === 0 ? '0' : f.d === 1 ? String(f.n) : `${f.n}/${f.d}`);
const fracVal = (f: Frac) => f.n / f.d;

const DICE: [number, number][] = [];
for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) DICE.push([a, b]);

interface PTemplate {
  id: string;
  minLevel: number;
  make(rng: Rng): { lines: string[]; prompt: string; answer: Frac; distractors: { f: Frac; tag: string }[]; explanation: string[] };
}

const TEMPLATES: PTemplate[] = [
  {
    id: 'suma-dados', minLevel: 1,
    make(r) {
      const s = r.int(3, 11);
      const c = DICE.filter(([a, b]) => a + b === s).length;
      return {
        lines: ['Lanzas dos dados normales de seis caras.'],
        prompt: `¿Cuál es la probabilidad de que la suma sea ${s}?`,
        answer: frac(c, 36),
        distractors: [
          { f: frac(1, 11), tag: 'resultados-no-equiprobables' },
          { f: frac(c + 1, 36), tag: 'conteo-incorrecto' },
          { f: frac(Math.max(1, c - 1), 36), tag: 'conteo-incorrecto' },
          { f: frac(1, 6), tag: 'conteo-incorrecto' },
        ],
        explanation: [`Hay 36 resultados igual de probables. ${c} suman ${s}: ${DICE.filter(([a, b]) => a + b === s).map(([a, b]) => `(${a},${b})`).join(' ')}.`, `Probabilidad: ${c}/36 = ${fracStr(frac(c, 36))}.`, 'Las 11 sumas posibles no son igual de probables.'],
      };
    },
  },
  {
    id: 'sin-reposicion', minLevel: 3,
    make(r) {
      const red = r.int(2, 6), blue = r.int(2, 6), n = red + blue;
      return {
        lines: [`Una bolsa tiene ${red} bolas rojas y ${blue} azules. Sacas dos bolas sin devolver la primera.`],
        prompt: '¿Cuál es la probabilidad de que las dos sean rojas?',
        answer: frac(red * (red - 1), n * (n - 1)),
        distractors: [
          { f: frac(red * red, n * n), tag: 'con-reposicion' },
          { f: frac(red, n), tag: 'una-sola-extraccion' },
          { f: frac(2 * red, n * 2 + 1), tag: 'conteo-incorrecto' },
          { f: frac(red - 1, n - 1), tag: 'una-sola-extraccion' },
        ],
        explanation: [`Primera roja: ${red}/${n}. Quedan ${red - 1} rojas de ${n - 1}.`, `P = ${red}/${n} × ${red - 1}/${n - 1} = ${fracStr(frac(red * (red - 1), n * (n - 1)))}.`],
      };
    },
  },
  {
    id: 'al-menos-uno', minLevel: 4,
    make(r) {
      const k = r.int(2, 3);
      return {
        lines: [`Lanzas un dado ${k} veces.`],
        prompt: '¿Cuál es la probabilidad de obtener al menos un seis?',
        answer: frac(6 ** k - 5 ** k, 6 ** k),
        distractors: [
          { f: frac(k, 6), tag: 'sumar-probabilidades' },
          { f: frac(5 ** k, 6 ** k), tag: 'olvidar-complemento' },
          { f: frac(1, 6 ** k), tag: 'confundir-todos' },
        ],
        explanation: ['Es más fácil calcular lo contrario: ningún seis.', `P(ningún seis) = (5/6)^${k} = ${5 ** k}/${6 ** k}.`, `P(al menos uno) = 1 − ${5 ** k}/${6 ** k} = ${fracStr(frac(6 ** k - 5 ** k, 6 ** k))}.`],
      };
    },
  },
  {
    id: 'condicional-dados', minLevel: 6,
    make(r) {
      const conds = [
        { text: (v: number) => `al menos uno de los dados muestra un ${v}`, test: (v: number) => ([a, b]: number[]) => a === v || b === v },
        { text: () => 'la suma es par', test: () => ([a, b]: number[]) => (a + b) % 2 === 0 },
        { text: () => 'el primer dado es mayor que el segundo', test: () => ([a, b]: number[]) => a > b },
      ];
      const events = [
        { text: () => 'los dos dados muestren lo mismo', test: () => ([a, b]: number[]) => a === b },
        { text: (s: number) => `la suma sea al menos ${s}`, test: (s: number) => ([a, b]: number[]) => a + b >= s },
      ];
      for (;;) {
        const ci = r.pick(conds), ei = r.pick(events);
        const v = r.int(1, 6), s = r.int(6, 10);
        const C = DICE.filter(ci.test(v));
        const EC = C.filter(ei.test(s));
        const E = DICE.filter(ei.test(s));
        if (EC.length === 0 || EC.length === C.length) continue;
        const answer = frac(EC.length, C.length);
        const d1 = frac(EC.length, 36), d2 = frac(E.length, 36);
        if ([d1, d2].some((d) => fracVal(d) === fracVal(answer))) continue;
        return {
          lines: ['Lanzas dos dados. Alguien los mira y te dice que ' + ci.text(v) + '.'],
          prompt: `Con esa información, ¿cuál es la probabilidad de que ${ei.text(s)}?`,
          answer,
          distractors: [
            { f: d1, tag: 'no-condicionar' },
            { f: d2, tag: 'ignorar-informacion' },
            { f: frac(EC.length, C.length + 1), tag: 'conteo-incorrecto' },
            { f: frac(Math.min(C.length, EC.length + 1), C.length), tag: 'conteo-incorrecto' },
          ],
          explanation: [`Solo cuentan los ${C.length} resultados compatibles con la información.`, `De ellos, ${EC.length} cumplen el suceso.`, `P = ${EC.length}/${C.length} = ${fracStr(answer)}.`],
        };
      }
    },
  },
  {
    id: 'tasa-base', minLevel: 8,
    make(r) {
      const k = r.pick([10, 20, 50, 100]), s = r.pick([80, 90]), f = r.pick([5, 10]);
      const tp = (k * s) / 100, fp = ((1000 - k) * f) / 100;
      return {
        lines: [`En una población de 1000 personas, ${k} tienen una condición.`, `Una prueba da positivo en el ${s} % de quienes la tienen y en el ${f} % de quienes no la tienen.`],
        prompt: 'Si una persona da positivo, ¿qué probabilidad hay de que tenga la condición?',
        answer: frac(tp, tp + fp),
        distractors: [
          { f: frac(s, 100), tag: 'confundir-condicionales' },
          { f: frac(k, 1000), tag: 'ignorar-prueba' },
          { f: frac(100 - f, 100), tag: 'confundir-condicionales' },
        ],
        explanation: [`Positivos verdaderos: ${s} % de ${k} = ${tp}.`, `Falsos positivos: ${f} % de ${1000 - k} = ${fp}.`, `P = ${tp}/(${tp} + ${fp}) = ${fracStr(frac(tp, tp + fp))}.`, 'Con una condición poco frecuente, muchos positivos son falsos (tasa base).'],
      };
    },
  },
];

function makeProbItem(rng: Rng, level: number, variant: Variant, focus?: string): Item {
  const L = lvl(level);
  let pool = TEMPLATES.filter((t) => t.minLevel <= L && t.minLevel >= L - 6);
  const f = TEMPLATES.filter((t) => t.id === focus);
  if (f.length) pool = f;
  const tpl = rng.pick(pool);
  const q = tpl.make(rng);
  const seen = new Set([fracVal(q.answer)]);
  const ds: { f: Frac; tag: string }[] = [];
  for (const d of q.distractors) {
    const v = fracVal(d.f);
    if (seen.has(v) || v <= 0 || v > 1) continue;
    seen.add(v);
    ds.push(d);
    if (ds.length === 3) break;
  }
  const all = rng.shuffle([{ f: q.answer, tag: undefined as string | undefined }, ...ds]);
  const options: ChoiceOption[] = all.map((o) => ({ label: fracStr(o.f), errorTag: o.tag }));
  return {
    signature: `prob:${tpl.id}:${q.lines.join('|')}:${q.prompt}`,
    taskId: 'E-probability',
    level,
    variant,
    seed: rng.seed,
    prompt: q.prompt,
    lines: q.lines,
    response: { type: 'choice', options, correctIndex: all.findIndex((o) => o.tag === undefined) },
    explanation: q.explanation,
    focusKey: tpl.id,
    demand: tpl.id === 'tasa-base' || tpl.id === 'condicional-dados' ? 'razonamiento' : 'conocimiento',
    meta: { template: tpl.id, answer: q.answer },
  };
}

export const probabilityTask: ItemTask = {
  kind: 'item',
  id: 'E-probability',
  module: 'E',
  name: 'Probabilidad',
  short: 'Probabilidad',
  objective: 'Razonar con incertidumbre: contar casos, condicionar y evitar sesgos conocidos.',
  instructions: ['Elige la probabilidad correcta.', 'Enumera los casos posibles cuando dudes.', 'Las fracciones están simplificadas.'],
  strategies: [
    { id: 'enumerar', label: 'Enumeré casos' },
    { id: 'complemento', label: 'Usé el complemento' },
    { id: 'frecuencias', label: 'Pensé en frecuencias (de cada 1000…)' },
    { id: 'formula', label: 'Apliqué una fórmula' },
    { id: 'intuicion', label: 'Intuición' },
  ],
  errorAdvice: {
    'resultados-no-equiprobables': { meaning: 'Trataste las sumas como igual de probables.', better: 'Cuenta pares ordenados (a, b): son los resultados equiprobables.' },
    'con-reposicion': { meaning: 'Calculaste como si devolvieras la bola.', better: 'Actualiza el numerador y el denominador tras cada extracción.' },
    'una-sola-extraccion': { meaning: 'Solo tuviste en cuenta una extracción.', better: 'Multiplica las probabilidades de cada paso.' },
    'sumar-probabilidades': { meaning: 'Sumaste probabilidades de sucesos que no son excluyentes.', better: 'Usa el complemento: 1 − P(ninguno).' },
    'olvidar-complemento': { meaning: 'Calculaste P(ninguno) y olvidaste restarlo de 1.', better: 'Pregúntate si el resultado responde a lo que se pide.' },
    'confundir-todos': { meaning: 'Calculaste P(todos) en lugar de P(al menos uno).', better: 'Traduce «al menos uno» como «no ninguno».' },
    'no-condicionar': { meaning: 'Usaste los 36 resultados en lugar de solo los compatibles.', better: 'La información recibida reduce el espacio de resultados.' },
    'ignorar-informacion': { meaning: 'Ignoraste la información recibida.', better: 'Filtra primero los casos compatibles con lo que sabes.' },
    'confundir-condicionales': { meaning: 'Confundiste P(positivo | condición) con P(condición | positivo).', better: 'Convierte porcentajes en frecuencias sobre 1000 personas.' },
    'ignorar-prueba': { meaning: 'Usaste solo la tasa base.', better: 'Combina la tasa base con los resultados de la prueba.' },
    'conteo-incorrecto': { meaning: 'Error de conteo.', better: 'Escribe la lista completa de casos favorables.' },
  },
  transferHint: 'Pensar en frecuencias naturales («de cada 1000») ayuda a interpretar pruebas médicas, encuestas y riesgos.',
  minLevel: 1,
  maxLevel: 10,
  hasNovel: false,
  blockSeconds: 200,
  itemsPerBlock: 4,
  expectedSeconds: (level) => 30 + level * 5,
  generate: makeProbItem,
  validate(item) {
    const errs = baseValidate(item);
    if (item.response.type !== 'choice') return [...errs, 'tipo incorrecto'];
    const vals = item.response.options.map((o) => {
      const [n, d] = o.label.split('/').map(Number);
      return d ? n / d : n;
    });
    if (new Set(vals).size !== vals.length) errs.push('dos opciones con el mismo valor');
    const a = (item.meta as { answer: Frac }).answer;
    if (Math.abs(vals[item.response.correctIndex] - a.n / a.d) > 1e-12) errs.push('la opción correcta no es la respuesta');
    if (vals.some((v) => v < 0 || v > 1)) errs.push('probabilidad fuera de [0,1]');
    return errs;
  },
};

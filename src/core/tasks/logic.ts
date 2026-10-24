import type { Rng } from '../rng';
import type { ChoiceOption, Item, ItemTask, Variant } from '../types';
import { baseValidate, lvl } from './common';

// Inferencia lógica proposicional. La validez se decide por tabla de verdad completa.

export type Formula =
  | { t: 'atom'; i: number }
  | { t: 'not'; f: Formula }
  | { t: 'and'; a: Formula; b: Formula }
  | { t: 'or'; a: Formula; b: Formula }
  | { t: 'imp'; a: Formula; b: Formula };

export function evaluate(f: Formula, v: boolean[]): boolean {
  switch (f.t) {
    case 'atom': return v[f.i];
    case 'not': return !evaluate(f.f, v);
    case 'and': return evaluate(f.a, v) && evaluate(f.b, v);
    case 'or': return evaluate(f.a, v) || evaluate(f.b, v);
    case 'imp': return !evaluate(f.a, v) || evaluate(f.b, v);
  }
}

/** ¿Las premisas implican la conclusión en todas las asignaciones? */
export function entails(premises: Formula[], conclusion: Formula, nAtoms: number): boolean {
  for (let m = 0; m < 2 ** nAtoms; m++) {
    const v = Array.from({ length: nAtoms }, (_, i) => Boolean(m & (1 << i)));
    if (premises.every((p) => evaluate(p, v)) && !evaluate(conclusion, v)) return false;
  }
  return true;
}

export function satisfiable(premises: Formula[], nAtoms: number): boolean {
  for (let m = 0; m < 2 ** nAtoms; m++) {
    const v = Array.from({ length: nAtoms }, (_, i) => Boolean(m & (1 << i)));
    if (premises.every((p) => evaluate(p, v))) return true;
  }
  return false;
}

const ATOM_SETS: [string, string][][] = [
  [['la luz está encendida', 'la luz no está encendida'], ['la puerta está abierta', 'la puerta no está abierta'], ['suena la alarma', 'no suena la alarma'], ['el robot avanza', 'el robot no avanza']],
  [['la máquina está en modo A', 'la máquina no está en modo A'], ['el piloto verde parpadea', 'el piloto verde no parpadea'], ['el depósito está lleno', 'el depósito no está lleno'], ['la bomba funciona', 'la bomba no funciona']],
  [['el zorb es azul', 'el zorb no es azul'], ['el zorb es redondo', 'el zorb no es redondo'], ['el zorb flota', 'el zorb no flota'], ['el zorb brilla', 'el zorb no brilla']],
];

const A = (i: number): Formula => ({ t: 'atom', i });
const NOT = (f: Formula): Formula => ({ t: 'not', f });
const IMP = (a: Formula, b: Formula): Formula => ({ t: 'imp', a, b });
const OR = (a: Formula, b: Formula): Formula => ({ t: 'or', a, b });
const AND = (a: Formula, b: Formula): Formula => ({ t: 'and', a, b });

type Phrase = (f: Formula) => string;

function makePhraser(atoms: [string, string][]): { lit: Phrase; sentence: (f: Formula, style?: string) => string } {
  const lit: Phrase = (f) => {
    if (f.t === 'atom') return atoms[f.i][0];
    if (f.t === 'not' && f.f.t === 'atom') return atoms[f.f.i][1];
    return '(fórmula compleja)';
  };
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
  const sentence = (f: Formula, style = 'si'): string => {
    if (f.t === 'atom' || (f.t === 'not' && f.f.t === 'atom')) return cap(lit(f)) + '.';
    if (f.t === 'imp') {
      if (style === 'solo-si') return `${cap(lit(f.a))} solo si ${lit(f.b)}.`;
      if (style === 'a-menos-que' && f.a.t === 'not') return `${cap(lit(f.b))}, a menos que ${lit(f.a.f)}.`;
      return `Si ${lit(f.a)}, entonces ${lit(f.b)}.`;
    }
    if (f.t === 'or') return `${cap(lit(f.a))} o ${lit(f.b)} (o ambas cosas).`;
    if (f.t === 'not' && f.f.t === 'and') return `No es cierto que ${lit(f.f.a)} y ${lit(f.f.b)} a la vez.`;
    return '(fórmula)';
  };
  return { lit, sentence };
}

const neg = (f: Formula): Formula => (f.t === 'not' ? f.f : NOT(f));
const litOf = (i: number, positive: boolean) => (positive ? A(i) : NOT(A(i)));

interface Problem { premises: { f: Formula; style: string }[]; conclusion: Formula; form: string; nAtoms: number }

function buildProblem(rng: Rng, L: number): Problem {
  const p = litOf(0, rng.chance(0.75)), q = litOf(1, rng.chance(0.75)), r = litOf(2, rng.chance(0.75));
  const styleFor = () => (L >= 4 && rng.chance(0.4) ? 'solo-si' : 'si');
  if (L <= 3) {
    const form = rng.pick(['MP', 'MT', 'AC', 'DA', L >= 3 ? 'SD' : 'MP']);
    switch (form) {
      case 'MP': return { premises: [{ f: IMP(p, q), style: styleFor() }, { f: p, style: '' }], conclusion: q, form, nAtoms: 2 };
      case 'MT': return { premises: [{ f: IMP(p, q), style: styleFor() }, { f: neg(q), style: '' }], conclusion: neg(p), form, nAtoms: 2 };
      case 'AC': return { premises: [{ f: IMP(p, q), style: styleFor() }, { f: q, style: '' }], conclusion: p, form, nAtoms: 2 };
      case 'DA': return { premises: [{ f: IMP(p, q), style: styleFor() }, { f: neg(p), style: '' }], conclusion: neg(q), form, nAtoms: 2 };
      default: return { premises: [{ f: OR(p, q), style: '' }, { f: neg(p), style: '' }], conclusion: q, form: 'SD', nAtoms: 2 };
    }
  }
  if (L <= 7) {
    const form = rng.pick(['cadena-MP', 'cadena-MT', 'cadena-AC', 'cadena-DA', 'SD', 'nand']);
    switch (form) {
      case 'cadena-MP': return { premises: [{ f: IMP(p, q), style: styleFor() }, { f: IMP(q, r), style: styleFor() }, { f: p, style: '' }], conclusion: r, form, nAtoms: 3 };
      case 'cadena-MT': return { premises: [{ f: IMP(p, q), style: styleFor() }, { f: IMP(q, r), style: styleFor() }, { f: neg(r), style: '' }], conclusion: neg(p), form, nAtoms: 3 };
      case 'cadena-AC': return { premises: [{ f: IMP(p, q), style: styleFor() }, { f: IMP(q, r), style: styleFor() }, { f: r, style: '' }], conclusion: p, form, nAtoms: 3 };
      case 'cadena-DA': return { premises: [{ f: IMP(p, q), style: styleFor() }, { f: IMP(q, r), style: styleFor() }, { f: neg(p), style: '' }], conclusion: neg(r), form, nAtoms: 3 };
      case 'SD': return { premises: [{ f: OR(p, q), style: '' }, { f: IMP(q, r), style: styleFor() }, { f: neg(r), style: '' }], conclusion: p, form, nAtoms: 3 };
      default: return { premises: [{ f: NOT(AND(p, q)), style: '' }, { f: p, style: '' }], conclusion: neg(q), form, nAtoms: 2 };
    }
  }
  // niveles 8–10: tres o cuatro premisas con «a menos que» y conclusiones válidas o inválidas
  const s = litOf(3, rng.chance(0.75));
  const prem = [
    { f: IMP(NOT(A(0)), q), style: 'a-menos-que' }, // q, a menos que A0
    { f: IMP(q, r), style: styleFor() },
    { f: OR(neg(r), s), style: '' },
    { f: NOT(A(0)), style: '' },
  ];
  const valid = rng.chance(0.5);
  const conclusion = valid ? s : rng.pick([neg(s), A(0), neg(q)]);
  return { premises: prem, conclusion, form: valid ? 'cadena-larga-valida' : 'cadena-larga-invalida', nAtoms: 4 };
}

const FALLACY_TAG: Record<string, string> = {
  AC: 'afirmar-consecuente', DA: 'negar-antecedente', 'cadena-AC': 'afirmar-consecuente', 'cadena-DA': 'negar-antecedente',
};

function makeLogicItem(rng: Rng, level: number, variant: Variant, focus?: string): Item {
  const L = lvl(level);
  const atoms = rng.pick(ATOM_SETS);
  const ph = makePhraser(atoms);
  for (let attempt = 0; attempt < 100; attempt++) {
    const prob = buildProblem(rng, variant === 'novel' ? Math.max(L, 4) : L);
    if (focus && attempt < 30 && !prob.form.includes(focus)) continue;
    const formulas = prob.premises.map((x) => x.f);
    if (!satisfiable(formulas, prob.nAtoms)) continue;
    const lines = prob.premises.map((x) => ph.sentence(x.f, x.style));
    if (variant === 'novel') {
      // Elegir la única conclusión que se sigue entre cuatro literales
      const lits: Formula[] = [];
      for (let i = 0; i < prob.nAtoms; i++) lits.push(A(i), NOT(A(i)));
      const entailed = lits.filter((l) => entails(formulas, l, prob.nAtoms) && !formulas.some((f) => JSON.stringify(f) === JSON.stringify(l)));
      const notEntailed = lits.filter((l) => !entails(formulas, l, prob.nAtoms));
      if (entailed.length === 0 || notEntailed.length < 3) continue;
      const correct = rng.pick(entailed);
      const opts = rng.shuffle([correct, ...rng.sample(notEntailed, 3)]);
      const options: ChoiceOption[] = opts.map((o) => ({ label: ph.sentence(o).replace(/\.$/, ''), errorTag: o === correct ? undefined : 'conclusion-no-necesaria' }));
      return {
        signature: `logic-novel:${lines.join('|')}:${JSON.stringify(correct)}`,
        taskId: 'E-logic', level, variant, seed: rng.seed,
        prompt: '¿Qué conclusión se sigue necesariamente de las afirmaciones?',
        lines,
        response: { type: 'choice', options, correctIndex: opts.indexOf(correct) },
        explanation: [`Se sigue necesariamente: «${ph.sentence(correct)}».`, 'Las demás opciones pueden ser falsas aunque todas las afirmaciones sean verdaderas.', 'Busca un contraejemplo: un caso que cumpla las premisas y no la conclusión.'],
        focusKey: prob.form, demand: 'razonamiento',
        meta: { formulas, conclusion: correct, nAtoms: prob.nAtoms, valid: true, novel: true, options: opts },
      };
    }
    const valid = entails(formulas, prob.conclusion, prob.nAtoms);
    const options: ChoiceOption[] = [
      { label: 'Sí, se sigue necesariamente', errorTag: valid ? undefined : FALLACY_TAG[prob.form] ?? 'aceptar-invalida' },
      { label: 'No necesariamente', errorTag: valid ? 'rechazar-valida' : undefined },
    ];
    const explanation = valid
      ? ['La conclusión es válida: en todos los casos en que las premisas son verdaderas, también lo es la conclusión.', prob.form.startsWith('cadena') ? 'Encadena los condicionales paso a paso.' : `Forma lógica: ${prob.form === 'MP' ? 'modus ponens' : prob.form === 'MT' ? 'modus tollens (si la consecuencia no ocurre, la condición tampoco)' : prob.form === 'SD' ? 'silogismo disyuntivo' : 'deducción encadenada'}.`]
      : ['La conclusión no se sigue: existe un caso en el que todas las premisas son verdaderas y la conclusión falsa.', FALLACY_TAG[prob.form] === 'afirmar-consecuente' ? 'Es la falacia de afirmar el consecuente: que ocurra el resultado no prueba la condición.' : FALLACY_TAG[prob.form] === 'negar-antecedente' ? 'Es la falacia de negar el antecedente: que no se dé la condición no impide el resultado.' : 'Busca un contraejemplo concreto.'];
    explanation.push('Recuerda: «A solo si B» equivale a «si A, entonces B».');
    return {
      signature: `logic:${lines.join('|')}:${JSON.stringify(prob.conclusion)}`,
      taskId: 'E-logic', level, variant, seed: rng.seed,
      prompt: `Conclusión: «${ph.sentence(prob.conclusion)}» ¿Se sigue necesariamente?`,
      lines,
      response: { type: 'choice', options, correctIndex: valid ? 0 : 1 },
      explanation,
      focusKey: prob.form, demand: 'razonamiento',
      meta: { formulas, conclusion: prob.conclusion, nAtoms: prob.nAtoms, valid },
    };
  }
  throw new Error('No se pudo generar un ítem lógico');
}

export const logicTask: ItemTask = {
  kind: 'item',
  id: 'E-logic',
  module: 'E',
  name: 'Inferencia lógica',
  short: 'Lógica',
  objective: 'Distinguir conclusiones necesarias de conclusiones solo plausibles; detectar falacias formales.',
  instructions: ['Supón que todas las afirmaciones son verdaderas, aunque parezcan extrañas.', 'Decide si la conclusión se sigue necesariamente.', 'Ignora lo que sabes del mundo: solo cuenta la forma del argumento.'],
  strategies: [
    { id: 'contraejemplo', label: 'Busqué un contraejemplo' },
    { id: 'forma', label: 'Reconocí la forma lógica' },
    { id: 'cadena', label: 'Encadené paso a paso' },
    { id: 'intuicion', label: 'Intuición' },
  ],
  errorAdvice: {
    'afirmar-consecuente': { meaning: 'Aceptaste «si A entonces B; B; luego A».', better: 'El resultado puede deberse a otras causas: busca un caso con B y sin A.' },
    'negar-antecedente': { meaning: 'Aceptaste «si A entonces B; no A; luego no B».', better: 'Que no se dé la condición no impide que B ocurra por otra vía.' },
    'aceptar-invalida': { meaning: 'Aceptaste una conclusión que no se sigue.', better: 'Intenta construir un caso que cumpla las premisas y no la conclusión.' },
    'rechazar-valida': { meaning: 'Rechazaste una conclusión válida.', better: 'Comprueba si existe de verdad un contraejemplo; si no existe, la conclusión es necesaria.' },
    'conclusion-no-necesaria': { meaning: 'Elegiste una conclusión que no es necesaria.', better: 'Comprueba cada opción buscando un contraejemplo.' },
  },
  transferHint: 'Distinguir correlación de condición necesaria evita errores al interpretar argumentos, contratos o normas.',
  minLevel: 1,
  maxLevel: 10,
  hasNovel: true,
  novelDescription: 'Elegir la única conclusión necesaria entre varias opciones.',
  blockSeconds: 150,
  itemsPerBlock: 6,
  expectedSeconds: (level) => 15 + level * 4,
  generate: makeLogicItem,
  validate(item) {
    const errs = baseValidate(item);
    const m = item.meta as { formulas: Formula[]; conclusion: Formula; nAtoms: number; valid: boolean; novel?: boolean; options?: Formula[] };
    if (!satisfiable(m.formulas, m.nAtoms)) errs.push('premisas contradictorias');
    if (entails(m.formulas, m.conclusion, m.nAtoms) !== m.valid) errs.push('validez mal calculada');
    if (m.novel && m.options) {
      const n = m.options.filter((o) => entails(m.formulas, o, m.nAtoms)).length;
      if (n !== 1) errs.push(`${n} opciones necesarias`);
    }
    return errs;
  },
};

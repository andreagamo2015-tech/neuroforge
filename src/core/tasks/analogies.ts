import type { Rng } from '../rng';
import type { ChoiceOption, Item, ItemTask, Variant } from '../types';
import { LETTERS, baseValidate, lvl } from './common';

// Analogías relacionales sobre cadenas: A → B como C → ?
// La relación es una composición de transformaciones. El validador enumera todas las
// composiciones de la misma profundidad que convierten A en B y exige que todas den
// la misma respuesta para C (sin ambigüedad).

type Seq = number[];
interface Transform { id: string; label: string; apply(s: Seq): Seq }

export const TRANSFORMS: Transform[] = [
  { id: 'sucesor-ultimo', label: 'el último elemento avanza una posición', apply: (s) => [...s.slice(0, -1), s[s.length - 1] + 1] },
  { id: 'sucesor-todos', label: 'todos los elementos avanzan una posición', apply: (s) => s.map((x) => x + 1) },
  { id: 'antecesor-todos', label: 'todos los elementos retroceden una posición', apply: (s) => s.map((x) => x - 1) },
  { id: 'avanza-dos', label: 'todos los elementos avanzan dos posiciones', apply: (s) => s.map((x) => x + 2) },
  { id: 'invertir', label: 'se invierte el orden', apply: (s) => s.slice().reverse() },
  { id: 'duplicar-ultimo', label: 'se repite el último elemento al final', apply: (s) => [...s, s[s.length - 1]] },
  { id: 'quitar-primero', label: 'se elimina el primer elemento', apply: (s) => s.slice(1) },
  { id: 'intercambiar-extremos', label: 'se intercambian el primero y el último', apply: (s) => (s.length < 2 ? s : [s[s.length - 1], ...s.slice(1, -1), s[0]]) },
];

function composeApply(ids: string[], s: Seq): Seq {
  return ids.reduce((acc, id) => TRANSFORMS.find((t) => t.id === id)!.apply(acc), s);
}

function allCompositions(depth: number): string[][] {
  if (depth === 0) return [[]];
  const shorter = allCompositions(depth - 1);
  return shorter.flatMap((c) => TRANSFORMS.map((t) => [...c, t.id]));
}

const key = (s: Seq) => s.join(',');

interface Alphabet { size: number; render(s: Seq): string; name: string }
const LETTER_ALPHA: Alphabet = { size: 26, name: 'letras', render: (s) => s.map((i) => LETTERS[i]).join('') };
const NUMBER_ALPHA: Alphabet = { size: 30, name: 'números', render: (s) => s.map((i) => String(i + 1)).join(' ') };

function inRange(s: Seq, size: number) {
  return s.length > 0 && s.every((x) => x >= 0 && x < size);
}

/** Respuestas posibles para target según las composiciones (≤ depth) que llevan de src a dst. */
export function analogyAnswers(src: Seq, dst: Seq, target: Seq, depth: number): Set<string> {
  const out = new Set<string>();
  for (let d = 1; d <= depth; d++) {
    for (const comp of allCompositions(d)) {
      if (key(composeApply(comp, src)) === key(dst)) out.add(key(composeApply(comp, target)));
    }
  }
  return out;
}

function makeString(rng: Rng, len: number, size: number, consecutive: boolean): Seq {
  if (consecutive) {
    const start = rng.int(3, size - len - 4);
    return Array.from({ length: len }, (_, i) => start + i);
  }
  return Array.from({ length: len }, () => rng.int(3, size - 4));
}

function makeAnalogyItem(rng: Rng, level: number, variant: Variant, focus?: string): Item {
  const L = lvl(level);
  const depth = L <= 3 ? 1 : L <= 7 ? 2 : 3;
  const len = L <= 3 ? 3 : L <= 6 ? 4 : 5;
  const alpha = variant === 'novel' ? NUMBER_ALPHA : LETTER_ALPHA;
  for (let attempt = 0; attempt < 200; attempt++) {
    const comp = Array.from({ length: depth }, () => rng.pick(TRANSFORMS).id);
    if (focus && TRANSFORMS.some((t) => t.id === focus) && attempt < 100) comp[0] = focus;
    const consecutive = L <= 5;
    const src = makeString(rng, len, alpha.size, consecutive);
    const target = makeString(rng, len, alpha.size, consecutive);
    const dst = composeApply(comp, src);
    const ans = composeApply(comp, target);
    if (!inRange(dst, alpha.size) || !inRange(ans, alpha.size)) continue;
    if (key(src) === key(dst) || key(src) === key(target)) continue;
    // la composición no debe poder expresarse con menos pasos (para que el nivel sea real)
    if (depth > 1 && analogyAnswers(src, dst, target, depth - 1).size > 0) continue;
    const answers = analogyAnswers(src, dst, target, depth);
    if (answers.size !== 1) continue;
    // distractores: aplicación parcial, copia literal, otras transformaciones
    const cands: { s: Seq; tag: string }[] = [];
    if (depth > 1) cands.push({ s: composeApply(comp.slice(0, -1), target), tag: 'transformacion-parcial' });
    cands.push({ s: dst, tag: 'copia-literal' });
    rng.shuffle(TRANSFORMS).forEach((t) => cands.push({ s: t.apply(target), tag: 'regla-incorrecta' }));
    if (depth > 1) cands.push({ s: composeApply(comp.slice(1), target), tag: 'transformacion-parcial' });
    const seen = new Set([key(ans)]);
    const distractors: { s: Seq; tag: string }[] = [];
    for (const c of cands) {
      if (distractors.length >= 3) break;
      if (!inRange(c.s, alpha.size) || seen.has(key(c.s))) continue;
      seen.add(key(c.s));
      distractors.push(c);
    }
    if (distractors.length < 3) continue;
    const all = rng.shuffle([{ s: ans, tag: undefined as string | undefined }, ...distractors]);
    const options: ChoiceOption[] = all.map((o) => ({ label: alpha.render(o.s), errorTag: o.tag }));
    const correctIndex = all.findIndex((o) => key(o.s) === key(ans));
    const labels = comp.map((id) => TRANSFORMS.find((t) => t.id === id)!.label);
    return {
      signature: `analogy:${variant}:${key(src)}>${key(dst)}::${key(target)}`,
      taskId: 'A-analogies',
      level,
      variant,
      seed: rng.seed,
      prompt: `Si ${alpha.render(src)} se convierte en ${alpha.render(dst)}, ¿en qué se convierte ${alpha.render(target)}?`,
      figure: { type: 'symbols', text: `${alpha.render(src)}  →  ${alpha.render(dst)}\n${alpha.render(target)}  →  ?` },
      response: { type: 'choice', options, correctIndex },
      explanation: [
        `La relación consta de ${depth} paso${depth > 1 ? 's' : ''}: ${labels.join('; después, ')}.`,
        `Aplicada a ${alpha.render(target)} da ${alpha.render(ans)}.`,
        'Comprueba siempre que la regla que propones reproduce exactamente el ejemplo A → B.',
      ],
      focusKey: comp[0],
      demand: 'razonamiento',
      meta: { src, dst, target, comp, depth, alphabet: alpha.name },
    };
  }
  throw new Error('No se pudo generar una analogía válida');
}

export const analogiesTask: ItemTask = {
  kind: 'item',
  id: 'A-analogies',
  module: 'A',
  name: 'Analogías relacionales',
  short: 'Analogías',
  objective: 'Abstraer una relación entre dos elementos y aplicarla a un contexto distinto.',
  instructions: [
    'Se muestra un ejemplo: una cadena se transforma en otra.',
    'Descubre la transformación (puede tener varios pasos) y aplícala a la nueva cadena.',
    'El alfabeto no da la vuelta: después de la Z no hay más letras.',
  ],
  strategies: [
    { id: 'comparar-posiciones', label: 'Comparé posición a posición' },
    { id: 'describir-regla', label: 'Describí la regla con palabras' },
    { id: 'probar-opciones', label: 'Probé cada opción' },
    { id: 'intuicion', label: 'Intuición' },
  ],
  errorAdvice: {
    'transformacion-parcial': { meaning: 'Aplicaste solo una parte de la transformación.', better: 'Comprueba que tu regla reproduce exactamente el ejemplo completo antes de aplicarla.' },
    'copia-literal': { meaning: 'Copiaste el resultado del ejemplo en lugar de la relación.', better: 'Separa «qué cambia» de «sobre qué se aplica».' },
    'regla-incorrecta': { meaning: 'Aplicaste una transformación distinta a la del ejemplo.', better: 'Compara longitud, orden y valores entre A y B por separado.' },
  },
  transferHint: 'Abstraer relaciones (no objetos) es la base para aplicar una solución conocida a un problema nuevo.',
  minLevel: 1,
  maxLevel: 10,
  hasNovel: true,
  novelDescription: 'Las mismas relaciones aplicadas a listas de números.',
  blockSeconds: 150,
  itemsPerBlock: 6,
  expectedSeconds: (level) => 15 + level * 4,
  generate: makeAnalogyItem,
  validate(item) {
    const errs = baseValidate(item);
    const m = item.meta as { src: Seq; dst: Seq; target: Seq; comp: string[]; depth: number };
    const answers = analogyAnswers(m.src, m.dst, m.target, m.depth);
    if (answers.size !== 1) errs.push(`ambigua: ${answers.size} respuestas posibles`);
    if (item.response.type === 'choice') {
      const correct = composeApply(m.comp, m.target);
      if (!answers.has(key(correct))) errs.push('la respuesta no es la predicha por la regla');
    }
    return errs;
  },
};

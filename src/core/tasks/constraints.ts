import type { Rng } from '../rng';
import type { ChoiceOption, Item, ItemTask, Variant } from '../types';
import { NAMES, baseValidate, lvl, ordinal, permutations } from './common';

// Problemas de restricciones: asignar personas a posiciones en fila.
// Se añaden pistas verdaderas hasta que la solución es única y luego se eliminan las redundantes.

type ClueType = 'at' | 'notAt' | 'leftOf' | 'immLeft' | 'adjacent' | 'notAdjacent' | 'end';
export interface Clue { type: ClueType; x: number; y?: number; p?: number }

export function satisfies(perm: number[], c: Clue): boolean {
  // perm[pos] = persona
  const pos = (who: number) => perm.indexOf(who);
  const px = pos(c.x);
  const py = c.y !== undefined ? pos(c.y) : -1;
  switch (c.type) {
    case 'at': return px === c.p;
    case 'notAt': return px !== c.p;
    case 'leftOf': return px < py;
    case 'immLeft': return py - px === 1;
    case 'adjacent': return Math.abs(px - py) === 1;
    case 'notAdjacent': return Math.abs(px - py) !== 1;
    case 'end': return px === 0 || px === perm.length - 1;
  }
}

export function solutions(n: number, clues: Clue[]): number[][] {
  return permutations([...Array(n).keys()]).filter((p) => clues.every((c) => satisfies(p, c)));
}

function clueText(c: Clue, names: string[]): string {
  const X = names[c.x];
  const Y = c.y !== undefined ? names[c.y] : '';
  switch (c.type) {
    case 'at': return `${X} está en la silla ${c.p! + 1}.`;
    case 'notAt': return `${X} no está en la silla ${c.p! + 1}.`;
    case 'leftOf': return `${X} está en algún lugar a la izquierda de ${Y}.`;
    case 'immLeft': return `${X} está justo a la izquierda de ${Y}.`;
    case 'adjacent': return `${X} y ${Y} están sentados juntos.`;
    case 'notAdjacent': return `${X} y ${Y} no están sentados juntos.`;
    case 'end': return `${X} está en uno de los extremos.`;
  }
}

function allTrueClues(sol: number[], types: ClueType[]): Clue[] {
  const n = sol.length;
  const out: Clue[] = [];
  for (let x = 0; x < n; x++) {
    for (let p = 0; p < n; p++) {
      if (types.includes('at')) out.push({ type: 'at', x, p });
      if (types.includes('notAt')) out.push({ type: 'notAt', x, p });
    }
    if (types.includes('end')) out.push({ type: 'end', x });
    for (let y = 0; y < n; y++) {
      if (x === y) continue;
      for (const t of ['leftOf', 'immLeft', 'adjacent', 'notAdjacent'] as ClueType[]) {
        if (types.includes(t) && !(t === 'adjacent' || t === 'notAdjacent') || (types.includes(t) && x < y)) out.push({ type: t, x, y });
      }
    }
  }
  return out.filter((c) => satisfies(sol, c));
}

function makeConstraintItem(rng: Rng, level: number, variant: Variant): Item {
  const L = lvl(level);
  const n = L <= 3 ? 3 : L <= 7 ? 4 : 5;
  const types: ClueType[] = L <= 3 ? ['at', 'leftOf', 'immLeft', 'notAt'] : L <= 6 ? ['notAt', 'leftOf', 'immLeft', 'adjacent', 'end'] : ['notAt', 'leftOf', 'adjacent', 'notAdjacent', 'end', 'immLeft'];
  const names = rng.sample(NAMES, n);
  const sol = rng.shuffle([...Array(n).keys()]);
  let clues: Clue[] = [];
  const pool = rng.shuffle(allTrueClues(sol, types));
  for (const c of pool) {
    clues.push(c);
    if (solutions(n, clues).length === 1) break;
  }
  for (const c of clues.slice()) {
    const rest = clues.filter((d) => d !== c);
    if (solutions(n, rest).length === 1) clues = rest;
  }
  clues = rng.shuffle(clues);
  const askPos = rng.int(0, n - 1);
  const answer = sol[askPos];
  const optOrder = rng.shuffle([...Array(n).keys()]);
  const options: ChoiceOption[] = optOrder.map((i) => {
    if (i === answer) return { label: names[i] };
    // ¿existe una disposición que viole solo una pista con esta persona en la posición?
    const nearMiss = permutations([...Array(n).keys()]).some((p) => p[askPos] === i && clues.filter((c) => !satisfies(p, c)).length === 1);
    return { label: names[i], errorTag: nearMiss ? 'restriccion-omitida' : 'razonamiento-incompleto' };
  });
  return {
    signature: `constraint:${names.join(',')}:${clues.map((c) => JSON.stringify(c)).join('|')}:${askPos}`,
    taskId: 'A-constraints',
    level,
    variant,
    seed: rng.seed,
    prompt: `¿Quién ocupa la silla ${askPos + 1}?`,
    lines: [`${n} personas (${names.join(', ')}) se sientan en ${n} sillas numeradas de izquierda (1) a derecha (${n}).`, ...clues.map((c) => clueText(c, names))],
    response: { type: 'choice', options, correctIndex: optOrder.indexOf(answer) },
    explanation: [
      'Empieza por las pistas más restrictivas: posiciones fijas, extremos y «justo a la izquierda».',
      'Después elimina las disposiciones que violan las pistas negativas.',
      `Única disposición compatible: ${sol.map((p, i) => `${i + 1}. ${names[p]}`).join(' · ')}.`,
      `La ${ordinal(askPos)} silla la ocupa ${names[answer]}.`,
    ],
    focusKey: types.includes('notAdjacent') ? 'pistas-negativas' : 'pistas-posicionales',
    demand: 'razonamiento',
    meta: { n, clues, askPos, answer, sol },
  };
}

export const constraintsTask: ItemTask = {
  kind: 'item',
  id: 'A-constraints',
  module: 'A',
  name: 'Problemas de restricciones',
  short: 'Restricciones',
  objective: 'Mantener y combinar varias restricciones hasta encontrar la única solución compatible.',
  instructions: [
    'Lee todas las pistas: todas son verdaderas y juntas determinan una única disposición.',
    'Responde quién ocupa la silla indicada.',
    'Puedes anotar en papel si lo necesitas: lo importante es razonar, no memorizar.',
  ],
  strategies: [
    { id: 'restrictivas-primero', label: 'Empecé por las pistas más restrictivas' },
    { id: 'tabla', label: 'Hice una tabla / esquema' },
    { id: 'probar-casos', label: 'Probé casos y descarté' },
    { id: 'intuicion', label: 'Intuición' },
  ],
  errorAdvice: {
    'restriccion-omitida': { meaning: 'Tu respuesta cumple todas las pistas menos una.', better: 'Al final, repasa cada pista una por una contra tu solución.' },
    'razonamiento-incompleto': { meaning: 'La respuesta incumple varias pistas.', better: 'Construye la disposición completa antes de responder, no solo la posición preguntada.' },
  },
  transferHint: 'Planificar horarios, repartir tareas o distribuir espacios son problemas de restricciones.',
  minLevel: 1,
  maxLevel: 10,
  hasNovel: false,
  blockSeconds: 210,
  itemsPerBlock: 4,
  expectedSeconds: (level) => 30 + level * 8,
  generate: makeConstraintItem,
  validate(item) {
    const errs = baseValidate(item);
    const m = item.meta as { n: number; clues: Clue[]; askPos: number; answer: number; sol: number[] };
    const sols = solutions(m.n, m.clues);
    if (sols.length !== 1) errs.push(`${sols.length} soluciones compatibles`);
    else if (sols[0][m.askPos] !== m.answer) errs.push('la respuesta no coincide con la solución');
    return errs;
  },
};

import type { Rng } from '../rng';
import type { CellSpec, ChoiceOption, ColorName, Item, ItemTask, ShapeName, SizeName, Variant } from '../types';
import { baseValidate, lvl } from './common';

// Matrices abstractas 3×3 con reglas por atributo.
// Las opciones se generan por "bisección de atributos" (estilo I-RAVEN): con k atributos
// alterados se obtienen 2^k opciones en las que cada valor aparece la mitad de las veces,
// de modo que no se puede acertar eligiendo la opción "más frecuente" sin mirar la matriz.

export const SHAPES: ShapeName[] = ['círculo', 'cuadrado', 'triángulo', 'rombo', 'hexágono'];
export const COLORS: ColorName[] = ['cian', 'violeta', 'ámbar'];
export const SIZES: SizeName[] = ['pequeño', 'mediano', 'grande'];
export const COUNTS = [1, 2, 3, 4];

type Attr = 'shape' | 'count' | 'color' | 'size';
const ATTRS: Attr[] = ['shape', 'count', 'color', 'size'];
const DOMAIN: Record<Attr, number> = { shape: SHAPES.length, count: COUNTS.length, color: COLORS.length, size: SIZES.length };
export const ATTR_LABEL: Record<Attr, string> = { shape: 'forma', count: 'número', color: 'color', size: 'tamaño' };
const ORDERED: Record<Attr, boolean> = { shape: false, count: true, color: false, size: true };

type RuleKind = 'global' | 'const' | 'prog' | 'dist';
type Grid = number[][]; // [fila][columna] índices de dominio

function buildGrid(rng: Rng, attr: Attr, rule: RuleKind): Grid {
  const D = DOMAIN[attr];
  if (rule === 'global') {
    const v = rng.int(0, D - 1);
    return [0, 1, 2].map(() => [v, v, v]);
  }
  if (rule === 'const') {
    const vals = rng.sample([...Array(D).keys()], 3);
    return vals.map((v) => [v, v, v]);
  }
  if (rule === 'prog') {
    const dir = rng.chance(0.5) ? 1 : -1;
    return [0, 1, 2].map(() => {
      const s = rng.int(0, D - 3);
      const row = [s, s + 1, s + 2];
      return dir === 1 ? row : row.reverse();
    });
  }
  // dist: cuadrado latino cíclico con tres valores distintos
  const vals = rng.sample([...Array(D).keys()], 3);
  const shift = rng.chance(0.5) ? 1 : 2;
  return [0, 1, 2].map((r) => [0, 1, 2].map((c) => vals[(c + r * shift) % 3]));
}

const transpose = (g: Grid): Grid => [0, 1, 2].map((r) => [0, 1, 2].map((c) => g[c][r]));

/**
 * Valores posibles para la celda (2,2) según todas las reglas (por filas y por columnas)
 * que encajan con las 8 celdas conocidas. Un ítem es válido si el conjunto es unitario.
 */
export function predictMissing(g: Grid, D: number): Set<number> {
  const out = new Set<number>();
  for (const grid of [g, transpose(g)]) {
    const known = (r: number, c: number) => !(r === 2 && c === 2) ? grid[r][c] : NaN;
    // constante por fila
    if ([0, 1].every((r) => grid[r][0] === grid[r][1] && grid[r][1] === grid[r][2]) && known(2, 0) === known(2, 1)) out.add(grid[2][0]);
    // progresión con paso común no nulo
    const step = grid[0][1] - grid[0][0];
    if (step !== 0 && [0, 1].every((r) => grid[r][1] - grid[r][0] === step && grid[r][2] - grid[r][1] === step) && grid[2][1] - grid[2][0] === step) {
      const v = grid[2][1] + step;
      if (v >= 0 && v < D) out.add(v);
    }
    // distribución de tres valores
    const s0 = new Set(grid[0]);
    const s1 = new Set(grid[1]);
    if (s0.size === 3 && s1.size === 3 && [...s0].every((v) => s1.has(v)) && s0.has(grid[2][0]) && s0.has(grid[2][1]) && grid[2][0] !== grid[2][1]) {
      out.add([...s0].find((v) => v !== grid[2][0] && v !== grid[2][1])!);
    }
  }
  return out;
}

function toCell(vals: Record<Attr, number>): CellSpec {
  return { shape: SHAPES[vals.shape], count: COUNTS[vals.count], color: COLORS[vals.color], size: SIZES[vals.size] };
}

export function describeCell(c: CellSpec): string {
  const plural = c.count > 1;
  const shapePl: Record<ShapeName, string> = { círculo: 'círculos', cuadrado: 'cuadrados', triángulo: 'triángulos', rombo: 'rombos', hexágono: 'hexágonos', estrella: 'estrellas' };
  const sizePl: Record<SizeName, string> = { pequeño: 'pequeños', mediano: 'medianos', grande: 'grandes' };
  return `${c.count} ${plural ? shapePl[c.shape] : c.shape} ${c.color} ${plural ? sizePl[c.size] : c.size}`;
}

interface LevelCfg { varying: number; rules: RuleKind[]; minDist: number; k: number }
function levelCfg(L: number): LevelCfg {
  const table: LevelCfg[] = [
    { varying: 1, rules: ['const', 'prog'], minDist: 0, k: 2 },
    { varying: 1, rules: ['const', 'prog', 'dist'], minDist: 0, k: 2 },
    { varying: 2, rules: ['const', 'prog'], minDist: 0, k: 2 },
    { varying: 2, rules: ['const', 'prog', 'dist'], minDist: 0, k: 2 },
    { varying: 2, rules: ['const', 'prog', 'dist'], minDist: 1, k: 3 },
    { varying: 3, rules: ['const', 'prog', 'dist'], minDist: 0, k: 3 },
    { varying: 3, rules: ['const', 'prog', 'dist'], minDist: 1, k: 3 },
    { varying: 4, rules: ['const', 'prog', 'dist'], minDist: 1, k: 3 },
    { varying: 4, rules: ['const', 'prog', 'dist'], minDist: 2, k: 3 },
    { varying: 4, rules: ['prog', 'dist'], minDist: 2, k: 3 },
  ];
  return table[L - 1];
}

const RULE_TEXT: Record<RuleKind, string> = {
  global: 'es igual en toda la matriz',
  const: 'es constante dentro de cada %LINEA% y cambia entre %LINEAS%',
  prog: 'avanza un paso de una celda a la siguiente en cada %LINEA%',
  dist: 'cada %LINEA% contiene los mismos tres valores en distinto orden',
};

function makeMatrixItem(rng: Rng, level: number, variant: Variant, focus?: string): Item {
  const L = lvl(level);
  const cfg = levelCfg(L);
  const byColumns = variant === 'novel';
  let varying = rng.sample(ATTRS, cfg.varying);
  if (focus && ATTRS.includes(focus as Attr) && !varying.includes(focus as Attr)) varying = [focus as Attr, ...varying.slice(0, cfg.varying - 1)];
  const rules: Record<Attr, RuleKind> = { shape: 'global', count: 'global', color: 'global', size: 'global' };
  varying.forEach((a) => {
    let allowed = cfg.rules.filter((r) => r !== 'prog' || ORDERED[a]);
    if (!allowed.length) allowed = ['dist'];
    rules[a] = rng.pick(allowed);
  });
  if (focus && rules[focus as Attr] !== undefined && varying.includes(focus as Attr)) rules[focus as Attr] = 'dist';
  // garantizar el mínimo de reglas de distribución
  let distCount = varying.filter((a) => rules[a] === 'dist').length;
  for (const a of varying) {
    if (distCount >= cfg.minDist) break;
    if (rules[a] !== 'dist') { rules[a] = 'dist'; distCount++; }
  }
  const grids = {} as Record<Attr, Grid>;
  ATTRS.forEach((a) => {
    const g = buildGrid(rng, a, rules[a]);
    grids[a] = byColumns ? transpose(g) : g;
  });
  const valsAt = (r: number, c: number) => Object.fromEntries(ATTRS.map((a) => [a, grids[a][r][c]])) as Record<Attr, number>;
  const cells: (CellSpec | null)[] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cells.push(r === 2 && c === 2 ? null : toCell(valsAt(r, c)));
  const answerVals = valsAt(2, 2);

  // Bisección: k atributos alterados (preferentemente los que varían)
  const bisect = [...rng.shuffle(varying), ...rng.shuffle(ATTRS.filter((a) => !varying.includes(a)))].slice(0, cfg.k);
  const alt: Record<string, number> = {};
  bisect.forEach((a) => {
    const seen = new Set<number>();
    grids[a].flat().forEach((v, i) => { if (i !== 8 && v !== answerVals[a]) seen.add(v); });
    const pool = seen.size ? [...seen] : [...Array(DOMAIN[a]).keys()].filter((v) => v !== answerVals[a]);
    alt[a] = rng.pick(pool);
  });
  const options: ChoiceOption[] = [];
  let correctIndex = 0;
  const combos = rng.shuffle([...Array(2 ** cfg.k).keys()]);
  combos.forEach((mask, idx) => {
    const vals = { ...answerVals };
    const changed: Attr[] = [];
    bisect.forEach((a, bit) => {
      if (mask & (1 << bit)) { vals[a] = alt[a]; changed.push(a); }
    });
    if (mask === 0) correctIndex = idx;
    const cell = toCell(vals);
    options.push({
      label: describeCell(cell),
      figure: { type: 'cell', cell },
      errorTag: changed.length === 0 ? undefined : changed.length === 1 ? `atributo-${changed[0]}` : 'varios-atributos',
    });
  });

  const linea = byColumns ? 'columna' : 'fila';
  const lineas = byColumns ? 'columnas' : 'filas';
  const explanation = ATTRS.filter((a) => rules[a] !== 'global' || bisect.includes(a)).map((a) => {
    const txt = RULE_TEXT[rules[a]].replace('%LINEA%', linea).replace('%LINEAS%', lineas);
    const valueName = a === 'shape' ? SHAPES[answerVals[a]] : a === 'count' ? String(COUNTS[answerVals[a]]) : a === 'color' ? COLORS[answerVals[a]] : SIZES[answerVals[a]];
    return `${ATTR_LABEL[a][0].toUpperCase() + ATTR_LABEL[a].slice(1)}: ${txt}. Para la celda vacía → ${valueName}.`;
  });
  explanation.push(`Respuesta: ${describeCell(toCell(answerVals))}.`);
  explanation.push('Método eficiente: analiza un atributo cada vez y predice la celda antes de mirar las opciones.');

  return {
    signature: `matrix:${variant}:${JSON.stringify(cells)}`,
    taskId: 'A-matrices',
    level,
    variant,
    seed: rng.seed,
    prompt: byColumns ? 'Las reglas se aplican por columnas. ¿Qué figura completa la matriz?' : '¿Qué figura completa la matriz?',
    figure: { type: 'matrix', cells },
    response: { type: 'choice', options, correctIndex },
    explanation,
    focusKey: varying[0],
    demand: 'razonamiento',
    meta: { rules, grids, byColumns, bisect },
  };
}

export const matricesTask: ItemTask = {
  kind: 'item',
  id: 'A-matrices',
  module: 'A',
  name: 'Matrices abstractas',
  short: 'Matrices',
  objective: 'Descubrir varias reglas simultáneas (forma, número, color, tamaño) y combinarlas.',
  instructions: [
    'La matriz tiene 3 filas y 3 columnas; falta la celda inferior derecha.',
    'Cada atributo (forma, número, color, tamaño) sigue su propia regla.',
    'Elige la figura que cumple todas las reglas a la vez. Puedes usar las teclas 1–8.',
  ],
  strategies: [
    { id: 'atributo-a-atributo', label: 'Analicé atributo a atributo' },
    { id: 'prediccion', label: 'Predije la respuesta antes de mirar opciones' },
    { id: 'eliminacion', label: 'Eliminé opciones' },
    { id: 'global', label: 'Impresión global' },
  ],
  errorAdvice: {
    'atributo-shape': { meaning: 'Fallaste la regla de la forma.', better: 'Revisa si cada fila contiene las mismas tres formas en distinto orden.' },
    'atributo-count': { meaning: 'Fallaste la regla del número de elementos.', better: 'Cuenta los elementos de cada celda y compara las tres de la fila.' },
    'atributo-color': { meaning: 'Fallaste la regla del color.', better: 'Comprueba qué colores aparecen en cada fila y cuál falta en la última.' },
    'atributo-size': { meaning: 'Fallaste la regla del tamaño.', better: 'Observa si el tamaño crece, decrece o se distribuye en cada fila.' },
    'varios-atributos': { meaning: 'Fallaste más de una regla a la vez.', better: 'Descompón: un atributo cada vez y anota la predicción de cada uno.' },
  },
  transferHint: 'Descomponer un problema en dimensiones independientes ayuda a diagnosticar fallos en sistemas con varias causas.',
  minLevel: 1,
  maxLevel: 10,
  hasNovel: true,
  novelDescription: 'Reglas aplicadas por columnas en lugar de por filas.',
  blockSeconds: 210,
  itemsPerBlock: 6,
  expectedSeconds: (level) => 20 + level * 6,
  generate: makeMatrixItem,
  validate(item) {
    const errs = baseValidate(item);
    const m = item.meta as { grids: Record<Attr, Grid> };
    if (item.response.type !== 'choice') return [...errs, 'tipo de respuesta incorrecto'];
    const correct = item.response.options[item.response.correctIndex].figure;
    if (!correct || correct.type !== 'cell') return [...errs, 'opción correcta sin figura'];
    for (const a of ATTRS) {
      const preds = predictMissing(m.grids[a], DOMAIN[a]);
      if (preds.size !== 1) errs.push(`atributo ${a}: ${preds.size} predicciones compatibles`);
      const val = m.grids[a][2][2];
      if (!preds.has(val)) errs.push(`atributo ${a}: la regla no predice la respuesta`);
    }
    // Ninguna opción incorrecta puede cumplir todas las reglas
    const answerKey = JSON.stringify(correct.cell);
    const dup = item.response.options.filter((o) => o.figure?.type === 'cell' && JSON.stringify(o.figure.cell) === answerKey).length;
    if (dup !== 1) errs.push('la respuesta correcta aparece más de una vez');
    return errs;
  },
};

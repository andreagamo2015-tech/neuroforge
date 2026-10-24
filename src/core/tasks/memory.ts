import type { Rng } from '../rng';
import type { SeqScore, SeqTrial, SequenceTask, Variant } from '../types';
import { NAMES, ordinal } from './common';
import { consistentOrders, type Premise } from './ordering';

// Tareas de memoria de trabajo con presentación secuencial.
// La puntuación distingue errores de orden, omisiones e intrusiones.

const DIGITS = '123456789'.split('');
const CONSONANTS = 'BCDFGHJKLMNPRSTVXZ'.split('');

function scoreOrdered(answer: string[], response: string[], distractors: string[] = []): SeqScore {
  const partial = answer.filter((a, i) => response[i] === a).length / answer.length;
  const correct = response.length === answer.length && partial === 1;
  if (correct) return { correct, partial };
  let errorTag: string;
  if (response.some((r) => distractors.includes(r) && !answer.includes(r))) errorTag = 'intrusion-distractor';
  else if (response.length < answer.length) errorTag = 'omision';
  else if ([...response].sort().join() === [...answer].sort().join()) errorTag = 'orden';
  else errorTag = 'intrusion';
  return { correct, partial, errorTag };
}

/** Secuencia "sin agrupación fácil": sin repeticiones ni dígitos consecutivos adyacentes. */
function noChunkDigits(rng: Rng, len: number): string[] {
  let out: number[] = [];
  let guard = 0;
  while (out.length < len) {
    if (++guard % 300 === 0) out = []; // reinicio si la construcción voraz se bloquea
    const d = rng.int(1, 9);
    const prev = out[out.length - 1];
    if (out.includes(d) && len <= 9) continue;
    if (prev !== undefined && Math.abs(prev - d) <= 1) continue;
    out.push(d);
  }
  return out.map(String);
}

function chunkableDigits(rng: Rng, len: number): string[] {
  // incluye una carrera ascendente de 3 (p. ej. 4-5-6) que permite agrupar
  const start = rng.int(1, 7);
  const run = [start, start + 1, start + 2];
  const rest = noChunkDigits(rng, Math.max(0, len - 3)).map(Number).filter((d) => !run.includes(d));
  while (rest.length < len - 3) {
    const d = rng.int(1, 9);
    if (!run.includes(d) && !rest.includes(d)) rest.push(d);
  }
  const pos = rng.int(0, rest.length);
  return [...rest.slice(0, pos), ...run, ...rest.slice(pos)].slice(0, len).map(String);
}

export const backwardSpanTask: SequenceTask = {
  kind: 'sequence',
  id: 'B-backward',
  module: 'B',
  name: 'Dígitos en orden inverso',
  short: 'Span inverso',
  objective: 'Mantener y manipular una secuencia (invertirla) en la memoria de trabajo.',
  instructions: ['Verás dígitos uno a uno.', 'Al terminar, escríbelos en ORDEN INVERSO (del último al primero).', 'Algunas secuencias se pueden agrupar y otras no: se registra la diferencia.'],
  strategies: [
    { id: 'agrupacion', label: 'Agrupé en bloques' },
    { id: 'repeticion', label: 'Repetí mentalmente' },
    { id: 'visualizacion', label: 'Visualicé los números' },
    { id: 'ninguna', label: 'Ninguna en particular' },
  ],
  errorAdvice: {
    orden: { meaning: 'Recordaste los dígitos pero no su orden.', better: 'Invierte por bloques pequeños (de 2 o 3) en vez de toda la secuencia a la vez.' },
    'orden-directo': { meaning: 'Escribiste la secuencia en orden directo.', better: 'Recuerda la instrucción: del último al primero.' },
    omision: { meaning: 'Faltaron dígitos.', better: 'Repite en voz baja los últimos dígitos mientras aparecen los nuevos.' },
    intrusion: { meaning: 'Aparecieron dígitos que no estaban.', better: 'Reduce la velocidad de repaso y céntrate en menos elementos a la vez.' },
  },
  transferHint: 'Manipular información en mente es necesario para cálculo mental, seguir instrucciones o reorganizar ideas.',
  minLevel: 1,
  maxLevel: 9,
  hasNovel: true,
  novelDescription: 'Letras en lugar de dígitos.',
  blockSeconds: 150,
  trialsPerBlock: 5,
  generate(rng, level, variant) {
    const len = Math.max(2, Math.round(level) + 1);
    const chunk = rng.chance(0.5) && len >= 4 && len <= 9 && variant === 'train';
    const seq = variant === 'novel' ? rng.sample(CONSONANTS, len) : chunk ? chunkableDigits(rng, len) : noChunkDigits(rng, len);
    const answer = seq.slice().reverse();
    return {
      signature: `back:${seq.join('')}`,
      level,
      variant,
      stimuli: seq.map((text) => ({ text })),
      durationMs: 900,
      isiMs: 250,
      recallPrompt: 'Escribe la secuencia en orden INVERSO',
      recall: { type: 'ordered', answer, alphabet: variant === 'novel' ? CONSONANTS : DIGITS },
      explanation: [`Secuencia: ${seq.join(' ')}`, `En orden inverso: ${answer.join(' ')}`],
      meta: { chunkable: chunk, length: len },
    };
  },
  score(trial, response) {
    const r = response as string[];
    if (trial.recall.type !== 'ordered') throw new Error('tipo');
    const s = scoreOrdered(trial.recall.answer, r);
    const forward = trial.stimuli.map((x) => x.text);
    if (!s.correct && r.join('') === forward.join('')) s.errorTag = 'orden-directo';
    return s;
  },
  validate(trial) {
    const errs: string[] = [];
    if (trial.recall.type !== 'ordered') return ['tipo'];
    if (trial.recall.answer.join() !== trial.stimuli.map((s) => s.text).reverse().join()) errs.push('respuesta no es la inversa');
    return errs;
  },
};

export const updatingTask: SequenceTask = {
  kind: 'sequence',
  id: 'B-updating',
  module: 'B',
  name: 'Actualización continua',
  short: 'Actualización',
  objective: 'Actualizar continuamente el contenido de la memoria descartando lo que deja de ser relevante.',
  instructions: ['Verás una lista de letras de longitud desconocida.', 'Cuando termine, escribe solo las ÚLTIMAS N letras, en orden.', 'Ve actualizando: olvida las letras antiguas a medida que llegan nuevas.'],
  strategies: [
    { id: 'ventana', label: 'Mantuve una «ventana» de N letras' },
    { id: 'todo', label: 'Intenté recordar todo' },
    { id: 'final', label: 'Me concentré solo al final' },
  ],
  errorAdvice: {
    'no-actualizo': { meaning: 'Escribiste las primeras letras en lugar de las últimas.', better: 'Mantén solo N letras: cuando entra una nueva, descarta la más antigua.' },
    orden: { meaning: 'Letras correctas en orden equivocado.', better: 'Repite la ventana en orden cada vez que se actualiza.' },
    omision: { meaning: 'Faltaron letras.', better: 'Repasa la ventana completa con cada letra nueva.' },
    intrusion: { meaning: 'Letras que no estaban entre las últimas.', better: 'Descarta activamente la letra más antigua al entrar una nueva.' },
  },
  transferHint: 'Actualizar información relevante es clave al seguir conversaciones, instrucciones cambiantes o datos en tiempo real.',
  minLevel: 1,
  maxLevel: 8,
  hasNovel: false,
  blockSeconds: 160,
  trialsPerBlock: 5,
  generate(rng, level, variant) {
    const n = Math.max(2, Math.round(level) + 1);
    const extra = rng.int(0, level >= 3 ? 5 : 2);
    const seq: string[] = [];
    while (seq.length < n + extra) {
      const c = rng.pick(CONSONANTS);
      if (seq.slice(-4).includes(c)) continue;
      seq.push(c);
    }
    const answer = seq.slice(-n);
    return {
      signature: `upd:${seq.join('')}:${n}`,
      level,
      variant,
      stimuli: seq.map((text) => ({ text })),
      durationMs: 800,
      isiMs: 300,
      recallPrompt: `Escribe las ÚLTIMAS ${n} letras en orden`,
      recall: { type: 'ordered', answer, alphabet: CONSONANTS },
      explanation: [`Lista completa (${seq.length}): ${seq.join(' ')}`, `Últimas ${n}: ${answer.join(' ')}`],
      meta: { n, length: seq.length },
    };
  },
  score(trial, response) {
    const r = response as string[];
    if (trial.recall.type !== 'ordered') throw new Error('tipo');
    const s = scoreOrdered(trial.recall.answer, r);
    const first = trial.stimuli.slice(0, trial.recall.answer.length).map((x) => x.text);
    if (!s.correct && trial.stimuli.length > trial.recall.answer.length && r.join('') === first.join('')) s.errorTag = 'no-actualizo';
    return s;
  },
  validate(trial) {
    if (trial.recall.type !== 'ordered') return ['tipo'];
    const n = trial.recall.answer.length;
    return trial.recall.answer.join() === trial.stimuli.slice(-n).map((s) => s.text).join() ? [] : ['respuesta incorrecta'];
  },
};

export const filteringTask: SequenceTask = {
  kind: 'sequence',
  id: 'B-filtering',
  module: 'B',
  name: 'Memoria con distractores',
  short: 'Filtrado',
  objective: 'Retener solo la información relevante e ignorar distractores.',
  instructions: ['Verás letras en dos colores: CIAN (recordar) y VIOLETA (ignorar).', 'Las letras violeta van además entre corchetes.', 'Al final, escribe solo las letras cian en el orden en que aparecieron.'],
  strategies: [
    { id: 'ignorar', label: 'Ignoré activamente las violeta' },
    { id: 'repeticion', label: 'Repetí solo las cian' },
    { id: 'todo', label: 'Intenté recordar todo' },
  ],
  errorAdvice: {
    'intrusion-distractor': { meaning: 'Incluiste una letra que había que ignorar.', better: 'Decide en el momento si la letra entra o no; no la repases si es violeta.' },
    orden: { meaning: 'Letras correctas en orden equivocado.', better: 'Repasa las letras cian en orden cada vez que llega una nueva.' },
    omision: { meaning: 'Faltaron letras relevantes.', better: 'Repasa solo las relevantes: así liberas capacidad.' },
    intrusion: { meaning: 'Letras que no aparecieron.', better: 'Reduce el número de elementos que repasas a la vez.' },
  },
  transferHint: 'Filtrar lo irrelevante ayuda a estudiar o trabajar con interrupciones.',
  minLevel: 1,
  maxLevel: 8,
  hasNovel: false,
  blockSeconds: 160,
  trialsPerBlock: 5,
  generate(rng, level, variant) {
    const t = Math.max(2, Math.round(level) + 1);
    const d = Math.round(t * (0.5 + Math.min(0.7, level * 0.08)));
    const letters = rng.sample(CONSONANTS, t + d);
    const roles = rng.shuffle([...Array(t).fill('target'), ...Array(d).fill('distractor')] as ('target' | 'distractor')[]);
    const stimuli = letters.map((text, i) => ({ text, role: roles[i] }));
    const answer = stimuli.filter((s) => s.role === 'target').map((s) => s.text);
    return {
      signature: `filt:${stimuli.map((s) => s.text + (s.role === 'target' ? '+' : '-')).join('')}`,
      level,
      variant,
      stimuli,
      durationMs: 900,
      isiMs: 250,
      recallPrompt: 'Escribe solo las letras CIAN en orden',
      recall: { type: 'ordered', answer, alphabet: CONSONANTS },
      explanation: [`Relevantes (cian): ${answer.join(' ')}`, `Ignorar (violeta): ${stimuli.filter((s) => s.role === 'distractor').map((s) => s.text).join(' ')}`],
      meta: { targets: t, distractors: d },
    };
  },
  score(trial, response) {
    if (trial.recall.type !== 'ordered') throw new Error('tipo');
    return scoreOrdered(trial.recall.answer, response as string[], trial.stimuli.filter((s) => s.role === 'distractor').map((s) => s.text));
  },
  validate(trial) {
    if (trial.recall.type !== 'ordered') return ['tipo'];
    const ok = trial.recall.answer.join() === trial.stimuli.filter((s) => s.role === 'target').map((s) => s.text).join();
    return ok ? [] : ['respuesta incorrecta'];
  },
};

function makeEquation(rng: Rng): { statement: string; truth: boolean } {
  const mul = rng.chance(0.4);
  const a = rng.int(2, mul ? 9 : 19), b = rng.int(2, 9);
  const real = mul ? a * b : a + b;
  const truth = rng.chance(0.5);
  const shown = truth ? real : real + rng.pick([-2, -1, 1, 2]);
  return { statement: `${a} ${mul ? '×' : '+'} ${b} = ${shown}`, truth };
}

export const complexSpanTask: SequenceTask = {
  kind: 'sequence',
  id: 'B-complex',
  module: 'B',
  name: 'Span complejo (operaciones + letras)',
  short: 'Span complejo',
  objective: 'Recordar información mientras se realizan operaciones mentales (memoria bajo carga).',
  instructions: ['Antes de cada letra aparece una operación: decide si es verdadera (V) o falsa (F).', 'Después verás una letra: recuérdala.', 'Al final escribe todas las letras en orden. Intenta mantener al menos un 85 % de aciertos en las operaciones.'],
  strategies: [
    { id: 'repaso-entre', label: 'Repasé las letras entre operaciones' },
    { id: 'agrupacion', label: 'Agrupé letras (sílabas, siglas)' },
    { id: 'ninguna', label: 'Ninguna en particular' },
  ],
  errorAdvice: {
    orden: { meaning: 'Letras correctas en orden equivocado.', better: 'Repasa la lista en orden tras cada operación.' },
    omision: { meaning: 'Faltaron letras.', better: 'Resuelve la operación rápido y dedica el tiempo sobrante a repasar.' },
    intrusion: { meaning: 'Letras que no aparecieron.', better: 'Crea una palabra o sigla con las letras.' },
  },
  transferHint: 'Mantener datos mientras se procesa otra cosa es lo que exige tomar apuntes o calcular mientras se escucha.',
  minLevel: 1,
  maxLevel: 7,
  hasNovel: false,
  blockSeconds: 220,
  trialsPerBlock: 3,
  generate(rng, level, variant) {
    const t = Math.max(2, Math.round(level) + 1);
    const letters = rng.sample(CONSONANTS, t);
    const stimuli = letters.map((text) => ({ text, processing: makeEquation(rng) }));
    return {
      signature: `cspan:${letters.join('')}:${stimuli.map((s) => s.processing.statement).join('|')}`,
      level,
      variant,
      stimuli,
      durationMs: 1000,
      isiMs: 250,
      recallPrompt: 'Escribe las letras en orden',
      recall: { type: 'ordered', answer: letters, alphabet: CONSONANTS },
      explanation: [`Letras: ${letters.join(' ')}`],
      meta: { length: t },
    };
  },
  score(trial, response) {
    if (trial.recall.type !== 'ordered') throw new Error('tipo');
    return scoreOrdered(trial.recall.answer, response as string[]);
  },
  validate(trial) {
    const errs: string[] = [];
    for (const s of trial.stimuli) {
      if (!s.processing) { errs.push('falta operación'); continue; }
      const m = s.processing.statement.match(/(\d+) ([+×]) (\d+) = (-?\d+)/);
      if (!m) { errs.push('operación ilegible'); continue; }
      const real = m[2] === '×' ? Number(m[1]) * Number(m[3]) : Number(m[1]) + Number(m[3]);
      if ((real === Number(m[4])) !== s.processing.truth) errs.push('verdad de la operación mal calculada');
    }
    return errs;
  },
};

// Integración de información presentada en distintos momentos: premisas de orden una a una.
export const integrationTask: SequenceTask = {
  kind: 'sequence',
  id: 'B-integration',
  module: 'B',
  name: 'Integración temporal',
  short: 'Integración',
  objective: 'Integrar información presentada en distintos momentos para responder a una pregunta.',
  instructions: ['Verás afirmaciones una a una; desaparecen después de unos segundos.', 'Al final responde una pregunta que exige combinarlas todas.'],
  strategies: [
    { id: 'modelo', label: 'Construí una fila mental y la fui actualizando' },
    { id: 'memorizar-frases', label: 'Memoricé las frases literalmente' },
    { id: 'ninguna', label: 'Ninguna en particular' },
  ],
  errorAdvice: {
    'inversion-relacion': { meaning: 'Invertiste la dirección de una relación.', better: 'Traduce cada frase a «X delante de Y» en cuanto aparece.' },
    'integracion-incompleta': { meaning: 'No integraste todas las afirmaciones.', better: 'Actualiza una única fila mental con cada nueva frase en vez de memorizar frases.' },
  },
  transferHint: 'Construir un modelo mental mientras se lee o escucha mejora la comprensión de textos e instrucciones.',
  minLevel: 1,
  maxLevel: 9,
  hasNovel: false,
  blockSeconds: 180,
  trialsPerBlock: 4,
  generate(rng, level, variant) {
    const L = Math.round(level);
    const n = L <= 3 ? 3 : L <= 6 ? 4 : 5;
    const names = rng.sample(NAMES, n);
    const order = rng.shuffle([...Array(n).keys()]);
    const premises: Premise[] = rng.shuffle(order.slice(0, -1).map((a, i) => ({ a, b: order[i + 1] })));
    const k = rng.int(0, n - 1);
    const stimuli = premises.map((p) => ({ text: rng.chance(0.5) ? `${names[p.a]} es más alto que ${names[p.b]}` : `${names[p.b]} es más bajo que ${names[p.a]}` }));
    const options = rng.shuffle([...Array(n).keys()]);
    return {
      signature: `integ:${stimuli.map((s) => s.text).join('|')}:${k}`,
      level,
      variant,
      stimuli,
      durationMs: Math.max(1800, 3500 - L * 150),
      isiMs: 400,
      recallPrompt: 'Responde con la información integrada',
      recall: { type: 'choice', question: k === 0 ? '¿Quién es el más alto?' : `¿Quién es el ${ordinal(k)} más alto?`, options: options.map((i) => names[i]), correctIndex: options.indexOf(order[k]) },
      explanation: [`Orden (de más alto a más bajo): ${order.map((i) => names[i]).join(' → ')}`],
      meta: { n, premises, k, answer: order[k], mirrored: order[n - 1 - k], optionIdx: options },
    };
  },
  score(trial, response) {
    if (trial.recall.type !== 'choice') throw new Error('tipo');
    const correct = response === trial.recall.correctIndex;
    if (correct) return { correct, partial: 1 };
    const m = trial.meta as { mirrored: number; optionIdx: number[] };
    return { correct, partial: 0, errorTag: m.optionIdx[response as number] === m.mirrored ? 'inversion-relacion' : 'integracion-incompleta' };
  },
  validate(trial) {
    const m = trial.meta as { n: number; premises: Premise[]; k: number; answer: number };
    const orders = consistentOrders(m.n, m.premises);
    if (orders.length !== 1) return ['orden no determinado'];
    return orders[0][m.k] === m.answer ? [] : ['respuesta incorrecta'];
  },
};

export type { SeqTrial, Variant };

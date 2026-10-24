import type { Rng } from '../rng';
import type { CellSpec, ColorName, ShapeName, SpeedBlockMetrics, SpeedTrial, SpeedTrialResult, SpeededTask } from '../types';
import { dPrime, median, mean } from '../stats';
import { lvl } from './common';

// Tareas cronometradas. Velocidad y precisión se informan por separado.
// Se excluyen anticipaciones (< 150 ms) del cálculo de tiempos y se usan medianas
// para reducir el efecto de valores extremos y de la latencia del dispositivo.

export const ANTICIPATION_MS = 150;

function rtOf(rs: SpeedTrialResult[]) {
  return median(rs.filter((r) => r.correct && r.rtMs !== null && !r.anticipation).map((r) => r.rtMs!));
}

function baseMetrics(results: SpeedTrialResult[]): SpeedBlockMetrics {
  const valid = results.filter((r) => !r.anticipation);
  return {
    accuracy: valid.length ? valid.filter((r) => r.correct).length / valid.length : 0,
    medianRtCorrect: rtOf(results),
    extra: {
      anticipaciones: results.filter((r) => r.anticipation).length,
      omisiones: results.filter((r) => r.response === 'none').length,
    },
    summary: [],
  };
}

function conditionCost(results: SpeedTrialResult[], slow: string, fast: string, m: SpeedBlockMetrics, label: string) {
  const a = results.filter((r) => r.condition === slow);
  const b = results.filter((r) => r.condition === fast);
  const rtCost = rtOf(a) - rtOf(b);
  const accA = a.length ? mean(a.map((r) => (r.correct ? 1 : 0))) : NaN;
  const accB = b.length ? mean(b.map((r) => (r.correct ? 1 : 0))) : NaN;
  m.extra[`coste_${label}_ms`] = rtCost;
  m.extra[`coste_${label}_precision`] = accB - accA;
  if (Number.isFinite(rtCost)) m.summary.push(`Coste de ${label}: ${Math.round(rtCost)} ms y ${Math.round((accB - accA) * 100)} puntos de precisión.`);
}

// ---------- C1 Comparación de símbolos ----------
const SYMBOLS = ['◆', '●', '■', '▲', '★', '♣', '♥', '✚', '◇', '○', '□', '△', '☆', '♠', '♦', '✖'];
const SIMILAR: Record<string, string> = { '◆': '◇', '◇': '◆', '●': '○', '○': '●', '■': '□', '□': '■', '▲': '△', '△': '▲', '★': '☆', '☆': '★', '♣': '♠', '♠': '♣', '♥': '♦', '♦': '♥', '✚': '✖', '✖': '✚' };

export const symbolCompareTask: SpeededTask = {
  kind: 'speeded',
  id: 'C-symbols',
  module: 'C',
  name: 'Comparación de símbolos',
  short: 'Símbolos',
  objective: 'Comparar información visual con rapidez manteniendo la precisión.',
  instructions: ['Verás dos filas de símbolos.', 'Pulsa F (o «Iguales») si son idénticas y J (o «Distintas») si difieren en algo.', 'Responde lo más rápido que puedas SIN sacrificar la precisión.'],
  strategies: [{ id: 'barrido', label: 'Barrido de izquierda a derecha' }, { id: 'global', label: 'Vistazo global' }, { id: 'parejas', label: 'Comparé por parejas' }],
  errorAdvice: {
    'falsa-alarma': { meaning: 'Dijiste «distintas» cuando eran iguales.', better: 'Confirma la diferencia antes de responder.' },
    'omision-diferencia': { meaning: 'No detectaste una diferencia.', better: 'Compara símbolo a símbolo; los parecidos (◆/◇) son la trampa.' },
    'sin-respuesta': { meaning: 'Se agotó el tiempo.', better: 'Responde aunque no estés totalmente seguro.' },
  },
  transferHint: 'La comparación rápida y precisa es útil al revisar datos, códigos o documentos.',
  minLevel: 1, maxLevel: 10, hasNovel: false, blockSeconds: 90,
  responses: [{ value: 'igual', label: 'Iguales', key: 'f' }, { value: 'distinto', label: 'Distintas', key: 'j' }],
  trialsPerBlock: () => 20,
  timeoutMs: () => 4500,
  itiMs: 400,
  feedbackPerTrial: false,
  generateBlock(rng, level) {
    const L = lvl(level);
    const len = 2 + Math.ceil(L / 2);
    return Array.from({ length: 20 }, () => {
      const left = Array.from({ length: len }, () => rng.pick(SYMBOLS));
      const same = rng.chance(0.5);
      const right = left.slice();
      if (!same) {
        const i = rng.int(0, len - 1);
        right[i] = L >= 5 ? SIMILAR[left[i]] : rng.pick(SYMBOLS.filter((s) => s !== left[i]));
      }
      return { stimulus: { type: 'pair', left: left.join(' '), right: right.join(' ') }, correct: same ? 'igual' : 'distinto', condition: same ? 'igual' : 'distinto' } as SpeedTrial;
    });
  },
  createJudge: () => (trial, response) => {
    if (response === trial.correct) return { correct: true };
    if (response === 'none') return { correct: false, errorTag: 'sin-respuesta' };
    return { correct: false, errorTag: trial.correct === 'igual' ? 'falsa-alarma' : 'omision-diferencia' };
  },
  metrics(results) {
    const m = baseMetrics(results);
    m.summary.push(`Precisión ${Math.round(m.accuracy * 100)} %, tiempo mediano ${Math.round(m.medianRtCorrect)} ms en aciertos.`);
    return m;
  },
};

// ---------- C2 Búsqueda visual ----------
export const visualSearchTask: SpeededTask = {
  kind: 'speeded',
  id: 'C-search',
  module: 'C',
  name: 'Búsqueda visual',
  short: 'Búsqueda',
  objective: 'Explorar una escena de forma eficiente para detectar un objetivo.',
  instructions: ['Busca una letra T (en cualquier orientación) entre letras L.', 'Pulsa J (o «Presente») si hay una T; F (o «Ausente») si no la hay.', 'La mitad de las veces no hay T.'],
  strategies: [{ id: 'sistematica', label: 'Exploración sistemática por filas' }, { id: 'aleatoria', label: 'Exploración libre' }],
  errorAdvice: {
    'falsa-alarma': { meaning: 'Dijiste que había T sin haberla.', better: 'Confirma el cruce de la T (centrado) frente a la esquina de la L.' },
    'objetivo-perdido': { meaning: 'Había una T y no la encontraste.', better: 'Explora por filas para no saltarte zonas.' },
    'sin-respuesta': { meaning: 'Se agotó el tiempo.', better: 'Explora por filas: es más rápido que saltar al azar.' },
  },
  transferHint: 'Una exploración sistemática reduce omisiones al revisar textos, tablas o entornos.',
  minLevel: 1, maxLevel: 10, hasNovel: false, blockSeconds: 120,
  responses: [{ value: 'ausente', label: 'Ausente', key: 'f' }, { value: 'presente', label: 'Presente', key: 'j' }],
  trialsPerBlock: () => 16,
  timeoutMs: (level) => 5000 + level * 300,
  itiMs: 500,
  feedbackPerTrial: false,
  generateBlock(rng, level) {
    const L = lvl(level);
    const base = 8 + (L - 1) * 3;
    return Array.from({ length: 16 }, (_, i) => {
      const size = i % 2 === 0 ? base : base + 8;
      const present = rng.chance(0.5);
      const cells = Array.from({ length: size }, () => ({ glyph: 'L', rotation: rng.pick([0, 90, 180, 270]) }));
      if (present) cells[rng.int(0, size - 1)] = { glyph: 'T', rotation: rng.pick([0, 90, 180, 270]) };
      const cols = Math.ceil(Math.sqrt(size * 1.4));
      return { stimulus: { type: 'search', cols, cells: rng.shuffle(cells) }, correct: present ? 'presente' : 'ausente', condition: present ? 'presente' : 'ausente', meta: { size } } as SpeedTrial;
    });
  },
  createJudge: () => (trial, response) => {
    if (response === trial.correct) return { correct: true };
    if (response === 'none') return { correct: false, errorTag: 'sin-respuesta' };
    return { correct: false, errorTag: trial.correct === 'presente' ? 'objetivo-perdido' : 'falsa-alarma' };
  },
  metrics(results, trials) {
    const m = baseMetrics(results);
    const pts = results.filter((r) => r.correct && r.condition === 'presente' && r.rtMs !== null).map((r) => ({ x: (trials[r.index].meta as { size: number }).size, y: r.rtMs! }));
    const sizes = [...new Set(pts.map((p) => p.x))].sort((a, b) => a - b);
    if (sizes.length === 2) {
      const small = median(pts.filter((p) => p.x === sizes[0]).map((p) => p.y));
      const big = median(pts.filter((p) => p.x === sizes[1]).map((p) => p.y));
      m.extra.pendiente_ms_por_elemento = (big - small) / (sizes[1] - sizes[0]);
      if (Number.isFinite(m.extra.pendiente_ms_por_elemento)) m.summary.push(`Eficiencia de búsqueda: ${Math.round(m.extra.pendiente_ms_por_elemento)} ms por elemento adicional (menos es más eficiente).`);
    }
    m.summary.unshift(`Precisión ${Math.round(m.accuracy * 100)} %, tiempo mediano ${Math.round(m.medianRtCorrect)} ms.`);
    return m;
  },
};

// ---------- C3 Flanker (atención selectiva) ----------
export const flankerTask: SpeededTask = {
  kind: 'speeded',
  id: 'C-flanker',
  module: 'C',
  name: 'Atención selectiva (flancos)',
  short: 'Flancos',
  objective: 'Responder al estímulo relevante ignorando información conflictiva alrededor.',
  instructions: ['Mira SOLO la flecha central.', 'Pulsa F (o «←») si apunta a la izquierda y J (o «→») si apunta a la derecha.', 'Ignora las flechas de los lados.'],
  strategies: [{ id: 'foco', label: 'Mantuve el foco en el centro' }, { id: 'rapido', label: 'Respondí lo más rápido posible' }],
  errorAdvice: {
    'captura-flancos': { meaning: 'Respondiste según las flechas laterales.', better: 'Fija la mirada en el centro antes de que aparezca el estímulo.' },
    'error-simple': { meaning: 'Error sin conflicto.', better: 'Reduce un poco la velocidad.' },
    'sin-respuesta': { meaning: 'Se agotó el tiempo.', better: 'Prepara ambos dedos sobre F y J.' },
  },
  transferHint: 'Resistir la interferencia ayuda a concentrarse en entornos con distracciones.',
  minLevel: 1, maxLevel: 10, hasNovel: false, blockSeconds: 80,
  responses: [{ value: 'izquierda', label: '←', key: 'f' }, { value: 'derecha', label: '→', key: 'j' }],
  trialsPerBlock: () => 32,
  timeoutMs: (level) => Math.max(650, 1600 - (lvl(level) - 1) * 100),
  itiMs: 450,
  feedbackPerTrial: false,
  generateBlock(rng, level) {
    const L = lvl(level);
    const side = L >= 5 ? 3 : 2;
    return Array.from({ length: 32 }, () => {
      const dir = rng.chance(0.5) ? '<' : '>';
      const r = rng.next();
      const cond = r < 0.45 ? 'congruente' : r < 0.9 ? 'incongruente' : 'neutro';
      const fl = cond === 'congruente' ? dir : cond === 'incongruente' ? (dir === '<' ? '>' : '<') : '—';
      const text = fl.repeat(side) + dir + fl.repeat(side);
      return { stimulus: { type: 'text', text: text.replace(/</g, '←').replace(/>/g, '→'), big: true }, correct: dir === '<' ? 'izquierda' : 'derecha', condition: cond } as SpeedTrial;
    });
  },
  createJudge: () => (trial, response) => {
    if (response === trial.correct) return { correct: true };
    if (response === 'none') return { correct: false, errorTag: 'sin-respuesta' };
    return { correct: false, errorTag: trial.condition === 'incongruente' ? 'captura-flancos' : 'error-simple' };
  },
  metrics(results) {
    const m = baseMetrics(results);
    m.summary.push(`Precisión ${Math.round(m.accuracy * 100)} %, tiempo mediano ${Math.round(m.medianRtCorrect)} ms.`);
    conditionCost(results, 'incongruente', 'congruente', m, 'interferencia');
    return m;
  },
};

// ---------- C4 Detección de objetivos (go/no-go) ----------
export const goNoGoTask: SpeededTask = {
  kind: 'speeded',
  id: 'C-gonogo',
  module: 'C',
  name: 'Detección y control de respuesta',
  short: 'Go/No-go',
  objective: 'Responder rápido a los estímulos frecuentes e inhibir la respuesta ante el objetivo de parada.',
  instructions: ['Aparecerán dígitos del 1 al 9.', 'Pulsa ESPACIO (o «Responder») con cada dígito EXCEPTO con el 3.', 'Con el 3 no pulses nada.'],
  strategies: [{ id: 'ritmo', label: 'Mantuve un ritmo constante' }, { id: 'esperar', label: 'Esperé a identificar el dígito' }],
  errorAdvice: {
    comision: { meaning: 'Pulsaste ante el 3 (fallo de inhibición).', better: 'Identifica el dígito antes de pulsar: sacrifica unos milisegundos.' },
    omision: { meaning: 'No respondiste a un dígito que requería respuesta.', better: 'Mantén la atención activa: los lapsos aparecen con la monotonía.' },
  },
  transferHint: 'Frenar respuestas automáticas es útil al revisar trabajo rutinario o conducir.',
  minLevel: 1, maxLevel: 10, hasNovel: false, blockSeconds: 70,
  responses: [{ value: 'go', label: 'Responder', key: ' ' }],
  trialsPerBlock: () => 36,
  timeoutMs: (level) => Math.max(600, 1300 - (lvl(level) - 1) * 70),
  itiMs: 350,
  feedbackPerTrial: false,
  generateBlock(rng) {
    return Array.from({ length: 36 }, () => {
      const nogo = rng.chance(0.2);
      const d = nogo ? 3 : rng.pick([1, 2, 4, 5, 6, 7, 8, 9]);
      return { stimulus: { type: 'text', text: String(d), big: true }, correct: nogo ? 'none' : 'go', condition: nogo ? 'nogo' : 'go' } as SpeedTrial;
    });
  },
  createJudge: () => (trial, response) => {
    if (response === trial.correct) return { correct: true };
    return { correct: false, errorTag: trial.condition === 'nogo' ? 'comision' : 'omision' };
  },
  metrics(results) {
    const m = baseMetrics(results);
    const nogo = results.filter((r) => r.condition === 'nogo');
    const go = results.filter((r) => r.condition === 'go');
    m.extra.comisiones = nogo.filter((r) => !r.correct).length;
    m.extra.omisiones_go = go.filter((r) => !r.correct).length;
    m.summary.push(`Precisión ${Math.round(m.accuracy * 100)} %, tiempo mediano ${Math.round(m.medianRtCorrect)} ms.`, `Errores de comisión: ${m.extra.comisiones} de ${nogo.length}. Omisiones: ${m.extra.omisiones_go} de ${go.length}.`);
    return m;
  },
};

// ---------- B2 N-back ----------
const NB_LETTERS = 'BCDFGHJKLMNPRST'.split('');
export function nbackN(level: number) {
  return 1 + Math.floor((lvl(level) - 1) / 2);
}

export const nbackTask: SpeededTask = {
  kind: 'speeded',
  id: 'B-nback',
  module: 'B',
  name: 'N-back de letras',
  short: 'N-back',
  objective: 'Actualizar y comparar continuamente la información reciente.',
  instructions: ['Aparecen letras una a una.', 'Pulsa J (o «Coincide») si la letra es igual a la de N posiciones atrás; si no, F (o «No coincide»).', 'N se indica arriba. Responde en cada letra.'],
  strategies: [{ id: 'repaso', label: 'Repetí las últimas N letras' }, { id: 'familiaridad', label: 'Me guié por la familiaridad' }],
  errorAdvice: {
    'falsa-alarma': { meaning: 'Dijiste «coincide» sin coincidencia.', better: 'Mantén la lista exacta de las últimas N letras, no solo la sensación de «ya la vi».' },
    'falsa-alarma-señuelo': { meaning: 'Respondiste a una letra que coincidía con otra posición (N±1).', better: 'Controla la posición exacta, no solo la familiaridad.' },
    'omision-coincidencia': { meaning: 'No detectaste una coincidencia.', better: 'Actualiza la lista con cada letra nueva.' },
    'sin-respuesta': { meaning: 'Se agotó el tiempo.', better: 'Responde en cada letra aunque dudes.' },
  },
  transferHint: 'Comparar continuamente lo nuevo con lo reciente es parecido a seguir una conversación o una partida.',
  minLevel: 1, maxLevel: 8, hasNovel: false, blockSeconds: 80,
  responses: [{ value: 'no', label: 'No coincide', key: 'f' }, { value: 'si', label: 'Coincide', key: 'j' }],
  trialsPerBlock: (level) => 20 + nbackN(level),
  timeoutMs: () => 2500,
  itiMs: 500,
  feedbackPerTrial: false,
  generateBlock(rng, level) {
    const n = nbackN(level);
    const lures = lvl(level) % 2 === 0;
    const total = 20 + n;
    const seq: string[] = [];
    const conds: string[] = [];
    for (let i = 0; i < total; i++) {
      if (i >= n && rng.chance(0.3)) { seq.push(seq[i - n]); conds.push('objetivo'); continue; }
      if (lures && i > n && rng.chance(0.25)) {
        const offs = [n - 1, n + 1].filter((o) => o >= 1 && i - o >= 0 && seq[i - o] !== seq[i - n]);
        if (offs.length) { seq.push(seq[i - rng.pick(offs)]); conds.push('señuelo'); continue; }
      }
      let c: string;
      do c = rng.pick(NB_LETTERS); while (i >= n && c === seq[i - n]);
      seq.push(c);
      conds.push('no-objetivo');
    }
    return seq.map((text, i) => ({ stimulus: { type: 'text', text, big: true, cue: `${n}-back` }, correct: conds[i] === 'objetivo' ? 'si' : 'no', condition: conds[i] }) as SpeedTrial);
  },
  createJudge: () => (trial, response) => {
    if (response === trial.correct) return { correct: true };
    if (response === 'none') return { correct: false, errorTag: 'sin-respuesta' };
    if (trial.correct === 'si') return { correct: false, errorTag: 'omision-coincidencia' };
    return { correct: false, errorTag: trial.condition === 'señuelo' ? 'falsa-alarma-señuelo' : 'falsa-alarma' };
  },
  metrics(results) {
    const m = baseMetrics(results);
    const t = results.filter((r) => r.condition === 'objetivo');
    const nt = results.filter((r) => r.condition !== 'objetivo');
    const hits = t.filter((r) => r.response === 'si').length;
    const fas = nt.filter((r) => r.response === 'si').length;
    m.extra.aciertos = hits;
    m.extra.falsas_alarmas = fas;
    m.extra.d_prima = dPrime(hits, t.length - hits, fas, nt.length - fas);
    const lures = results.filter((r) => r.condition === 'señuelo');
    if (lures.length) m.extra.falsas_alarmas_señuelo = lures.filter((r) => r.response === 'si').length / lures.length;
    m.summary.push(`Aciertos ${hits}/${t.length}, falsas alarmas ${fas}/${nt.length}, d′ = ${m.extra.d_prima.toFixed(2)}.`);
    return m;
  },
};

// ---------- D1 Alternancia de tareas ----------
export const switchingTask: SpeededTask = {
  kind: 'speeded',
  id: 'D-switch',
  module: 'D',
  name: 'Alternancia de tareas',
  short: 'Alternancia',
  objective: 'Cambiar con rapidez entre dos reglas según una señal.',
  instructions: [
    'Verás un número (1–9, nunca 5) y una señal encima.',
    'Señal PAR/IMPAR (violeta): F = par, J = impar.',
    'Señal MAYOR/MENOR (cian): F = menor que 5, J = mayor que 5.',
    'En niveles altos la señal se indica solo con el color.',
  ],
  strategies: [{ id: 'preparar', label: 'Me preparé al ver la señal' }, { id: 'verbalizar', label: 'Me dije la regla en voz baja' }, { id: 'reaccionar', label: 'Reaccioné sin preparar' }],
  errorAdvice: {
    'regla-anterior': { meaning: 'Aplicaste la regla del ensayo anterior tras un cambio.', better: 'Lee la señal antes que el número y di mentalmente la regla.' },
    'error-repeticion': { meaning: 'Error sin cambio de regla.', better: 'Reduce un poco la velocidad.' },
    'sin-respuesta': { meaning: 'Se agotó el tiempo.', better: 'Mantén los dedos sobre F y J.' },
  },
  transferHint: 'Alternar entre tareas con poco coste es útil cuando el trabajo exige cambiar de contexto.',
  minLevel: 1, maxLevel: 10, hasNovel: false, blockSeconds: 100,
  responses: [{ value: 'f', label: 'Par · Menor', key: 'f' }, { value: 'j', label: 'Impar · Mayor', key: 'j' }],
  trialsPerBlock: () => 32,
  timeoutMs: (level) => Math.max(1400, 3200 - (lvl(level) - 1) * 200),
  itiMs: 400,
  feedbackPerTrial: false,
  generateBlock(rng, level) {
    const L = lvl(level);
    const pSwitch = Math.min(0.5, 0.25 + L * 0.03);
    let task: 'paridad' | 'magnitud' = rng.chance(0.5) ? 'paridad' : 'magnitud';
    return Array.from({ length: 32 }, (_, i) => {
      const sw = i > 0 && rng.chance(pSwitch);
      if (sw) task = task === 'paridad' ? 'magnitud' : 'paridad';
      const d = rng.pick([1, 2, 3, 4, 6, 7, 8, 9]);
      const correct = task === 'paridad' ? (d % 2 === 0 ? 'f' : 'j') : d < 5 ? 'f' : 'j';
      const cueColor: ColorName = task === 'paridad' ? 'violeta' : 'cian';
      return {
        stimulus: { type: 'text', text: String(d), big: true, color: cueColor, cue: L >= 7 ? '' : task === 'paridad' ? 'PAR / IMPAR' : 'MAYOR / MENOR', cueColor },
        correct,
        condition: i === 0 ? 'inicio' : sw ? 'cambio' : 'repeticion',
        meta: { task, digit: d },
      } as SpeedTrial;
    });
  },
  createJudge: () => (trial, response) => {
    if (response === trial.correct) return { correct: true };
    if (response === 'none') return { correct: false, errorTag: 'sin-respuesta' };
    return { correct: false, errorTag: trial.condition === 'cambio' ? 'regla-anterior' : 'error-repeticion' };
  },
  metrics(results) {
    const m = baseMetrics(results);
    m.summary.push(`Precisión ${Math.round(m.accuracy * 100)} %, tiempo mediano ${Math.round(m.medianRtCorrect)} ms.`);
    conditionCost(results, 'cambio', 'repeticion', m, 'alternancia');
    return m;
  },
};

// ---------- D2 Clasificación con reglas cambiantes ----------
const WCST_COLORS: ColorName[] = ['cian', 'violeta', 'ámbar', 'rosa'];
const WCST_SHAPES: ShapeName[] = ['círculo', 'triángulo', 'estrella', 'cuadrado'];
export const WCST_REFS: CellSpec[] = [0, 1, 2, 3].map((i) => ({ shape: WCST_SHAPES[i], color: WCST_COLORS[i], count: i + 1, size: 'mediano' }));
type SortRule = 'color' | 'shape' | 'count';
export const SORT_RULE_LABEL: Record<SortRule, string> = { color: 'color', shape: 'forma', count: 'número' };

export function wcstCriterion(level: number) {
  const L = lvl(level);
  return L <= 3 ? 8 : L <= 6 ? 6 : 5;
}

export function createSortJudge(criterion: number, rng: () => number = Math.random) {
  const rules: SortRule[] = ['color', 'shape', 'count'];
  let rule: SortRule = rules[Math.floor(rng() * 3)];
  let prev: SortRule | null = null;
  let streak = 0;
  const state = { categories: 0, perseverative: 0 };
  const judge = (trial: SpeedTrial, response: string) => {
    if (trial.stimulus.type !== 'card') return { correct: false };
    const card = trial.stimulus.card;
    const ref = WCST_REFS[Number(response)];
    const matches = (r: SortRule) => ref !== undefined && card[r] === ref[r];
    const correct = matches(rule);
    trial.meta = { ...(trial.meta ?? {}), rule };
    if (correct) {
      streak++;
      if (streak >= criterion) {
        state.categories++;
        prev = rule;
        const others = rules.filter((r) => r !== rule);
        rule = others[Math.floor(rng() * others.length)];
        streak = 0;
      }
      return { correct: true };
    }
    streak = 0;
    if (response === 'none') return { correct: false, errorTag: 'sin-respuesta' };
    if (prev && matches(prev)) { state.perseverative++; return { correct: false, errorTag: 'perseverativo' }; }
    return { correct: false, errorTag: 'no-perseverativo' };
  };
  return { judge, state };
}

export const sortingTask: SpeededTask = {
  kind: 'speeded',
  id: 'D-sorting',
  module: 'D',
  name: 'Clasificación con reglas cambiantes',
  short: 'Clasificación',
  objective: 'Descubrir una regla a partir de la retroalimentación y detectar cuándo deja de ser válida.',
  instructions: [
    'Asocia cada carta con una de las cuatro cartas de referencia (teclas 1–4).',
    'La regla (color, forma o número) no se dice: descúbrela con el mensaje «correcto/incorrecto».',
    'La regla cambia sin aviso después de varios aciertos seguidos.',
  ],
  strategies: [{ id: 'hipotesis', label: 'Probé hipótesis de forma sistemática' }, { id: 'feedback', label: 'Seguí el último mensaje' }, { id: 'azar', label: 'Fui probando al azar' }],
  errorAdvice: {
    perseverativo: { meaning: 'Seguiste usando la regla anterior tras el cambio.', better: 'Tras un error inesperado, abandona la regla y prueba otra dimensión.' },
    'no-perseverativo': { meaning: 'Error al explorar o por despiste.', better: 'Cambia de hipótesis solo cuando recibas un error.' },
    'sin-respuesta': { meaning: 'Se agotó el tiempo.', better: 'Responde según tu hipótesis actual.' },
  },
  transferHint: 'Detectar que una estrategia dejó de funcionar y cambiarla a tiempo vale para negociar, investigar o depurar errores.',
  minLevel: 1, maxLevel: 10, hasNovel: false, blockSeconds: 180,
  responses: [0, 1, 2, 3].map((i) => ({ value: String(i), label: String(i + 1), key: String(i + 1) })),
  trialsPerBlock: () => 40,
  timeoutMs: () => 9000,
  itiMs: 700,
  feedbackPerTrial: true,
  generateBlock(rng: Rng, level) {
    return Array.from({ length: 40 }, () => {
      let card: CellSpec;
      // evita cartas idénticas a una de referencia (serían ambiguas en las tres dimensiones)
      do card = { shape: rng.pick(WCST_SHAPES), color: rng.pick(WCST_COLORS), count: rng.int(1, 4), size: 'mediano' };
      while (WCST_REFS.some((r) => r.shape === card.shape && r.color === card.color && r.count === card.count));
      return { stimulus: { type: 'card', card, references: WCST_REFS }, correct: '', condition: 'carta', meta: { criterion: wcstCriterion(level) } } as SpeedTrial;
    });
  },
  createJudge() {
    let inner: ReturnType<typeof createSortJudge> | null = null;
    return (trial, response) => {
      if (!inner) inner = createSortJudge((trial.meta as { criterion: number }).criterion);
      return inner.judge(trial, response);
    };
  },
  metrics(results, trials) {
    const m = baseMetrics(results);
    const persev = results.filter((r) => r.errorTag === 'perseverativo').length;
    const nonp = results.filter((r) => r.errorTag === 'no-perseverativo').length;
    // Cada cambio de regla registrado por el juez indica una categoría completada.
    const rules = results.map((r) => (trials[r.index].meta as { rule?: string } | undefined)?.rule).filter(Boolean);
    let categories = 0;
    let firstChange = NaN;
    for (let i = 1; i < rules.length; i++) {
      if (rules[i] !== rules[i - 1]) {
        categories++;
        if (!Number.isFinite(firstChange)) firstChange = i;
      }
    }
    m.extra.errores_perseverativos = persev;
    m.extra.errores_no_perseverativos = nonp;
    m.extra.categorias = categories;
    m.extra.ensayos_primera_categoria = firstChange;
    m.summary.push(`Precisión ${Math.round(m.accuracy * 100)} %. Categorías completadas: ${categories}.`, `Errores perseverativos: ${persev}. Otros errores: ${nonp}.`);
    return m;
  },
};

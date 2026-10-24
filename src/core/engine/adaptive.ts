import type { BlockRecord, TaskState, TrialRecord } from '../records';
import type { Purpose, Task, Variant } from '../types';
import { clamp, mean, sd, slope } from '../stats';
import type { AdaptiveParams } from './params';

// Reglas de adaptación (ver METODOLOGIA.md):
//  1. Precisión alta y estable → la dificultad sube gradualmente (escalera ponderada).
//  2. Precisión baja persistente → baja la dificultad y se ofrece un ejemplo resuelto.
//  3. Mejora en tareas familiares → se programan variantes nuevas.
//  4. Estancamiento → se cambia la estrategia (variación, revisión) en lugar de repetir más.
//  5. Fatiga → sesión ligera o pausa (ver session.ts).
//  6. Habilidad que avanza mucho más rápido → se redistribuye el tiempo (ver selection.ts).
//  7. Alta variabilidad → pasos más pequeños hasta tener más datos.
//  8. Mejora solo en una tarea → no se extrapola (paneles separados y aviso de mejora específica).

export function initialTaskState(task: Task): TaskState {
  return {
    taskId: task.id,
    level: task.minLevel,
    blocks: 0,
    trials: 0,
    consecutiveErrors: 0,
    needsWorkedExample: false,
    blocksSinceNovel: 0,
    seen: [],
    history: [],
  };
}

export function recentVariability(state: TaskState, p: AdaptiveParams): number {
  const accs = state.history.filter((h) => h.variant === 'train').slice(-p.variabilityWindow).map((h) => h.accuracy);
  return accs.length >= 3 ? sd(accs) : NaN;
}

export interface LevelUpdate {
  level: number;
  reason: string;
}

/** Regla 1, 2 y 7 para ítems y secuencias: escalera ponderada ensayo a ensayo. */
export function updateLevelAfterTrial(task: Task, state: TaskState, correct: boolean, p: AdaptiveParams): LevelUpdate {
  const variability = recentVariability(state, p);
  const factor = Number.isFinite(variability) && variability > p.variabilityThreshold ? p.variabilityStepFactor : 1;
  const up = p.baseStep * factor;
  const down = (p.baseStep * p.targetAccuracy) / (1 - p.targetAccuracy) * factor;
  const next = clamp(correct ? state.level + up : state.level - down, task.minLevel, task.maxLevel);
  const reason = factor < 1 ? 'Variabilidad alta: pasos reducidos a la mitad hasta tener más datos.' : correct ? 'Acierto: la dificultad sube ligeramente.' : 'Error: la dificultad baja.';
  return { level: next, reason };
}

/** Reglas 1, 2 y 7 para tareas cronometradas: ajuste al final del bloque. */
export function updateLevelAfterSpeedBlock(task: Task, state: TaskState, accuracy: number, p: AdaptiveParams): LevelUpdate {
  const variability = recentVariability(state, p);
  const step = Number.isFinite(variability) && variability > p.variabilityThreshold ? p.speedStep * p.variabilityStepFactor : p.speedStep;
  if (accuracy >= p.speedUpAccuracy) return { level: clamp(state.level + step, task.minLevel, task.maxLevel), reason: `Precisión ${Math.round(accuracy * 100)} % ≥ ${Math.round(p.speedUpAccuracy * 100)} %: sube la dificultad.` };
  if (accuracy < p.speedDownAccuracy) return { level: clamp(state.level - step, task.minLevel, task.maxLevel), reason: `Precisión ${Math.round(accuracy * 100)} % < ${Math.round(p.speedDownAccuracy * 100)} %: baja la dificultad (no se premia la velocidad sin precisión).` };
  return { level: state.level, reason: 'Precisión en la zona objetivo: se mantiene el nivel.' };
}

/** Actualiza el estado tras un ensayo de ítem/secuencia (no modifica el original). */
export function applyTrial(task: Task, state: TaskState, correct: boolean, p: AdaptiveParams, signature?: string, adapt = true): { state: TaskState; reason: string } {
  const upd = adapt ? updateLevelAfterTrial(task, state, correct, p) : { level: state.level, reason: 'Nivel fijo (medición).' };
  const consecutiveErrors = correct ? 0 : state.consecutiveErrors + 1;
  return {
    state: {
      ...state,
      level: upd.level,
      trials: state.trials + 1,
      consecutiveErrors,
      needsWorkedExample: consecutiveErrors >= p.workedExampleAfterErrors,
      seen: signature ? [...state.seen.slice(-499), signature] : state.seen,
      lastPracticed: Date.now(),
    },
    reason: upd.reason,
  };
}

export function applyBlockEnd(state: TaskState, block: { accuracy: number; purpose: Purpose; variant: Variant; level: number }): TaskState {
  const isNovel = block.variant === 'novel';
  return {
    ...state,
    blocks: state.blocks + 1,
    blocksSinceNovel: isNovel ? 0 : state.blocksSinceNovel + (block.purpose === 'training' || block.purpose === 'free' || block.purpose === 'review' ? 1 : 0),
    lastNovelLevel: isNovel ? block.level : state.lastNovelLevel,
    history: [...state.history.slice(-59), { t: Date.now(), level: block.level, accuracy: block.accuracy, purpose: block.purpose, variant: block.variant }],
    lastPracticed: Date.now(),
  };
}

/** Regla 3: ¿toca comprobar la generalización con una variante nueva? */
export function novelProbeDue(task: Task, state: TaskState, p: AdaptiveParams): { due: boolean; reason: string } {
  if (!task.hasNovel) return { due: false, reason: 'La tarea no tiene variante nueva.' };
  if (state.blocks < 2) return { due: false, reason: 'Aún no hay suficiente práctica con la tarea familiar.' };
  if (state.blocksSinceNovel >= p.novelProbeEveryBlocks) return { due: true, reason: `${state.blocksSinceNovel} bloques desde la última variante nueva.` };
  const gain = state.level - (state.lastNovelLevel ?? state.history[0]?.level ?? state.level);
  if (gain >= p.novelProbeLevelGain) return { due: true, reason: `El nivel ha subido ${gain.toFixed(1)} desde la última comprobación.` };
  return { due: false, reason: 'No toca todavía.' };
}

/** Regla 4: estancamiento = pendiente del nivel casi nula en los últimos bloques de entrenamiento. */
export function plateau(state: TaskState, p: AdaptiveParams): { stagnant: boolean; slope: number; n: number } {
  const h = state.history.filter((x) => x.variant === 'train').slice(-p.plateauWindow);
  if (h.length < p.plateauWindow) return { stagnant: false, slope: NaN, n: h.length };
  const s = slope(h.map((_, i) => i), h.map((x) => x.level));
  const accs = h.map((x) => x.accuracy);
  // estancado si el nivel no se mueve y la precisión tampoco mejora
  const accSlope = slope(accs.map((_, i) => i), accs);
  return { stagnant: Math.abs(s) < p.plateauSlope && accSlope <= 0.01, slope: s, n: h.length };
}

/** Regla 8: brecha entre rendimiento en entrenamiento y en variantes nuevas a nivel comparable. */
export function generalizationGap(blocks: BlockRecord[], taskId: string): { gap: number; nTrain: number; nNovel: number } {
  const novel = blocks.filter((b) => b.taskId === taskId && b.variant === 'novel');
  if (!novel.length) return { gap: NaN, nTrain: 0, nNovel: 0 };
  const lvls = novel.map((b) => b.startLevel);
  const lo = Math.min(...lvls) - 1;
  const hi = Math.max(...lvls) + 1;
  const train = blocks.filter((b) => b.taskId === taskId && b.variant === 'train' && b.startLevel >= lo && b.startLevel <= hi && b.purpose !== 'baseline');
  return { gap: mean(train.map((b) => b.accuracy)) - mean(novel.map((b) => b.accuracy)), nTrain: train.length, nNovel: novel.length };
}

// ---------- Estimación del umbral (capacidad latente en la escala de la tarea) ----------
export interface ThresholdEstimate {
  theta: number;
  sdTheta: number;
  n: number;
  provisional: boolean;
}

/**
 * Estimación bayesiana en rejilla del nivel de la tarea en el que la probabilidad de acierto
 * sería del 50 %, con un modelo logístico de pendiente fija y una probabilidad de acierto por azar.
 * Es una estimación interna en unidades de nivel de ESTA tarea: no es un CI, no es un percentil
 * y no es comparable con otras personas.
 */
export function estimateThreshold(task: Task, trials: Pick<TrialRecord, 'level' | 'correct'>[], p: AdaptiveParams, guess = 0): ThresholdEstimate {
  const lo = task.minLevel - 1;
  const hi = task.maxLevel + 1;
  const grid: number[] = [];
  for (let x = lo; x <= hi + 1e-9; x += 0.1) grid.push(x);
  const mid = (task.minLevel + task.maxLevel) / 2;
  const s = 1.2;
  const logPost = grid.map((th) => {
    let lp = -((th - mid) ** 2) / (2 * 4 ** 2); // previa débil N(mid, 4)
    for (const t of trials) {
      const pc = guess + (1 - guess) / (1 + Math.exp(-s * (th - t.level)));
      lp += Math.log(t.correct ? pc : 1 - pc);
    }
    return lp;
  });
  const maxLp = Math.max(...logPost);
  const w = logPost.map((l) => Math.exp(l - maxLp));
  const W = w.reduce((a, b) => a + b, 0);
  const rawTheta = grid.reduce((a, g, i) => a + g * w[i], 0) / W;
  const variance = grid.reduce((a, g, i) => a + (g - rawTheta) ** 2 * w[i], 0) / W;
  const sdTheta = Math.sqrt(variance);
  // Sin datos fuera de los niveles probados, la previa no debe extrapolar: se acota la
  // estimación a ±1 nivel del rango realmente observado.
  const lv = trials.map((t) => t.level);
  const capped = trials.length ? clamp(rawTheta, Math.min(...lv) - 1, Math.max(...lv) + 1) : rawTheta;
  return { theta: capped, sdTheta, n: trials.length, provisional: trials.length < p.minObservations || sdTheta > 1.5 || capped !== rawTheta };
}

/** Índice interno 0–100 (posición del umbral en el rango de niveles de la tarea). */
export function levelIndex(task: Task, theta: number): number {
  return clamp(((theta - task.minLevel) / (task.maxLevel - task.minLevel)) * 100, 0, 100);
}

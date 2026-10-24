import type { BlockRecord, TaskState, TrialRecord } from '../records';
import type { ModuleId, Task } from '../types';
import { TRAINABLE_MODULES } from '../types';
import { clamp, mean, sd } from '../stats';
import { estimateThreshold, generalizationGap, levelIndex, plateau } from './adaptive';
import type { AdaptiveParams } from './params';

// Algoritmo de selección de ejercicios. Cada factor está normalizado en [0, 1] y se combina
// con pesos HEURÍSTICOS configurables. El desglose se muestra en el modo desarrollo.

export interface PriorityBreakdown {
  taskId: string;
  module: ModuleId;
  score: number;
  factors: Record<string, number>;
  contributions: Record<string, number>;
  reasons: string[];
}

export interface SelectionContext {
  tasks: Task[];
  states: Record<string, TaskState>;
  blocks: BlockRecord[];
  trials: TrialRecord[];
  goals: Partial<Record<ModuleId, number>>;
  params: AdaptiveParams;
  now: number;
}

const DAY = 86400000;

/** Progreso de cada módulo: ganancia de nivel desde los primeros bloques (para la regla 6). */
export function moduleProgress(ctx: SelectionContext): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of TRAINABLE_MODULES) {
    const gains = ctx.tasks
      .filter((t) => t.module === m)
      .map((t) => {
        const h = ctx.states[t.id]?.history.filter((x) => x.variant === 'train') ?? [];
        if (h.length < 4) return NaN;
        const span = t.maxLevel - t.minLevel;
        return (mean(h.slice(-3).map((x) => x.level)) - mean(h.slice(0, 3).map((x) => x.level))) / span;
      })
      .filter(Number.isFinite);
    out[m] = gains.length ? mean(gains) : NaN;
  }
  return out;
}

export function prioritize(ctx: SelectionContext): PriorityBreakdown[] {
  const { params: p, now } = ctx;
  const w = p.weights;
  const weekAgo = now - 7 * DAY;
  const recentBlocks = ctx.blocks.filter((b) => b.startedAt >= weekAgo && b.purpose !== 'transfer');
  const twoWeeks = ctx.trials.filter((t) => t.timestamp >= now - 14 * DAY);

  // índice de nivel por tarea para medir necesidad relativa
  const idx: Record<string, number> = {};
  for (const t of ctx.tasks) {
    const tr = ctx.trials.filter((x) => x.taskId === t.id && x.variant === 'train').slice(-80);
    idx[t.id] = tr.length >= 5 ? levelIndex(t, estimateThreshold(t, tr, p).theta) : NaN;
  }
  const knownIdx = Object.values(idx).filter(Number.isFinite);
  const prog = moduleProgress(ctx);
  const progVals = Object.values(prog).filter(Number.isFinite);
  const progMean = mean(progVals);
  const progSd = sd(progVals);

  return ctx.tasks
    .map((t) => {
      const st = ctx.states[t.id];
      const reasons: string[] = [];
      const relevance = clamp((ctx.goals[t.module] ?? 1) / 2, 0, 1);
      // necesidad: tareas con índice bajo respecto a las demás del usuario
      let need = 0.5;
      if (Number.isFinite(idx[t.id]) && knownIdx.length >= 3) {
        const lo = Math.min(...knownIdx), hi = Math.max(...knownIdx);
        need = hi > lo ? 1 - (idx[t.id] - lo) / (hi - lo) : 0.5;
        if (need > 0.7) reasons.push('Es de tus áreas relativamente más débiles.');
      }
      const nTrials = st?.trials ?? 0;
      const reliability = 1 - clamp(nTrials / (p.minObservations * 2), 0, 1);
      if (reliability > 0.6) reasons.push('Hay pocos datos: conviene medir mejor esta habilidad.');
      // progreso: estancamiento (regla 4) e imbalance (regla 6) restan prioridad
      let progress = 0;
      if (st) {
        const pl = plateau(st, p);
        if (pl.stagnant) { progress -= 1; reasons.push('Estancada: se reduce la repetición y se proponen variantes/estrategias.'); }
      }
      const mp = prog[t.module];
      if (Number.isFinite(mp) && progSd > 0 && (mp - progMean) / progSd > p.imbalanceZ) {
        progress -= 0.5;
        reasons.push('Esta habilidad avanza mucho más rápido que las demás: se redistribuye el tiempo.');
      }
      // transferencia: brecha de generalización → priorizar práctica variada
      const gg = generalizationGap(ctx.blocks, t.id);
      const transfer = Number.isFinite(gg.gap) ? clamp(gg.gap / 0.4, 0, 1) : t.hasNovel ? 0.3 : 0;
      if (Number.isFinite(gg.gap) && gg.gap > p.generalizationGap) reasons.push('La mejora no se generaliza aún a variantes nuevas.');
      const timeCost = clamp(t.blockSeconds / 300, 0, 1);
      const share = recentBlocks.length >= 6 ? recentBlocks.filter((b) => b.taskId === t.id).length / recentBlocks.length : 0;
      const overtraining = clamp((share - p.overtrainShare) / (1 - p.overtrainShare), 0, 1);
      if (overtraining > 0) reasons.push('Ya ocupa mucho de tu práctica reciente (riesgo de sobreentrenar una tarea concreta).');
      const days = st?.lastPracticed ? (now - st.lastPracticed) / DAY : 7;
      const recency = clamp(days / 7, 0, 1);
      const tTrials = twoWeeks.filter((x) => x.taskId === t.id);
      const errors = tTrials.length >= 5 ? 1 - mean(tTrials.map((x) => (x.correct ? 1 : 0))) : 0;
      if (errors > 0.35) reasons.push('Errores frecuentes recientes.');
      const factors = { relevance, need, reliability, progress, transfer, timeCost, overtraining, recency, errors };
      const contributions = {
        relevance: w.relevance * relevance,
        need: w.need * need,
        reliability: w.reliability * reliability,
        progress: w.progress * progress,
        transfer: w.transfer * transfer,
        timeCost: -w.timeCost * timeCost,
        overtraining: -w.overtraining * overtraining,
        recency: w.recency * recency,
        errors: w.errors * errors,
      };
      const score = Object.values(contributions).reduce((a, b) => a + b, 0);
      return { taskId: t.id, module: t.module, score, factors, contributions, reasons };
    })
    .sort((a, b) => b.score - a.score);
}

export const FACTOR_LABEL: Record<string, string> = {
  relevance: 'Relevancia para tus objetivos',
  need: 'Necesidad de entrenamiento',
  reliability: 'Falta de datos (fiabilidad)',
  progress: 'Evidencia de progreso / estancamiento',
  transfer: 'Brecha de generalización',
  timeCost: 'Coste temporal',
  overtraining: 'Riesgo de sobreentrenamiento',
  recency: 'Tiempo desde la última práctica',
  errors: 'Errores recientes',
};

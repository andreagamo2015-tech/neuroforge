import type { BlockRecord, LessonRecord, TaskState, TrialRecord } from './records';
import type { ModuleId, Purpose, Task } from './types';
import { MODULE_NAMES, TRAINABLE_MODULES } from './types';
import { brier, calibrationBins, comparePeriods, mean, median, sd, type PeriodComparison } from './stats';
import { estimateThreshold, generalizationGap, levelIndex, plateau, type ThresholdEstimate } from './engine/adaptive';
import type { AdaptiveParams } from './engine/params';

// Agregados para los paneles. Todo se calcula a partir de registros reales; si no hay datos
// suficientes se devuelve el estado 'insuficiente' en lugar de un número.

export const MASTERY_PURPOSES: Purpose[] = ['training', 'review', 'free', 'baseline', 'familiarization', 'experiment-train'];

export interface SeriesPoint { t: number; y: number; label?: string }

export interface TaskMastery {
  task: Task;
  levelSeries: SeriesPoint[];
  accuracySeries: SeriesPoint[];
  comparison: PeriodComparison;
  levelComparison: PeriodComparison;
  plateau: boolean;
}

export function masteryByTask(tasks: Task[], blocks: BlockRecord[], states: Record<string, TaskState>, p: AdaptiveParams): TaskMastery[] {
  return tasks
    .map((task) => {
      const bs = blocks.filter((b) => b.taskId === task.id && b.variant === 'train' && MASTERY_PURPOSES.includes(b.purpose)).sort((a, b) => a.startedAt - b.startedAt);
      const k = Math.min(3, Math.floor(bs.length / 2));
      return {
        task,
        levelSeries: bs.map((b) => ({ t: b.endedAt, y: b.endLevel })),
        accuracySeries: bs.map((b) => ({ t: b.endedAt, y: b.accuracy })),
        comparison: comparePeriods(bs.slice(0, k).map((b) => b.accuracy), bs.slice(-k || bs.length).map((b) => b.accuracy)),
        levelComparison: comparePeriods(bs.slice(0, k).map((b) => b.startLevel), bs.slice(-k || bs.length).map((b) => b.endLevel)),
        plateau: states[task.id] ? plateau(states[task.id], p).stagnant : false,
      };
    })
    .filter((m) => m.levelSeries.length > 0);
}

export interface TaskGeneralization {
  task: Task;
  series: SeriesPoint[];
  gap: number;
  nNovel: number;
  status: 'ok' | 'insuficiente';
  specificOnly: boolean;
}

export function generalizationByTask(tasks: Task[], blocks: BlockRecord[], states: Record<string, TaskState>, p: AdaptiveParams): TaskGeneralization[] {
  return tasks
    .filter((t) => t.hasNovel)
    .map((task) => {
      const nb = blocks.filter((b) => b.taskId === task.id && b.variant === 'novel').sort((a, b) => a.startedAt - b.startedAt);
      const g = generalizationGap(blocks, task.id);
      const st = states[task.id];
      const trainGain = st && st.history.length >= 4 ? st.level - st.history[0].level : 0;
      return {
        task,
        series: nb.map((b) => ({ t: b.endedAt, y: b.accuracy, label: `nivel ${b.startLevel.toFixed(1)}` })),
        gap: g.gap,
        nNovel: nb.length,
        status: nb.length >= 2 ? 'ok' : 'insuficiente',
        specificOnly: nb.length >= 2 && trainGain >= 1.5 && g.gap > p.generalizationGap,
      } as TaskGeneralization;
    });
}

export interface TransferSummary {
  task: Task;
  series: SeriesPoint[];
  comparison: PeriodComparison;
  rtSeries: SeriesPoint[];
}

export function transferByTask(transferTasks: Task[], blocks: BlockRecord[]): TransferSummary[] {
  return transferTasks.map((task) => {
    const bs = blocks.filter((b) => b.taskId === task.id && b.purpose === 'transfer' && !b.aborted).sort((a, b) => a.startedAt - b.startedAt);
    return {
      task,
      series: bs.map((b) => ({ t: b.endedAt, y: b.accuracy })),
      rtSeries: bs.filter((b) => b.medianRt).map((b) => ({ t: b.endedAt, y: b.medianRt! })),
      comparison: comparePeriods(bs.slice(0, 1).map((b) => b.accuracy), bs.slice(-1).map((b) => b.accuracy), 1),
    };
  });
}

export function learningTransfer(lessons: LessonRecord[]) {
  const tl = lessons.filter((l) => l.transfer && l.immediateAccuracy !== undefined).sort((a, b) => a.startedAt - b.startedAt);
  return {
    immediate: tl.map((l) => ({ t: l.startedAt, y: l.immediateAccuracy! })),
    delayed: tl.filter((l) => l.delayedAccuracy !== undefined).map((l) => ({ t: l.startedAt, y: l.delayedAccuracy! })),
    n: tl.length,
  };
}

export function retentionSummary(lessons: LessonRecord[]) {
  const l = lessons.filter((x) => !x.transfer && x.immediateAccuracy !== undefined);
  const withDelayed = l.filter((x) => x.delayedAccuracy !== undefined);
  return {
    lessons: l.length,
    immediate: mean(l.map((x) => x.immediateAccuracy!)),
    delayed: mean(withDelayed.map((x) => x.delayedAccuracy!)),
    retentionRatio: withDelayed.length ? mean(withDelayed.map((x) => (x.immediateAccuracy! > 0 ? x.delayedAccuracy! / x.immediateAccuracy! : NaN)).filter(Number.isFinite)) : NaN,
    nDelayed: withDelayed.length,
  };
}

// ---------- Perfil multidimensional ----------
export interface TaskProfile {
  task: Task;
  nTrials: number;
  nBlocks: number;
  accuracy: number;
  medianRt: number;
  consistency: number; // DE de la precisión por bloque
  estimate: ThresholdEstimate | null;
  index: number;
  topErrors: { tag: string; n: number }[];
  observedLevel: number;
}

export interface ModuleProfile {
  module: ModuleId;
  name: string;
  tasks: TaskProfile[];
  index: number;
  provisional: boolean;
  nTrials: number;
}

export function taskProfile(task: Task, trials: TrialRecord[], blocks: BlockRecord[], state: TaskState | undefined, p: AdaptiveParams): TaskProfile {
  const tr = trials.filter((t) => t.taskId === task.id && t.variant === 'train' && t.purpose !== 'familiarization');
  const bs = blocks.filter((b) => b.taskId === task.id && b.variant === 'train' && b.purpose !== 'familiarization');
  const guess = task.kind === 'item' && task.id !== 'E-problems' && task.id !== 'E-estimation' && task.id !== 'A-series' ? 0.2 : task.kind === 'speeded' ? 0.5 : 0;
  const est = tr.length >= 5 ? estimateThreshold(task, tr.slice(-120), p, guess) : null;
  const errs = new Map<string, number>();
  tr.filter((t) => !t.correct && t.errorTag).forEach((t) => errs.set(t.errorTag!, (errs.get(t.errorTag!) ?? 0) + 1));
  return {
    task,
    nTrials: tr.length,
    nBlocks: bs.length,
    accuracy: mean(tr.map((t) => (t.correct ? 1 : 0))),
    medianRt: median(tr.filter((t) => t.correct && t.rtMs).map((t) => t.rtMs!)),
    consistency: sd(bs.map((b) => b.accuracy)),
    estimate: est,
    index: est ? levelIndex(task, est.theta) : NaN,
    topErrors: [...errs.entries()].map(([tag, n]) => ({ tag, n })).sort((a, b) => b.n - a.n).slice(0, 3),
    observedLevel: state?.level ?? NaN,
  };
}

export function moduleProfiles(tasks: Task[], trials: TrialRecord[], blocks: BlockRecord[], states: Record<string, TaskState>, p: AdaptiveParams): ModuleProfile[] {
  return TRAINABLE_MODULES.map((m) => {
    const tp = tasks.filter((t) => t.module === m && !t.reserved && t.kind !== 'open').map((t) => taskProfile(t, trials, blocks, states[t.id], p));
    const withIdx = tp.filter((x) => Number.isFinite(x.index));
    const nTrials = tp.reduce((a, x) => a + x.nTrials, 0);
    return {
      module: m,
      name: MODULE_NAMES[m],
      tasks: tp,
      index: withIdx.length ? mean(withIdx.map((x) => x.index)) : NaN,
      provisional: withIdx.length < Math.ceil(tp.length / 2) || withIdx.some((x) => x.estimate?.provisional) || nTrials < p.minObservations * 2,
      nTrials,
    };
  });
}

// ---------- Metacognición ----------
export function calibration(trials: TrialRecord[]) {
  const pairs = trials.filter((t) => t.confidence !== undefined).map((t) => ({ confidence: t.confidence!, correct: t.correct ? 1 : 0 }));
  return {
    n: pairs.length,
    brier: brier(pairs),
    bias: pairs.length ? mean(pairs.map((x) => x.confidence)) - mean(pairs.map((x) => x.correct)) : NaN,
    bins: calibrationBins(pairs),
  };
}

export function errorSummary(trials: TrialRecord[], tasks: Task[], days = 30, now = Date.now()) {
  const map = new Map<string, { taskId: string; tag: string; n: number; last: number }>();
  trials
    .filter((t) => !t.correct && t.errorTag && t.timestamp >= now - days * 86400000)
    .forEach((t) => {
      const k = `${t.taskId}|${t.errorTag}`;
      const e = map.get(k) ?? { taskId: t.taskId, tag: t.errorTag!, n: 0, last: 0 };
      e.n++;
      e.last = Math.max(e.last, t.timestamp);
      map.set(k, e);
    });
  return [...map.values()]
    .sort((a, b) => b.n - a.n)
    .map((e) => {
      const task = tasks.find((t) => t.id === e.taskId);
      return { ...e, taskName: task?.name ?? e.taskId, advice: task?.errorAdvice[e.tag] };
    });
}

export function strategyEffectiveness(trials: TrialRecord[], taskId: string) {
  const map = new Map<string, number[]>();
  trials.filter((t) => t.taskId === taskId && t.strategy).forEach((t) => map.set(t.strategy!, [...(map.get(t.strategy!) ?? []), t.correct ? 1 : 0]));
  return [...map.entries()].map(([strategy, xs]) => ({ strategy, n: xs.length, accuracy: mean(xs) }));
}

/** Módulo E: separa aciertos en ítems que dependen de conocimiento frente a razonamiento. */
export function demandSplit(trials: TrialRecord[]) {
  const e = trials.filter((t) => t.module === 'E' && t.demand);
  const by = (d: string) => e.filter((t) => t.demand === d);
  return {
    razonamiento: { n: by('razonamiento').length, accuracy: mean(by('razonamiento').map((t) => (t.correct ? 1 : 0))) },
    conocimiento: { n: by('conocimiento').length, accuracy: mean(by('conocimiento').map((t) => (t.correct ? 1 : 0))) },
  };
}

/** Módulo B: rendimiento en secuencias agrupables frente a no agrupables. */
export function chunkingSplit(trials: TrialRecord[]) {
  const b = trials.filter((t) => t.taskId === 'B-backward' && t.condition);
  const chunk = b.filter((t) => t.condition === 'agrupable');
  const noChunk = b.filter((t) => t.condition === 'no-agrupable');
  return {
    agrupable: { n: chunk.length, accuracy: mean(chunk.map((t) => (t.correct ? 1 : 0))) },
    noAgrupable: { n: noChunk.length, accuracy: mean(noChunk.map((t) => (t.correct ? 1 : 0))) },
  };
}

/**
 * Tendencia reciente por módulo: nivel alcanzado (normalizado 0–100 dentro de cada tarea) en los
 * últimos 7 días frente a los 7 anteriores. Se usa el nivel y no la precisión porque la escalera
 * adaptativa mantiene la precisión cerca del objetivo a propósito.
 */
export function recentTrend(blocks: BlockRecord[], tasks: Task[], module: ModuleId, now = Date.now()) {
  const d = 86400000;
  const norm = (b: BlockRecord) => {
    const t = tasks.find((x) => x.id === b.taskId);
    return t ? ((b.endLevel - t.minLevel) / (t.maxLevel - t.minLevel)) * 100 : NaN;
  };
  const sel = blocks.filter((b) => b.module === module && b.variant === 'train' && MASTERY_PURPOSES.includes(b.purpose));
  const a = sel.filter((b) => b.startedAt >= now - 14 * d && b.startedAt < now - 7 * d).map(norm);
  const b = sel.filter((x) => x.startedAt >= now - 7 * d).map(norm);
  return comparePeriods(a, b, 3);
}

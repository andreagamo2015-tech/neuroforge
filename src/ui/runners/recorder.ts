import { useRef } from 'react';
import { uid } from '../../core/rng';
import type { BlockRecord, TaskState, TrialRecord } from '../../core/records';
import type { Purpose, Task, Variant } from '../../core/types';
import { clampLevel } from '../../core/registry';
import { applyBlockEnd, updateLevelAfterSpeedBlock, updateLevelAfterTrial } from '../../core/engine/adaptive';
import { useStore } from '../../data/store';
import { currentInputType } from '../hooks';

export interface BlockSpec {
  taskId: string;
  purpose: Purpose;
  variant: Variant;
  sessionId: string;
  focus?: string;
  levelOffset?: number;
  fixedLevels?: number[];
  nItems?: number;
  experimentId?: string;
  experimentArm?: 'A' | 'B';
  experimentPhase?: BlockRecord['experimentPhase'];
  reason?: string;
}

export interface TrialInput {
  correct: boolean;
  score?: number;
  rtMs: number | null;
  confidence?: number;
  errorTag?: string;
  focusKey?: string;
  demand?: 'razonamiento' | 'conocimiento';
  signature?: string;
  condition?: string;
  strategy?: string;
  /** Nivel al que se presentó el ensayo (por defecto, el nivel de trabajo actual). */
  level?: number;
}

/**
 * Registra ensayos y bloques, y aplica el motor adaptativo.
 * - El nivel de trabajo se adapta dentro del bloque.
 * - El nivel GUARDADO solo cambia en bloques de entrenamiento/práctica libre sin desplazamiento
 *   (calentamiento, revisión, sesión ligera, sondeos y transferencia no lo alteran).
 */
export function useBlockRecorder(task: Task, spec: BlockSpec) {
  const store = useStore();
  const initial = store.states[task.id];
  const offset = spec.levelOffset ?? 0;
  const fixed = !!spec.fixedLevels?.length;
  const adaptsStored = !fixed && offset === 0 && ['training', 'free', 'baseline', 'experiment-train'].includes(spec.purpose);
  const adaptsWorking = !fixed && spec.purpose !== 'familiarization';
  const ref = useRef<{
    state: TaskState;
    level: number;
    startLevel: number;
    trials: TrialRecord[];
    blockId: string;
    startedAt: number;
    reasons: string[];
  } | null>(null);
  if (!ref.current) {
    const start = clampLevel(task, fixed ? spec.fixedLevels![0] : spec.purpose === 'familiarization' ? task.minLevel : initial.level + offset);
    ref.current = { state: initial, level: start, startLevel: start, trials: [], blockId: uid('blk'), startedAt: Date.now(), reasons: [] };
  }
  const r = ref.current;

  const seen = () => new Set(r.state.seen);
  const level = () => r.level;
  const fixedLevelAt = (i: number) => (fixed ? spec.fixedLevels![i % spec.fixedLevels!.length] : r.level);

  function recordTrial(t: TrialInput, adaptTrial = true): TrialRecord {
    const rec: TrialRecord = {
      id: uid('tr'),
      sessionId: spec.sessionId,
      blockId: r.blockId,
      taskId: task.id,
      module: task.module,
      purpose: spec.purpose,
      variant: spec.variant,
      level: t.level ?? r.level,
      correct: t.correct,
      score: t.score ?? (t.correct ? 1 : 0),
      rtMs: t.rtMs,
      confidence: t.confidence,
      errorTag: t.correct ? undefined : t.errorTag,
      focusKey: t.focusKey,
      strategy: t.strategy,
      demand: t.demand,
      signature: t.signature,
      condition: t.condition,
      inputType: currentInputType(),
      timestamp: Date.now(),
    };
    r.trials.push(rec);
    void store.upsert('trials', [rec]);
    const consecutiveErrors = t.correct ? 0 : r.state.consecutiveErrors + 1;
    let nextLevel = r.level;
    if (adaptTrial && adaptsWorking) {
      const upd = updateLevelAfterTrial(task, { ...r.state, level: r.level }, t.correct, store.params);
      nextLevel = upd.level;
      if (r.reasons[r.reasons.length - 1] !== upd.reason) r.reasons.push(upd.reason);
    }
    r.level = nextLevel;
    r.state = {
      ...r.state,
      level: adaptsStored && adaptTrial ? nextLevel : r.state.level,
      trials: r.state.trials + 1,
      consecutiveErrors,
      needsWorkedExample: consecutiveErrors >= store.params.workedExampleAfterErrors,
      seen: t.signature ? [...r.state.seen.slice(-499), t.signature] : r.state.seen,
      lastPracticed: Date.now(),
    };
    return rec;
  }

  /** Añade información al último ensayo (p. ej. la estrategia declarada tras el feedback). */
  function annotateLast(patch: Partial<TrialRecord>) {
    const last = r.trials[r.trials.length - 1];
    if (!last) return;
    Object.assign(last, patch);
    void store.upsert('trials', [{ ...last }]);
  }

  function needsWorkedExample() {
    return r.state.needsWorkedExample;
  }
  function clearWorkedExample() {
    r.state = { ...r.state, needsWorkedExample: false, consecutiveErrors: 0 };
  }

  /** Cierra el bloque. Para tareas cronometradas aplica la regla de bloque. */
  async function finish(o: { accuracy: number; medianRt: number | null; extra?: Record<string, number>; summary?: string[]; speeded?: boolean; simpleRtMs?: number; strategy?: string; payload?: unknown; aborted?: boolean }): Promise<{ block: BlockRecord; reason: string }> {
    let reason = r.reasons.slice(-1)[0] ?? 'Nivel fijo (medición).';
    if (o.speeded && adaptsWorking && !o.aborted) {
      const upd = updateLevelAfterSpeedBlock(task, { ...r.state, level: r.level }, o.accuracy, store.params);
      r.level = upd.level;
      reason = upd.reason;
      if (adaptsStored) r.state = { ...r.state, level: upd.level };
    }
    if (!adaptsStored && !fixed) reason += ' (Este tipo de bloque no modifica tu nivel guardado.)';
    const block: BlockRecord = {
      id: r.blockId,
      sessionId: spec.sessionId,
      taskId: task.id,
      module: task.module,
      purpose: spec.purpose,
      variant: spec.variant,
      startLevel: r.startLevel,
      endLevel: r.level,
      nTrials: r.trials.length,
      accuracy: o.accuracy,
      medianRt: o.medianRt,
      extra: o.extra ?? {},
      summary: o.summary ?? [],
      startedAt: r.startedAt,
      endedAt: Date.now(),
      inputType: currentInputType(),
      simpleRtMs: o.simpleRtMs,
      strategy: o.strategy,
      experimentId: spec.experimentId,
      experimentArm: spec.experimentArm,
      experimentPhase: spec.experimentPhase,
      payload: o.payload,
      aborted: o.aborted,
    };
    if (spec.purpose !== 'familiarization' && !o.aborted) {
      r.state = applyBlockEnd(r.state, { accuracy: o.accuracy, purpose: spec.purpose, variant: spec.variant, level: r.startLevel });
    }
    await Promise.all([store.upsert('blocks', [block]), store.upsert('taskStates', [r.state])]);
    return { block, reason };
  }

  return { level, fixedLevelAt, seen, recordTrial, annotateLast, finish, needsWorkedExample, clearWorkedExample, trials: () => r.trials, startLevel: r.startLevel, fixed, adaptsStored };
}

export type Recorder = ReturnType<typeof useBlockRecorder>;

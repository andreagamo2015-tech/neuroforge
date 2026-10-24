import { describe, expect, it } from 'vitest';
import { getTask, TASKS } from '../src/core/registry';
import { DEFAULT_PARAMS, resolveParams } from '../src/core/engine/params';
import { applyBlockEnd, applyTrial, estimateThreshold, initialTaskState, novelProbeDue, plateau, updateLevelAfterSpeedBlock, updateLevelAfterTrial } from '../src/core/engine/adaptive';
import { simulateStaircase } from '../src/core/engine/simulate';
import { prioritize } from '../src/core/engine/selection';
import { planSession, TRANSFER_FORMS } from '../src/core/engine/session';
import { programStatus, weeklyMinutes } from '../src/core/engine/program';
import type { BlockRecord, TaskState, TrialRecord } from '../src/core/records';
import { comparePeriods, dPrime, brier, median } from '../src/core/stats';

const p = DEFAULT_PARAMS;
const DAY = 86400000;

function fakeBlock(taskId: string, o: Partial<BlockRecord> = {}): BlockRecord {
  const t = getTask(taskId);
  return { id: Math.random().toString(36), sessionId: 's', taskId, module: t.module, purpose: 'training', variant: 'train', startLevel: 3, endLevel: 3, nTrials: 6, accuracy: 0.8, medianRt: 1000, extra: {}, summary: [], startedAt: Date.now(), endedAt: Date.now(), inputType: 'teclado', ...o };
}

describe('Motor adaptativo: escalera', () => {
  const task = getTask('A-series');
  it('un acierto sube y un error baja más (escalera ponderada)', () => {
    const st = { ...initialTaskState(task), level: 5 };
    const up = updateLevelAfterTrial(task, st, true, p);
    const down = updateLevelAfterTrial(task, st, false, p);
    expect(up.level).toBeCloseTo(5 + p.baseStep);
    expect(down.level).toBeCloseTo(5 - (p.baseStep * p.targetAccuracy) / (1 - p.targetAccuracy));
  });
  it('respeta los límites de nivel', () => {
    const st = { ...initialTaskState(task), level: task.maxLevel };
    expect(updateLevelAfterTrial(task, st, true, p).level).toBe(task.maxLevel);
    expect(updateLevelAfterTrial(task, { ...st, level: task.minLevel }, false, p).level).toBe(task.minLevel);
  });
  it('alta variabilidad reduce el paso (regla 7)', () => {
    const st: TaskState = { ...initialTaskState(task), level: 5, history: [0.2, 0.9, 0.3, 0.95].map((a) => ({ t: 0, level: 5, accuracy: a, purpose: 'training', variant: 'train' })) };
    const upd = updateLevelAfterTrial(task, st, true, p);
    expect(upd.level).toBeCloseTo(5 + p.baseStep * p.variabilityStepFactor);
    expect(upd.reason).toMatch(/Variabilidad/);
  });
  it('la dificultad cambia realmente y converge cerca del umbral simulado', () => {
    for (const theta of [3, 6, 8]) {
      const r = simulateStaircase(task, theta, 400, p, 42);
      // con objetivo 80 % la escalera converge por debajo del umbral del 50 %
      expect(r.finalMean).toBeGreaterThan(theta - 2.5);
      expect(r.finalMean).toBeLessThan(theta + 0.5);
      expect(r.accuracy).toBeGreaterThan(0.65);
      expect(r.accuracy).toBeLessThan(0.92);
    }
    const lo = simulateStaircase(task, 3, 300, p, 7).finalMean;
    const hi = simulateStaircase(task, 8, 300, p, 7).finalMean;
    expect(hi - lo).toBeGreaterThan(3);
  });
  it('dos errores seguidos activan el ejemplo resuelto (regla 2)', () => {
    let st = { ...initialTaskState(task), level: 5 };
    st = applyTrial(task, st, false, p).state;
    expect(st.needsWorkedExample).toBe(false);
    st = applyTrial(task, st, false, p).state;
    expect(st.needsWorkedExample).toBe(true);
    st = applyTrial(task, st, true, p).state;
    expect(st.needsWorkedExample).toBe(false);
  });
});

describe('Motor adaptativo: bloques cronometrados', () => {
  const task = getTask('C-flanker');
  const st = { ...initialTaskState(task), level: 4 };
  it('sube con precisión alta, baja con precisión baja y se mantiene en medio', () => {
    expect(updateLevelAfterSpeedBlock(task, st, 0.95, p).level).toBe(5);
    expect(updateLevelAfterSpeedBlock(task, st, 0.6, p).level).toBe(3);
    expect(updateLevelAfterSpeedBlock(task, st, 0.8, p).level).toBe(4);
  });
  it('subir de nivel endurece la tarea (límite de tiempo más corto)', () => {
    const t = getTask('C-flanker');
    if (t.kind !== 'speeded') throw new Error();
    expect(t.timeoutMs(8)).toBeLessThan(t.timeoutMs(2));
  });
});

describe('Reglas 3, 4 y 8', () => {
  const task = getTask('A-matrices');
  it('programa una variante nueva tras N bloques', () => {
    let st = initialTaskState(task);
    for (let i = 0; i < p.novelProbeEveryBlocks + 1; i++) st = applyBlockEnd(st, { accuracy: 0.8, purpose: 'training', variant: 'train', level: 3 });
    expect(novelProbeDue(task, st, p).due).toBe(true);
    st = applyBlockEnd(st, { accuracy: 0.6, purpose: 'novel', variant: 'novel', level: 3 });
    expect(novelProbeDue(task, st, p).due).toBe(false);
  });
  it('detecta estancamiento cuando el nivel no se mueve', () => {
    const st: TaskState = { ...initialTaskState(task), history: Array.from({ length: 6 }, () => ({ t: 0, level: 4, accuracy: 0.75, purpose: 'training' as const, variant: 'train' as const })) };
    expect(plateau(st, p).stagnant).toBe(true);
    const rising: TaskState = { ...st, history: st.history.map((h, i) => ({ ...h, level: 3 + i * 0.5 })) };
    expect(plateau(rising, p).stagnant).toBe(false);
  });
  it('una tarea estancada o sobreentrenada pierde prioridad', () => {
    const tasks = TASKS.filter((t) => !t.reserved && t.kind !== 'open');
    const states: Record<string, TaskState> = Object.fromEntries(tasks.map((t) => [t.id, initialTaskState(t)]));
    const now = Date.now();
    const base = prioritize({ tasks, states, blocks: [], trials: [], goals: {}, params: p, now });
    const scoreBase = base.find((r) => r.taskId === 'A-series')!.score;
    const blocks = Array.from({ length: 10 }, () => fakeBlock('A-series', { startedAt: now - DAY }));
    const r2 = prioritize({ tasks, states, blocks, trials: [], goals: {}, params: p, now });
    const a = r2.find((r) => r.taskId === 'A-series')!;
    expect(a.contributions.overtraining).toBeLessThan(0);
    expect(a.score).toBeLessThan(scoreBase);
  });
  it('la relevancia del objetivo cambia el orden', () => {
    const tasks = TASKS.filter((t) => !t.reserved && t.kind !== 'open');
    const states: Record<string, TaskState> = Object.fromEntries(tasks.map((t) => [t.id, initialTaskState(t)]));
    const r = prioritize({ tasks, states, blocks: [], trials: [], goals: { A: 0, B: 0, C: 0, D: 0, E: 2 }, params: p, now: Date.now() });
    expect(r[0].module).toBe('E');
  });
});

describe('Estimación latente', () => {
  it('estima más alto cuando se acierta en niveles altos, y marca provisional con pocos datos', () => {
    const task = getTask('A-series');
    const mk = (lvl: number, correct: boolean) => ({ level: lvl, correct });
    const strong = Array.from({ length: 40 }, (_, i) => mk(6 + (i % 3), i % 5 !== 0));
    const weak = Array.from({ length: 40 }, (_, i) => mk(2 + (i % 3), i % 2 === 0));
    expect(estimateThreshold(task, strong, p).theta).toBeGreaterThan(estimateThreshold(task, weak, p).theta + 2);
    expect(estimateThreshold(task, strong.slice(0, 5), p).provisional).toBe(true);
  });
  it('no extrapola más allá de los niveles observados (solo aciertos a nivel 1)', () => {
    const task = getTask('C-flanker');
    const est = estimateThreshold(task, Array.from({ length: 30 }, () => ({ level: 1, correct: true })), p);
    expect(est.theta).toBeLessThanOrEqual(2);
    expect(est.provisional).toBe(true);
  });
});

describe('Planificador de sesión', () => {
  const tasks = TASKS;
  const states: Record<string, TaskState> = Object.fromEntries(tasks.map((t) => [t.id, initialTaskState(t)]));
  const prog = programStatus(Date.now() - 20 * DAY, Date.now(), []);
  it('incluye calentamiento, prioritaria, secundaria y transferencia, y respeta la duración', () => {
    for (const minutes of [10, 20, 30, 45]) {
      const plan = planSession({ tasks, states, blocks: [], trials: [], goals: {}, params: p }, { minutes, program: prog, now: Date.now() });
      const total = plan.blocks.reduce((a, b) => a + b.estSeconds, 0);
      expect(total).toBeLessThanOrEqual(minutes * 60 + 240);
      expect(plan.blocks.some((b) => b.role === 'prioritaria')).toBe(true);
      if (minutes >= 20) {
        expect(plan.blocks[0].role).toBe('calentamiento');
        expect(plan.blocks.some((b) => b.role === 'secundaria')).toBe(true);
        expect(plan.blocks.some((b) => b.role === 'transferencia' && b.purpose === 'transfer' && TRANSFER_FORMS[b.taskId])).toBe(true);
      }
    }
  });
  it('fatiga alta → sesión ligera sin tareas pesadas y con dificultad reducida (regla 5)', () => {
    const plan = planSession({ tasks, states, blocks: [], trials: [], goals: {}, params: p }, { minutes: 45, fatigue: 5, program: prog, now: Date.now() });
    expect(plan.light).toBe(true);
    expect(plan.blocks.reduce((a, b) => a + b.estSeconds, 0)).toBeLessThanOrEqual(10 * 60 + 240);
    expect(plan.blocks.every((b) => !['B-complex', 'A-constraints', 'D-sorting'].includes(b.taskId))).toBe(true);
    expect(plan.blocks.filter((b) => b.role !== 'calentamiento').every((b) => b.levelOffset <= -1 || b.purpose === 'transfer')).toBe(true);
  });
  it('nunca planifica tareas reservadas como entrenamiento', () => {
    const plan = planSession({ tasks, states, blocks: [], trials: [], goals: {}, params: p }, { minutes: 45, program: prog, now: Date.now() });
    plan.blocks.filter((b) => getTask(b.taskId).reserved).forEach((b) => expect(b.purpose).toBe('transfer'));
  });
  it('programa revisión dirigida cuando hay errores recurrentes', () => {
    const now = Date.now();
    const trials: TrialRecord[] = Array.from({ length: 5 }, (_, i) => ({ id: `t${i}`, sessionId: 's', blockId: 'b', taskId: 'A-series', module: 'A', purpose: 'training', variant: 'train', level: 4, correct: false, score: 0, rtMs: 1000, errorTag: 'regla-incompleta', focusKey: 'fibonacci', inputType: 'teclado', timestamp: now - 1000 }));
    const plan = planSession({ tasks, states, blocks: [], trials, goals: {}, params: p }, { minutes: 30, program: prog, lastTransferAt: now, now });
    const rev = plan.blocks.find((b) => b.role === 'revision');
    expect(rev?.taskId).toBe('A-series');
    expect(rev?.focus).toBe('fibonacci');
  });
});

describe('Programa y estadística', () => {
  it('fases del programa por semana', () => {
    const start = new Date(2026, 0, 5).getTime();
    expect(programStatus(start, start + 2 * DAY, []).phase.id).toBe(1);
    expect(programStatus(start, start + 10 * DAY, []).phase.id).toBe(2);
    expect(programStatus(start, start + 7 * 7 * DAY + DAY, []).phase.id).toBe(4);
    expect(programStatus(start, start + 11 * 7 * DAY + DAY, []).phase.id).toBe(6);
    expect(programStatus(start, start + 12 * 7 * DAY + DAY, []).cycle).toBe(2);
  });
  it('minutos semanales a partir de sesiones reales', () => {
    const now = Date.now();
    const w = weeklyMinutes([{ startedAt: now, activeSeconds: 600 }, { startedAt: now - 1000, activeSeconds: 300 }], 4, now);
    expect(w).toHaveLength(4);
    expect(w[3].minutes).toBe(15);
    expect(w[0].minutes).toBe(0);
  });
  it('comparación de periodos marca evidencia insuficiente', () => {
    expect(comparePeriods([0.5], [0.9]).status).toBe('insuficiente');
    const c = comparePeriods([0.5, 0.6, 0.55], [0.8, 0.85, 0.9]);
    expect(c.status).toBe('ok');
    expect(c.diff).toBeCloseTo(0.3, 6);
  });
  it('d′, Brier y mediana', () => {
    expect(dPrime(10, 0, 0, 10)).toBeGreaterThan(2.5);
    expect(Math.abs(dPrime(5, 5, 5, 5))).toBeLessThan(1e-9);
    expect(brier([{ confidence: 1, correct: 1 }, { confidence: 0, correct: 0 }])).toBe(0);
    expect(median([3, 1, 2])).toBe(2);
  });
  it('los parámetros se pueden sobrescribir', () => {
    const r = resolveParams({ targetAccuracy: 0.7, weights: { need: 3 } as never });
    expect(r.targetAccuracy).toBe(0.7);
    expect(r.weights.need).toBe(3);
    expect(r.weights.relevance).toBe(DEFAULT_PARAMS.weights.relevance);
  });
});

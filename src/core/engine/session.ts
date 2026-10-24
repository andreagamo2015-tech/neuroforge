import type { BlockRecord, TaskState, TrialRecord } from '../records';
import type { ModuleId, Purpose, Task, Variant } from '../types';
import { MODULE_NAMES } from '../types';
import { novelProbeDue } from './adaptive';
import type { AdaptiveParams } from './params';
import type { ProgramStatus } from './program';
import { prioritize, type PriorityBreakdown, type SelectionContext } from './selection';

// Planificador de sesión: calentamiento → habilidad prioritaria → segunda habilidad →
// transferencia → revisión de errores → resumen.

export type BlockRole = 'calentamiento' | 'prioritaria' | 'secundaria' | 'transferencia' | 'revision' | 'adicional';

export interface PlannedBlock {
  taskId: string;
  purpose: Purpose;
  variant: Variant;
  role: BlockRole;
  focus?: string;
  levelOffset: number;
  estSeconds: number;
  reason: string;
  /** Nivel fijo (pruebas de transferencia: formas paralelas de dificultad constante). */
  fixedLevels?: number[];
}

export interface SessionPlan {
  minutes: number;
  light: boolean;
  blocks: PlannedBlock[];
  notes: string[];
  ranking: PriorityBreakdown[];
}

export interface PlanInput {
  minutes: number;
  fatigue?: number;
  program: ProgramStatus;
  lastTransferAt?: number;
  now: number;
}

/** Formas paralelas del banco de transferencia: dificultad fija para comparar en el tiempo. */
export const TRANSFER_FORMS: Record<string, number[]> = {
  'T-letters': [2, 3, 5, 6, 8, 9],
  'T-operations': [2, 4, 6, 8, 9],
  'T-applied': [3, 5, 7, 9],
};

const WARMUP_TASKS = ['C-symbols', 'C-flanker', 'C-search', 'C-gonogo'];
const HEAVY_TASKS = ['B-complex', 'A-constraints', 'D-sorting'];
const DAY = 86400000;

export function errorHotspots(trials: TrialRecord[], now: number, tasks: Task[]): { taskId: string; focusKey: string; errors: number }[] {
  const recent = trials.filter((t) => t.timestamp >= now - 14 * DAY && !t.correct && t.focusKey && t.purpose !== 'transfer');
  const counts = new Map<string, number>();
  for (const t of recent) {
    const task = tasks.find((x) => x.id === t.taskId);
    if (!task || task.kind !== 'item') continue;
    const k = `${t.taskId}|${t.focusKey}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([k, errors]) => ({ taskId: k.split('|')[0], focusKey: k.split('|')[1], errors }))
    .filter((x) => x.errors >= 2)
    .sort((a, b) => b.errors - a.errors);
}

export function planSession(
  ctxBase: { tasks: Task[]; states: Record<string, TaskState>; blocks: BlockRecord[]; trials: TrialRecord[]; goals: Partial<Record<ModuleId, number>>; params: AdaptiveParams },
  input: PlanInput,
): SessionPlan {
  const p = ctxBase.params;
  const notes: string[] = [];
  const light = (input.fatigue ?? 0) >= p.fatigueLightThreshold;
  let budget = (light ? Math.min(input.minutes, 10) : input.minutes) * 60;
  if (light) notes.push('Fatiga alta declarada: sesión ligera, más corta y con la dificultad un nivel por debajo. Descansar también forma parte del programa.');
  const levelOffset = light ? -1 : 0;
  const phase = input.program.phase.id;

  const trainable = ctxBase.tasks.filter((t) => !t.reserved && t.kind !== 'open' && !(light && HEAVY_TASKS.includes(t.id)));
  const ctx: SelectionContext = { ...ctxBase, tasks: trainable, now: input.now };
  // En la fase 1 se prioriza conocer todas las tareas (más peso a la falta de datos)
  if (phase === 1) ctx.params = { ...p, weights: { ...p.weights, reliability: p.weights.reliability * 2.5 } };
  const ranking = prioritize(ctx);
  const blocks: PlannedBlock[] = [];
  const used = new Set<string>();
  const add = (b: PlannedBlock) => {
    blocks.push(b);
    used.add(b.taskId);
    budget -= b.estSeconds;
  };
  const taskOf = (id: string) => ctxBase.tasks.find((t) => t.id === id)!;
  const variantFor = (t: Task): { variant: Variant; purpose: Purpose; why?: string } => {
    const st = ctxBase.states[t.id];
    if (st) {
      const nd = novelProbeDue(t, st, p);
      if (nd.due || (phase === 4 && t.hasNovel && st.blocks >= 2 && st.blocksSinceNovel >= 2)) return { variant: 'novel', purpose: 'novel', why: `Variante nueva para comprobar la generalización (${nd.due ? nd.reason : 'fase 4: contextos nuevos'}).` };
    }
    return { variant: 'train', purpose: 'training' };
  };

  // 1. Calentamiento breve (salvo sesiones de 10 min con poco margen)
  if (input.minutes >= 20 || !light) {
    const warm = ranking.filter((r) => WARMUP_TASKS.includes(r.taskId)).sort((a, b) => (ctxBase.states[a.taskId]?.lastPracticed ?? 0) - (ctxBase.states[b.taskId]?.lastPracticed ?? 0))[0];
    if (warm) add({ taskId: warm.taskId, purpose: 'training', variant: 'train', role: 'calentamiento', levelOffset: levelOffset - 1, estSeconds: taskOf(warm.taskId).blockSeconds, reason: 'Calentamiento breve a un nivel cómodo.' });
  }
  // 2. Habilidad prioritaria
  const first = ranking.find((r) => !used.has(r.taskId) && !WARMUP_TASKS.includes(r.taskId)) ?? ranking.find((r) => !used.has(r.taskId));
  if (first) {
    const t = taskOf(first.taskId);
    const v = variantFor(t);
    add({ taskId: t.id, purpose: v.purpose, variant: v.variant, role: 'prioritaria', levelOffset, estSeconds: t.blockSeconds, reason: v.why ?? (first.reasons[0] ?? `Mayor prioridad según el algoritmo (${first.score.toFixed(2)}).`) });
  }
  // 3. Segunda habilidad (otro módulo)
  const second = ranking.find((r) => !used.has(r.taskId) && r.module !== first?.module);
  if (second && budget > 60) {
    const t = taskOf(second.taskId);
    const v = variantFor(t);
    add({ taskId: t.id, purpose: v.purpose, variant: v.variant, role: 'secundaria', levelOffset, estSeconds: t.blockSeconds, reason: v.why ?? (second.reasons[0] ?? `Segunda prioridad, de ${MODULE_NAMES[second.module].toLowerCase()}.`) });
  }
  // 4. Transferencia
  const transferDue = !input.lastTransferAt || input.now - input.lastTransferAt >= p.transferEveryDays * DAY || (phase === 5 && input.now - input.lastTransferAt > 3 * DAY);
  if (!light && input.minutes >= 20 && budget > 90) {
    if (transferDue) {
      const doneIds = new Set(ctxBase.blocks.filter((b) => b.purpose === 'transfer' && input.lastTransferAt && b.startedAt >= input.lastTransferAt - DAY).map((b) => b.taskId));
      const tid = Object.keys(TRANSFER_FORMS).find((id) => !doneIds.has(id)) ?? 'T-letters';
      const t = taskOf(tid);
      add({ taskId: tid, purpose: 'transfer', variant: 'train', role: 'transferencia', levelOffset: 0, estSeconds: t.blockSeconds, fixedLevels: TRANSFER_FORMS[tid], reason: 'Prueba de transferencia (tarea reservada, nunca entrenada, dificultad fija).' });
    } else {
      const cand = ranking.find((r) => !used.has(r.taskId) && taskOf(r.taskId).hasNovel);
      if (cand) {
        const t = taskOf(cand.taskId);
        add({ taskId: t.id, purpose: 'novel', variant: 'novel', role: 'transferencia', levelOffset: -1, estSeconds: t.blockSeconds, reason: `Variante nueva: ${t.novelDescription ?? 'material distinto'}.` });
      }
    }
  }
  // 5. Revisión de errores recurrentes
  const hot = errorHotspots(ctxBase.trials, input.now, trainable)[0];
  if (hot && budget > 60) {
    const t = taskOf(hot.taskId);
    add({ taskId: t.id, purpose: 'review', variant: 'train', role: 'revision', focus: hot.focusKey, levelOffset: -1, estSeconds: Math.round(t.blockSeconds * 0.7), reason: `Revisión dirigida: ${hot.errors} errores recientes en «${hot.focusKey}».` });
  }
  // 6. Bloques adicionales si sobra tiempo (alternando módulos)
  let guard = 0;
  while (budget > 75 && guard++ < 10) {
    const lastModule = blocks.length ? taskOf(blocks[blocks.length - 1].taskId).module : undefined;
    const next = ranking.find((r) => !used.has(r.taskId) && r.module !== lastModule) ?? ranking.find((r) => !used.has(r.taskId));
    if (!next) break;
    const t = taskOf(next.taskId);
    if (t.blockSeconds > budget + 60) { used.add(t.id); continue; }
    add({ taskId: t.id, purpose: 'training', variant: 'train', role: 'adicional', levelOffset, estSeconds: t.blockSeconds, reason: next.reasons[0] ?? 'Práctica variada adicional.' });
  }
  if (input.program.isRestDay) notes.push('Hoy es uno de tus días de descanso sugeridos. Puedes entrenar si quieres, pero descansar no rompe nada.');
  if (phase === 5) notes.push('Fase de retención y transferencia: se priorizan las mediciones sobre la práctica nueva.');
  return { minutes: input.minutes, light, blocks, notes, ranking };
}

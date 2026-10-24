import { createRng, randomSeed, type Rng } from './rng';
import type { Item, ItemTask, ModuleId, SeqTrial, SequenceTask, Task, Variant } from './types';
import { seriesTask } from './tasks/series';
import { matricesTask } from './tasks/matrices';
import { analogiesTask } from './tasks/analogies';
import { deductionTask, contradictionTask } from './tasks/ordering';
import { constraintsTask } from './tasks/constraints';
import { quantProblemsTask, estimationTask } from './tasks/quantitative';
import { probabilityTask } from './tasks/probability';
import { logicTask } from './tasks/logic';
import { jugsTask } from './tasks/jugs';
import { backwardSpanTask, updatingTask, filteringTask, complexSpanTask, integrationTask } from './tasks/memory';
import { symbolCompareTask, visualSearchTask, flankerTask, goNoGoTask, nbackTask, switchingTask, sortingTask } from './tasks/speeded';
import { altUsesTask, altSolutionsTask, remoteAssocTask } from './tasks/divergent';
import { letterSeriesTask, operationsTask, appliedTask } from './tasks/transfer';

export const TASKS: Task[] = [
  seriesTask, matricesTask, analogiesTask, deductionTask, constraintsTask,
  backwardSpanTask, nbackTask, updatingTask, filteringTask, complexSpanTask, integrationTask,
  symbolCompareTask, visualSearchTask, flankerTask, goNoGoTask,
  switchingTask, sortingTask, jugsTask, contradictionTask,
  quantProblemsTask, probabilityTask, logicTask, estimationTask,
  altUsesTask, altSolutionsTask, remoteAssocTask,
  letterSeriesTask, operationsTask, appliedTask,
];

export const TASK_BY_ID: Record<string, Task> = Object.fromEntries(TASKS.map((t) => [t.id, t]));

export function getTask(id: string): Task {
  const t = TASK_BY_ID[id];
  if (!t) throw new Error(`Tarea desconocida: ${id}`);
  return t;
}

/** Tareas entrenables (excluye el banco de transferencia y las abiertas). */
export const TRAINING_TASKS = TASKS.filter((t) => !t.reserved && t.kind !== 'open');
export const TRANSFER_TASKS = TASKS.filter((t) => t.reserved);
export const OPEN_TASKS = TASKS.filter((t) => t.kind === 'open');

export function tasksOfModule(m: ModuleId): Task[] {
  return TASKS.filter((t) => t.module === m && !t.reserved);
}

/**
 * Genera un ítem válido y no visto. Si el validador detecta un problema (ambigüedad,
 * respuesta incorrecta…), el ítem se descarta y se genera otro. Nunca se presenta un
 * ítem que no haya superado la validación.
 */
export function generateValidItem(task: ItemTask, level: number, variant: Variant, seen: Set<string> = new Set(), focus?: string, rng?: Rng): Item {
  let lastErr: string[] = [];
  for (let attempt = 0; attempt < 60; attempt++) {
    const r = rng ?? createRng(randomSeed());
    let item: Item;
    try {
      item = task.generate(r, level, variant, attempt < 30 ? focus : undefined);
    } catch (e) {
      lastErr = [String(e)];
      continue;
    }
    const errs = task.validate(item);
    if (errs.length) { lastErr = errs; continue; }
    if (seen.has(item.signature) && attempt < 50) continue;
    return item;
  }
  throw new Error(`No se pudo generar un ítem válido para ${task.id}: ${lastErr.join('; ')}`);
}

export function generateItemBlock(task: ItemTask, level: number, variant: Variant, n: number, seen: Set<string>, focus?: string): Item[] {
  if (task.generateBlock) {
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        const items = task.generateBlock(createRng(randomSeed()), level, variant, n);
        if (items.every((it) => task.validate(it).length === 0)) return items;
      } catch {
        /* reintentar */
      }
    }
  }
  const out: Item[] = [];
  const localSeen = new Set(seen);
  for (let i = 0; i < n; i++) {
    const it = generateValidItem(task, level, variant, localSeen, focus);
    localSeen.add(it.signature);
    out.push(it);
  }
  return out;
}

export function generateValidTrial(task: SequenceTask, level: number, variant: Variant, seen: Set<string> = new Set()): SeqTrial {
  for (let attempt = 0; attempt < 60; attempt++) {
    const t = task.generate(createRng(randomSeed()), level, variant);
    if (task.validate(t).length) continue;
    if (seen.has(t.signature) && attempt < 50) continue;
    return t;
  }
  throw new Error(`No se pudo generar un ensayo válido para ${task.id}`);
}

export function clampLevel(task: Task, level: number): number {
  return Math.max(task.minLevel, Math.min(task.maxLevel, level));
}

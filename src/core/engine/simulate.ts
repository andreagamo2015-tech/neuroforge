import { createRng } from '../rng';
import type { Task } from '../types';
import type { TaskState } from '../records';
import { applyTrial, initialTaskState } from './adaptive';
import type { AdaptiveParams } from './params';

// Simulación de un respondedor sintético con umbral conocido para comprobar que la escalera
// converge y que el motor realmente cambia la dificultad.

export interface SimResult { levels: number[]; finalMean: number; accuracy: number }

export function simulateStaircase(task: Task, trueTheta: number, nTrials: number, p: AdaptiveParams, seed = 1, guess = 0): SimResult {
  const rng = createRng(seed);
  let st: TaskState = initialTaskState(task);
  const levels: number[] = [];
  let correctN = 0;
  for (let i = 0; i < nTrials; i++) {
    levels.push(st.level);
    const pc = guess + (1 - guess) / (1 + Math.exp(-1.2 * (trueTheta - st.level)));
    const correct = rng.next() < pc;
    if (correct) correctN++;
    st = applyTrial(task, st, correct, p).state;
  }
  const tail = levels.slice(-Math.floor(nTrials / 3));
  return { levels, finalMean: tail.reduce((a, b) => a + b, 0) / tail.length, accuracy: correctN / nTrials };
}

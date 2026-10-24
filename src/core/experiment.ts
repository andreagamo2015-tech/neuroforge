import { uid } from './rng';
import type { Experiment, ExperimentSession } from './records';
import { mean, sd } from './stats';

// Modo experimental: comparación intra-persona de dos estrategias de entrenamiento con un
// protocolo de alternancia predefinido (ABBA…) para reducir la elección interesada.

export const ARM_LABEL = {
  A: 'A · Práctica repetida de la misma tarea',
  B: 'B · Práctica variada con tareas relacionadas y variantes nuevas',
};

/** Secuencia ABBA BAAB…: contrabalanceo de orden para repartir efectos de práctica y fatiga. */
export function abbaSchedule(n: number): ('A' | 'B')[] {
  const base: ('A' | 'B')[] = ['A', 'B', 'B', 'A', 'B', 'A', 'A', 'B'];
  return Array.from({ length: n }, (_, i) => base[i % base.length]);
}

export function createExperiment(targetTaskId: string, name: string, sessions: number, minutesPerSession: number, probeLevel: number, now = Date.now()): Experiment {
  return {
    probeLevel,
    id: uid('exp'),
    name,
    targetTaskId,
    createdAt: now,
    minutesPerSession,
    schedule: abbaSchedule(sessions).map((arm, index) => ({ index, arm })),
    status: 'activo',
    hypothesis: 'La práctica variada (B) produce más retención y mejor rendimiento en variantes nuevas que la práctica repetida (A).',
  };
}

export function nextExperimentSession(exp: Experiment): ExperimentSession | undefined {
  return exp.schedule.find((s) => s.post === undefined);
}

export interface ArmSummary {
  arm: 'A' | 'B';
  n: number;
  gain: number;
  gainSd: number;
  retention: number;
  novel: number;
  minutes: number;
}

export interface ExperimentResult {
  arms: ArmSummary[];
  status: 'insuficiente' | 'descriptivo';
  message: string;
  warnings: string[];
}

export const EXPERIMENT_WARNINGS = [
  'Efecto de práctica: el rendimiento suele mejorar con la simple repetición de las pruebas, en ambas condiciones.',
  'Regresión a la media: tras una sesión excepcionalmente buena o mala, la siguiente tiende a acercarse a lo habitual.',
  'Expectativas: saber qué estrategia se usa puede influir en el esfuerzo y en el resultado.',
  'Fatiga, sueño y hora del día pueden variar entre sesiones y confundirse con la estrategia.',
  'Arrastre: lo aprendido en una sesión con A puede beneficiar la siguiente con B (y viceversa).',
  'Con una sola persona y pocas sesiones, las diferencias son descriptivas: no demuestran causalidad.',
];

export function summarizeExperiment(exp: Experiment, minPerArm = 3): ExperimentResult {
  const done = exp.schedule.filter((s) => s.pre !== undefined && s.post !== undefined);
  const arms = (['A', 'B'] as const).map((arm) => {
    const s = done.filter((x) => x.arm === arm);
    const gains = s.map((x) => x.post! - x.pre!);
    return {
      arm,
      n: s.length,
      gain: mean(gains),
      gainSd: sd(gains),
      retention: mean(s.filter((x) => x.retention !== undefined).map((x) => x.retention!)),
      novel: mean(s.filter((x) => x.novel !== undefined).map((x) => x.novel!)),
      minutes: s.reduce((a, x) => a + (x.minutes ?? 0), 0),
    };
  });
  const enough = arms.every((a) => a.n >= minPerArm);
  return {
    arms,
    status: enough ? 'descriptivo' : 'insuficiente',
    message: enough
      ? 'Comparación descriptiva disponible. Las diferencias observadas no demuestran causalidad y pueden deberse a los factores indicados abajo.'
      : `Evidencia insuficiente: se necesitan al menos ${minPerArm} sesiones completas por estrategia (A: ${arms[0].n}, B: ${arms[1].n}).`,
    warnings: EXPERIMENT_WARNINGS,
  };
}

// Parámetros del motor adaptativo.
// IMPORTANTE: todos los valores son HEURÍSTICOS de partida, no coeficientes derivados de
// estudios. Son configurables desde Ajustes → Parámetros y se documentan en METODOLOGIA.md.

export interface SelectionWeights {
  relevance: number;
  need: number;
  reliability: number;
  progress: number;
  transfer: number;
  timeCost: number;
  overtraining: number;
  recency: number;
  errors: number;
}

export interface AdaptiveParams {
  /** Precisión objetivo de la escalera ponderada para ítems y secuencias. */
  targetAccuracy: number;
  /** Subida de nivel por acierto. La bajada por error es baseStep·p/(1−p) (Kaernbach, 1991). */
  baseStep: number;
  variabilityWindow: number;
  /** DE de la precisión por bloque por encima de la cual se reducen los cambios. */
  variabilityThreshold: number;
  variabilityStepFactor: number;
  /** Tareas cronometradas: precisión para subir/bajar un paso al final del bloque. */
  speedUpAccuracy: number;
  speedDownAccuracy: number;
  speedStep: number;
  /** Errores consecutivos tras los que se ofrece un ejemplo resuelto. */
  workedExampleAfterErrors: number;
  /** Bloques para detectar estancamiento y pendiente mínima (niveles por bloque). */
  plateauWindow: number;
  plateauSlope: number;
  /** Introducir una variante nueva tras N bloques o tras subir X niveles. */
  novelProbeEveryBlocks: number;
  novelProbeLevelGain: number;
  /** Fatiga autoinformada (1–5) a partir de la cual se propone sesión ligera. */
  fatigueLightThreshold: number;
  /** Fracción máxima de bloques de una tarea en 7 días antes de penalizarla. */
  overtrainShare: number;
  /** Diferencia (en DE) a partir de la cual una habilidad se considera desproporcionadamente avanzada. */
  imbalanceZ: number;
  /** Mínimo de observaciones para dejar de marcar una estimación como provisional. */
  minObservations: number;
  /** Brecha entre precisión en entrenamiento y en variantes nuevas que se señala. */
  generalizationGap: number;
  /** Días entre administraciones del banco de transferencia. */
  transferEveryDays: number;
  weights: SelectionWeights;
}

export const DEFAULT_PARAMS: AdaptiveParams = {
  targetAccuracy: 0.8,
  baseStep: 0.2,
  variabilityWindow: 4,
  variabilityThreshold: 0.2,
  variabilityStepFactor: 0.5,
  speedUpAccuracy: 0.9,
  speedDownAccuracy: 0.7,
  speedStep: 1,
  workedExampleAfterErrors: 2,
  plateauWindow: 6,
  plateauSlope: 0.05,
  novelProbeEveryBlocks: 4,
  novelProbeLevelGain: 1.5,
  fatigueLightThreshold: 4,
  overtrainShare: 0.35,
  imbalanceZ: 1,
  minObservations: 20,
  generalizationGap: 0.2,
  transferEveryDays: 14,
  weights: {
    relevance: 1,
    need: 1,
    reliability: 0.6,
    progress: 0.5,
    transfer: 0.5,
    timeCost: 0.3,
    overtraining: 1,
    recency: 0.4,
    errors: 0.6,
  },
};

export const PARAM_DOCS: Record<keyof Omit<AdaptiveParams, 'weights'>, string> = {
  targetAccuracy: 'Precisión a la que converge la escalera de dificultad (0,8 ≈ reto alto pero alcanzable).',
  baseStep: 'Cuánto sube el nivel tras cada acierto.',
  variabilityWindow: 'Bloques usados para medir la variabilidad.',
  variabilityThreshold: 'Si la precisión varía más que esto, los cambios de nivel se reducen y se recogen más datos.',
  variabilityStepFactor: 'Factor de reducción de los pasos cuando hay alta variabilidad.',
  speedUpAccuracy: 'Tareas cronometradas: precisión mínima del bloque para subir de nivel.',
  speedDownAccuracy: 'Tareas cronometradas: precisión por debajo de la cual se baja de nivel.',
  speedStep: 'Tamaño del cambio de nivel en tareas cronometradas.',
  workedExampleAfterErrors: 'Errores seguidos tras los que se muestra un ejemplo resuelto.',
  plateauWindow: 'Bloques analizados para detectar estancamiento.',
  plateauSlope: 'Pendiente (niveles/bloque) por debajo de la cual se considera estancamiento.',
  novelProbeEveryBlocks: 'Cada cuántos bloques de entrenamiento se introduce una variante nueva.',
  novelProbeLevelGain: 'Subida de nivel que dispara una comprobación con variante nueva.',
  fatigueLightThreshold: 'Fatiga (1–5) a partir de la cual se propone una sesión ligera.',
  overtrainShare: 'Proporción máxima de bloques de una misma tarea en 7 días.',
  imbalanceZ: 'Diferencia de progreso (en desviaciones típicas) que dispara la redistribución.',
  minObservations: 'Observaciones mínimas para que una estimación deje de ser provisional.',
  generalizationGap: 'Diferencia de precisión entrenamiento–variante nueva que se señala como mejora específica.',
  transferEveryDays: 'Días entre aplicaciones del banco de transferencia.',
};

export function resolveParams(overrides: Partial<AdaptiveParams> | undefined): AdaptiveParams {
  return {
    ...DEFAULT_PARAMS,
    ...(overrides ?? {}),
    weights: { ...DEFAULT_PARAMS.weights, ...(overrides?.weights ?? {}) },
  };
}

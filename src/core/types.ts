import type { Rng } from './rng';

export type ModuleId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'T';

export const MODULE_NAMES: Record<ModuleId, string> = {
  A: 'Razonamiento fluido',
  B: 'Memoria de trabajo',
  C: 'Velocidad y atención',
  D: 'Flexibilidad cognitiva',
  E: 'Cuantitativo y lógica formal',
  F: 'Aprendizaje acelerado',
  G: 'Pensamiento divergente',
  H: 'Metacognición',
  T: 'Banco de transferencia',
};

/** Módulos que el motor adaptativo programa con tareas cronometradas o de ítems. */
export const TRAINABLE_MODULES: ModuleId[] = ['A', 'B', 'C', 'D', 'E'];

/**
 * Propósito de un bloque. Es la base para separar los cuatro paneles de progreso:
 * - training/review/free → Dominio
 * - novel → Generalización
 * - transfer → Transferencia
 */
export type Purpose =
  | 'familiarization'
  | 'baseline'
  | 'training'
  | 'review'
  | 'free'
  | 'novel'
  | 'transfer'
  | 'experiment-probe'
  | 'experiment-train';

export const PURPOSE_LABEL: Record<Purpose, string> = {
  familiarization: 'Familiarización',
  baseline: 'Evaluación inicial',
  training: 'Entrenamiento',
  review: 'Revisión de errores',
  free: 'Práctica libre',
  novel: 'Variante nueva',
  transfer: 'Prueba de transferencia',
  'experiment-probe': 'Experimento · medición',
  'experiment-train': 'Experimento · práctica',
};

export type Variant = 'train' | 'novel';

// ---------- Figuras (SVG) ----------
export type ShapeName = 'círculo' | 'cuadrado' | 'triángulo' | 'rombo' | 'hexágono' | 'estrella';
export type ColorName = 'cian' | 'violeta' | 'ámbar' | 'rosa';
export type SizeName = 'pequeño' | 'mediano' | 'grande';

export interface CellSpec {
  shape: ShapeName;
  count: number;
  color: ColorName;
  size: SizeName;
}

export type FigureSpec =
  | { type: 'matrix'; cells: (CellSpec | null)[] }
  | { type: 'cell'; cell: CellSpec }
  | { type: 'symbols'; text: string };

// ---------- Ítems discretos ----------
export interface ChoiceOption {
  label: string;
  figure?: FigureSpec;
  /** Etiqueta diagnóstica si se elige esta opción incorrecta. */
  errorTag?: string;
}

export type ItemResponse =
  | { type: 'choice'; options: ChoiceOption[]; correctIndex: number }
  | { type: 'numeric'; answer: number; tolerance?: number; relativeTolerance?: number }
  | { type: 'text'; accept: string[] };

export interface Item {
  /** Firma estable del contenido: sirve para evitar repeticiones. */
  signature: string;
  taskId: string;
  level: number;
  variant: Variant;
  seed: number;
  prompt: string;
  /** Líneas adicionales del enunciado (premisas, datos). */
  lines?: string[];
  figure?: FigureSpec;
  response: ItemResponse;
  explanation: string[];
  /** Clave de foco para la revisión dirigida de errores (familia de regla, atributo...). */
  focusKey?: string;
  /** Si el ítem depende sobre todo de conocimiento previo (p. ej. fórmulas) o de razonamiento. */
  demand?: 'razonamiento' | 'conocimiento';
  meta?: Record<string, unknown>;
}

export interface Strategy {
  id: string;
  label: string;
}

interface TaskBase {
  id: string;
  module: ModuleId;
  name: string;
  short: string;
  objective: string;
  instructions: string[];
  /** Estrategias que el usuario puede declarar haber usado (metacognición). */
  strategies: Strategy[];
  /** Explicación de cada etiqueta de error y alternativa más eficiente. */
  errorAdvice: Record<string, { meaning: string; better: string }>;
  /** Cómo aplicar lo aprendido en otro contexto. */
  transferHint: string;
  minLevel: number;
  maxLevel: number;
  /** Solo para el banco de transferencia: nunca se usa en entrenamiento. */
  reserved?: boolean;
  /** Existe una variante nueva (generalización) para esta tarea. */
  hasNovel: boolean;
  novelDescription?: string;
  /** Duración estimada de un bloque en segundos (para planificar sesiones). */
  blockSeconds: number;
}

export interface ItemTask extends TaskBase {
  kind: 'item';
  itemsPerBlock: number;
  /** Segundos orientativos por ítem en función del nivel. */
  expectedSeconds(level: number): number;
  generate(rng: Rng, level: number, variant: Variant, focus?: string): Item;
  /** Generación de bloque ordenado (si el orden importa, p. ej. efecto Einstellung). */
  generateBlock?(rng: Rng, level: number, variant: Variant, n: number): Item[];
  validate(item: Item): string[];
  /** Diagnóstico de respuestas incorrectas en ítems numéricos/texto. */
  diagnose?(item: Item, answer: number | string): string | undefined;
}

// ---------- Secuencias (memoria de trabajo) ----------
export interface SeqStimulus {
  text: string;
  role?: 'target' | 'distractor' | 'neutral';
  /** Estímulo de procesamiento intercalado (span complejo): requiere responder Verdadero/Falso. */
  processing?: { statement: string; truth: boolean };
}

export interface SeqTrial {
  signature: string;
  level: number;
  variant: Variant;
  stimuli: SeqStimulus[];
  durationMs: number;
  isiMs: number;
  recallPrompt: string;
  recall:
    | { type: 'ordered'; answer: string[]; alphabet: string[] }
    | { type: 'choice'; question: string; options: string[]; correctIndex: number };
  explanation: string[];
  meta?: Record<string, unknown>;
}

export interface SeqScore {
  correct: boolean;
  /** Proporción de posiciones correctas (crédito parcial). */
  partial: number;
  errorTag?: string;
}

export interface SequenceTask extends TaskBase {
  kind: 'sequence';
  trialsPerBlock: number;
  generate(rng: Rng, level: number, variant: Variant): SeqTrial;
  score(trial: SeqTrial, response: string[] | number): SeqScore;
  validate(trial: SeqTrial): string[];
}

// ---------- Bloques cronometrados (velocidad, atención, flexibilidad, n-back) ----------
export type SpeedStimulus =
  | { type: 'text'; text: string; color?: ColorName; big?: boolean; cue?: string; cueColor?: ColorName }
  | { type: 'pair'; left: string; right: string }
  | { type: 'search'; cols: number; cells: { glyph: string; rotation: number }[] }
  | { type: 'card'; card: CellSpec; references: CellSpec[] };

export interface SpeedTrial {
  stimulus: SpeedStimulus;
  /** Valor de respuesta correcto; 'none' = no responder (go/no-go). Vacío si lo decide judge(). */
  correct: string;
  condition: string;
  meta?: Record<string, unknown>;
}

export interface SpeedResponseDef {
  value: string;
  label: string;
  key: string; // tecla (minúscula) o ' ' para espacio
}

export interface SpeedJudgement {
  correct: boolean;
  errorTag?: string;
}

export interface SpeedTrialResult {
  index: number;
  condition: string;
  response: string; // 'none' si no respondió
  rtMs: number | null;
  correct: boolean;
  errorTag?: string;
  anticipation: boolean;
}

export interface SpeedBlockMetrics {
  accuracy: number;
  medianRtCorrect: number;
  /** Métricas específicas de la tarea (coste de alternancia, d', errores perseverativos...). */
  extra: Record<string, number>;
  summary: string[];
}

export interface SpeededTask extends TaskBase {
  kind: 'speeded';
  responses: SpeedResponseDef[];
  trialsPerBlock(level: number): number;
  timeoutMs(level: number): number;
  /** Intervalo entre ensayos (ms). */
  itiMs: number;
  feedbackPerTrial: boolean;
  generateBlock(rng: Rng, level: number, variant: Variant): SpeedTrial[];
  /** Juez con estado (p. ej. clasificación con reglas cambiantes). */
  createJudge?(): (trial: SpeedTrial, response: string) => SpeedJudgement;
  metrics(results: SpeedTrialResult[], trials: SpeedTrial[]): SpeedBlockMetrics;
}

// ---------- Tareas abiertas (pensamiento divergente) ----------
export interface OpenPrompt {
  signature: string;
  title: string;
  prompt: string;
  /** Respuestas frecuentes conocidas: se marcan como baja originalidad automáticamente. */
  common: string[];
  categories: string[];
}

export interface OpenTask extends TaskBase {
  kind: 'open';
  durationSeconds: number;
  prompts: OpenPrompt[];
}

export type Task = ItemTask | SequenceTask | SpeededTask | OpenTask;

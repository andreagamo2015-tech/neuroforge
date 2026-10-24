import type { ModuleId, Purpose, Variant } from './types';
import type { AdaptiveParams } from './engine/params';

// Esquema de los datos persistidos. Todos los registros viven en el navegador (IndexedDB).

export type InputType = 'teclado' | 'táctil' | 'ratón' | 'desconocido';

export interface TrialRecord {
  id: string;
  sessionId: string;
  blockId: string;
  taskId: string;
  module: ModuleId;
  purpose: Purpose;
  variant: Variant;
  level: number;
  correct: boolean;
  /** Crédito parcial 0–1 (igual a correct en tareas sin crédito parcial). */
  score: number;
  rtMs: number | null;
  /** Confianza declarada antes de responder (0–1), si se registró. */
  confidence?: number;
  errorTag?: string;
  focusKey?: string;
  strategy?: string;
  demand?: 'razonamiento' | 'conocimiento';
  signature?: string;
  condition?: string;
  inputType: InputType;
  timestamp: number;
}

export interface BlockRecord {
  id: string;
  sessionId: string;
  taskId: string;
  module: ModuleId;
  purpose: Purpose;
  variant: Variant;
  startLevel: number;
  endLevel: number;
  nTrials: number;
  accuracy: number;
  medianRt: number | null;
  extra: Record<string, number>;
  summary: string[];
  startedAt: number;
  endedAt: number;
  inputType: InputType;
  /** Tiempo de reacción simple medido antes del bloque (control de latencia del dispositivo). */
  simpleRtMs?: number;
  strategy?: string;
  experimentId?: string;
  experimentArm?: 'A' | 'B';
  experimentPhase?: 'pre' | 'post' | 'retencion' | 'nueva' | 'practica';
  /** Para tareas abiertas: respuestas con su valoración. */
  payload?: unknown;
  aborted?: boolean;
}

export type SessionKind = 'baseline' | 'training' | 'free' | 'transfer' | 'experiment' | 'learning';

export interface SessionRecord {
  id: string;
  kind: SessionKind;
  startedAt: number;
  endedAt?: number;
  plannedMinutes: number;
  activeSeconds: number;
  fatigueBefore?: number;
  fatigueAfter?: number;
  sleepHours?: number;
  stress?: number;
  notes?: string;
  aborted?: boolean;
  plan?: string[];
  summary?: string[];
  week?: number;
  phase?: number;
  device?: string;
}

export interface TaskState {
  taskId: string;
  level: number;
  blocks: number;
  trials: number;
  lastPracticed?: number;
  consecutiveErrors: number;
  needsWorkedExample: boolean;
  /** Nivel en el último sondeo con variante nueva. */
  lastNovelLevel?: number;
  blocksSinceNovel: number;
  /** Firmas de ítems ya presentados (las más recientes) para evitar repeticiones. */
  seen: string[];
  /** Historial resumido de bloques para las reglas de adaptación. */
  history: { t: number; level: number; accuracy: number; purpose: Purpose; variant: Variant }[];
}

export interface Settings {
  id: 'settings';
  createdAt: number;
  onboardingDone: boolean;
  programStart?: number;
  sessionMinutes: 10 | 20 | 30 | 45;
  goals: Partial<Record<ModuleId, number>>;
  askConfidence: boolean;
  sound: boolean;
  reducedMotion: 'sistema' | 'sí' | 'no';
  focusMode: boolean;
  devMode: boolean;
  restDays: number[]; // 0 = domingo
  params: Partial<AdaptiveParams>;
  displayName?: string;
}

export interface JournalEntry {
  id: string;
  date: number;
  sleepHours?: number;
  mood?: number;
  stress?: number;
  energy?: number;
  text: string;
}

export interface ExternalAssessment {
  id: string;
  date: number;
  instrument: string;
  administeredBy: string;
  scoreLabel: string;
  score: number;
  ciLow?: number;
  ciHigh?: number;
  notes?: string;
}

export interface Card {
  id: string;
  deckId: string;
  lessonId?: string;
  kind: 'vocabulario' | 'regla' | 'aplicacion' | 'usuario';
  front: string;
  back: string;
  /** Respuestas aceptadas además de back (normalizadas). */
  accept?: string[];
  hint?: string;
  elaboration?: string;
  box: number;
  due: number;
  createdAt: number;
  lastReviewed?: number;
  history: { t: number; correct: boolean; phase: 'inmediata' | 'diferida' | 'repaso'; hoursSinceStudy: number }[];
  studiedAt?: number;
}

export interface LessonRecord {
  id: string;
  deckId: string;
  title: string;
  startedAt: number;
  cardIds: string[];
  immediateAccuracy?: number;
  delayedAccuracy?: number;
  delayedAt?: number;
  /** Lección del protocolo de transferencia (aprendizaje de material nuevo). */
  transfer?: boolean;
}

export interface ExperimentSession {
  index: number;
  arm: 'A' | 'B';
  sessionId?: string;
  date?: number;
  minutes?: number;
  pre?: number;
  post?: number;
  retention?: number;
  novel?: number;
}

export interface Experiment {
  id: string;
  name: string;
  targetTaskId: string;
  createdAt: number;
  minutesPerSession: number;
  schedule: ExperimentSession[];
  status: 'activo' | 'terminado';
  hypothesis: string;
  /** Nivel fijo de las pruebas pre/post (para que sean comparables entre sesiones). */
  probeLevel: number;
}

export interface AppData {
  settings: Settings | null;
  sessions: SessionRecord[];
  blocks: BlockRecord[];
  trials: TrialRecord[];
  taskStates: TaskState[];
  journal: JournalEntry[];
  external: ExternalAssessment[];
  cards: Card[];
  lessons: LessonRecord[];
  experiments: Experiment[];
}

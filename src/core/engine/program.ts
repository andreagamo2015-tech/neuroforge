// Programa de 12 semanas. Es una estructura organizativa revisable, no una promesa de resultados.

export interface Phase {
  id: number;
  name: string;
  weeks: [number, number];
  goal: string;
  emphasis: string[];
}

export const PHASES: Phase[] = [
  { id: 1, name: 'Línea de base y familiarización', weeks: [1, 1], goal: 'Conocer las tareas y establecer el rendimiento de partida.', emphasis: ['Evaluación inicial completa', 'Práctica de todas las tareas a nivel bajo', 'Primera aplicación del banco de transferencia'] },
  { id: 2, name: 'Estrategias y consolidación', weeks: [2, 4], goal: 'Adquirir estrategias explícitas y consolidar habilidades básicas.', emphasis: ['Explicaciones y ejemplos resueltos', 'Registro de estrategias', 'Dificultad adaptativa moderada'] },
  { id: 3, name: 'Dificultad y variación', weeks: [5, 7], goal: 'Aumentar la dificultad y variar los problemas.', emphasis: ['Práctica intercalada', 'Más variantes', 'Revisión de errores recurrentes'] },
  { id: 4, name: 'Tareas nuevas y contextos diferentes', weeks: [8, 10], goal: 'Practicar la aplicación a problemas y contextos no entrenados.', emphasis: ['Variantes nuevas frecuentes', 'Problemas aplicados', 'Aprendizaje de contenidos nuevos'] },
  { id: 5, name: 'Retención y transferencia', weeks: [11, 11], goal: 'Evaluar qué se mantiene y qué se transfiere.', emphasis: ['Banco de transferencia', 'Pruebas de retención diferida', 'Menos práctica nueva'] },
  { id: 6, name: 'Revisión y siguiente ciclo', weeks: [12, 12], goal: 'Revisar los datos honestamente y adaptar el siguiente ciclo.', emphasis: ['Informe de dominio, generalización y transferencia', 'Ajuste de objetivos', 'Decidir qué mantener o cambiar'] },
];

export interface ProgramStatus {
  started: boolean;
  day: number; // día del programa (1…)
  week: number; // 1–12 dentro del ciclo
  cycle: number;
  phase: Phase;
  isRestDay: boolean;
}

const DAY = 86400000;

export function programStatus(programStart: number | undefined, now: number, restDays: number[]): ProgramStatus {
  if (!programStart) return { started: false, day: 0, week: 1, cycle: 1, phase: PHASES[0], isRestDay: false };
  const startDay = new Date(programStart);
  startDay.setHours(0, 0, 0, 0);
  const day = Math.floor((now - startDay.getTime()) / DAY) + 1;
  const absWeek = Math.floor((day - 1) / 7) + 1;
  const cycle = Math.floor((absWeek - 1) / 12) + 1;
  const week = ((absWeek - 1) % 12) + 1;
  const phase = PHASES.find((p) => week >= p.weeks[0] && week <= p.weeks[1]) ?? PHASES[0];
  return { started: true, day, week, cycle, phase, isRestDay: restDays.includes(new Date(now).getDay()) };
}

/** Minutos de práctica por semana ISO (lunes) a partir de las sesiones. */
export function weeklyMinutes(sessions: { startedAt: number; activeSeconds: number }[], weeks = 8, now = Date.now()): { weekStart: number; minutes: number }[] {
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const out: { weekStart: number; minutes: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = monday.getTime() - i * 7 * DAY;
    const we = ws + 7 * DAY;
    const secs = sessions.filter((s) => s.startedAt >= ws && s.startedAt < we).reduce((a, s) => a + s.activeSeconds, 0);
    out.push({ weekStart: ws, minutes: Math.round(secs / 60) });
  }
  return out;
}

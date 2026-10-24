import { useMemo } from 'react';
import { TASKS, getTask } from '../../core/registry';
import { MODULE_NAMES, TRAINABLE_MODULES } from '../../core/types';
import { planSession } from '../../core/engine/session';
import { programStatus, weeklyMinutes } from '../../core/engine/program';
import { errorSummary, moduleProfiles, recentTrend } from '../../core/analytics';
import { dueCards, pendingDelayed } from '../../core/learning';
import { fmt } from '../../core/stats';
import { useStore } from '../../data/store';
import { BarChart } from '../components/charts';
import { Badge, Button, Card, Empty, Evidence, PageTitle, ProgressBar, Stat } from '../components/ui';
import { navigate } from '../hooks';
import { BASELINE_PARTS } from './SessionPage';

export const SESSION_KIND_LABEL: Record<string, string> = { baseline: 'evaluación inicial', training: 'entrenamiento', free: 'práctica libre', transfer: 'transferencia', experiment: 'experimento', learning: 'aprendizaje' };

export function Dashboard() {
  const store = useStore();
  const { data, settings, params, states } = store;
  const now = Date.now();
  const status = programStatus(settings.programStart, now, settings.restDays);
  const lastTransferAt = Math.max(0, ...data.blocks.filter((b) => b.purpose === 'transfer').map((b) => b.startedAt)) || undefined;
  const plan = useMemo(
    () => planSession({ tasks: TASKS, states, blocks: data.blocks, trials: data.trials, goals: settings.goals, params }, { minutes: settings.sessionMinutes, program: status, lastTransferAt, now }),
    [states, data.blocks, data.trials, settings, params], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const weeks = weeklyMinutes(data.sessions, 8, now);
  const profiles = useMemo(() => moduleProfiles(TASKS, data.trials, data.blocks, states, params), [data.trials, data.blocks, states, params]);
  const errors = errorSummary(data.trials, TASKS, 30, now).slice(0, 4);
  const baselineDone = BASELINE_PARTS.slice(0, 3).map((p) => p.tasks.every((t) => data.blocks.some((b) => b.taskId === t && b.purpose === 'baseline')));
  const due = dueCards(data.cards, now).length;
  const delayed = pendingDelayed(data.lessons, now).length;
  const recentSessions = data.sessions.filter((s) => s.endedAt).sort((a, b) => b.startedAt - a.startedAt).slice(0, 5);

  // Próximo objetivo: la acción pendiente más importante
  const nextGoal = !baselineDone.every(Boolean)
    ? { text: `Completar la evaluación inicial (${baselineDone.filter(Boolean).length}/3 partes)`, go: '/evaluacion' }
    : delayed
      ? { text: `Prueba de retención diferida pendiente (${delayed} lección${delayed > 1 ? 'es' : ''})`, go: '/aprendizaje' }
      : !lastTransferAt || now - lastTransferAt > params.transferEveryDays * 86400000
        ? { text: 'Aplicar el banco de transferencia', go: '/sesion?modo=transferencia' }
        : due
          ? { text: `Repasar ${due} tarjeta${due > 1 ? 's' : ''} de aprendizaje`, go: '/aprendizaje' }
          : { text: 'Seguir la sesión recomendada', go: '/sesion?modo=recomendada' };

  return (
    <div className="space-y-5">
      <PageTitle title={settings.displayName ? `Hola, ${settings.displayName}` : 'Panel de control'} subtitle="Laboratorio personal de entrenamiento cognitivo. Hipótesis de trabajo: un entrenamiento adaptativo y variado podría mejorar capacidades concretas y, quizá, transferirse. Aquí se pone a prueba, no se da por hecho.">
        <Evidence level="hipotesis" />
      </PageTitle>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Entrenamiento recomendado" subtitle={`${settings.sessionMinutes} minutos · calculado por el motor adaptativo`} actions={<Button variant="primary" onClick={() => navigate('/sesion?modo=recomendada')}>Empezar sesión</Button>}>
          {status.isRestDay && <p className="mb-2 text-xs text-amber">Hoy es día de descanso sugerido. Entrenar es opcional.</p>}
          <ol className="space-y-2">
            {plan.blocks.map((b, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="text-faint tabular">{i + 1}.</span>
                <span className="font-medium">{getTask(b.taskId).name}</span>
                <Badge tone={b.role === 'transferencia' ? 'amber' : 'muted'}>{b.role}</Badge>
                {b.variant === 'novel' && <Badge tone="violet">variante nueva</Badge>}
                <span className="w-full pl-5 text-xs text-muted">{b.reason}</span>
              </li>
            ))}
          </ol>
        </Card>
        <Card title="Próximo objetivo">
          <p className="text-sm">{nextGoal.text}</p>
          <Button className="mt-3" onClick={() => navigate(nextGoal.go)}>Ir</Button>
          <div className="mt-4 border-t border-night-700 pt-3">
            <div className="text-xs text-faint">Estado del programa</div>
            {status.started ? (
              <>
                <div className="mt-1 text-sm">Ciclo {status.cycle} · semana {status.week} de 12</div>
                <div className="text-xs text-violet">Fase {status.phase.id}: {status.phase.name}</div>
                <div className="mt-2"><ProgressBar value={status.week / 12} tone="violet" label="Avance del programa" /></div>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted">El programa de 12 semanas empieza al completar la primera parte de la evaluación inicial.</p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Rendimiento por habilidad" subtitle="Índice interno 0–100: posición de tu umbral estimado dentro del rango de niveles de cada tarea. No es un CI ni es comparable con otras personas.">
          <div className="space-y-3">
            {profiles.map((p) => {
              const trend = recentTrend(data.blocks, TASKS, p.module, now);
              return (
                <div key={p.module}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span>{p.name}</span>
                    <span className="flex items-center gap-2 text-xs text-muted tabular">
                      {Number.isFinite(p.index) ? fmt(p.index, 0) : '—'}
                      {p.provisional && Number.isFinite(p.index) && <Badge tone="amber">provisional</Badge>}
                      {trend.status === 'ok' ? <span title="Nivel medio de los últimos 7 días frente a los 7 anteriores">{trend.diff >= 0 ? '▲' : '▼'} {fmt(Math.abs(trend.diff), 0)}</span> : <span className="text-faint" title="Pocos datos en las dos últimas semanas">tendencia: evidencia insuficiente</span>}
                    </span>
                  </div>
                  <ProgressBar value={Number.isFinite(p.index) ? p.index / 100 : 0} label={p.name} />
                </div>
              );
            })}
          </div>
        </Card>
        <Card title="Práctica semanal" subtitle="Minutos activos por semana (últimas 8). Sin rachas: el descanso cuenta.">
          <BarChart data={weeks.map((w) => ({ label: new Date(w.weekStart).toLocaleDateString('es-ES', { day: 'numeric', month: 'numeric' }), value: w.minutes }))} unit="min" />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Stat label="Esta semana" value={`${weeks[weeks.length - 1].minutes} min`} />
            <Stat label="Sesiones totales" value={data.sessions.filter((s) => s.endedAt).length} />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Errores frecuentes (30 días)" actions={<Button variant="ghost" onClick={() => navigate('/metacognicion')}>Ver todo</Button>}>
          {errors.length === 0 ? <Empty title="Sin errores registrados todavía" /> : (
            <ul className="space-y-2 text-sm">
              {errors.map((e) => (
                <li key={e.taskId + e.tag}>
                  <div className="flex justify-between"><span>{e.taskName} · <span className="text-amber">{e.tag}</span></span><span className="text-faint tabular">×{e.n}</span></div>
                  {e.advice && <div className="text-xs text-muted">{e.advice.better}</div>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Historial reciente" actions={<Button variant="ghost" onClick={() => navigate('/progreso')}>Progreso</Button>}>
          {recentSessions.length === 0 ? <Empty title="Aún no hay sesiones completadas" /> : (
            <ul className="space-y-2 text-sm">
              {recentSessions.map((s) => (
                <li key={s.id} className="flex justify-between gap-2">
                  <span>{new Date(s.startedAt).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })} · {SESSION_KIND_LABEL[s.kind]}</span>
                  <span className="text-faint tabular">{s.activeSeconds < 60 ? `${s.activeSeconds} s` : `${Math.round(s.activeSeconds / 60)} min`}{s.aborted ? ' · interrumpida' : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-faint">
        <span>Módulos entrenables: {TRAINABLE_MODULES.map((m) => MODULE_NAMES[m]).join(' · ')}.</span>
      </div>
    </div>
  );
}

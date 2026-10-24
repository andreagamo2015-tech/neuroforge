import { useMemo } from 'react';
import { OPEN_TASKS, TASKS } from '../../core/registry';
import { moduleProfiles, retentionSummary } from '../../core/analytics';
import { fmt, mean, pct } from '../../core/stats';
import { useStore } from '../../data/store';
import { Badge, Card, Empty, Evidence, PageTitle, ProgressBar } from '../components/ui';

export function ProfilePage() {
  const { data, states, params } = useStore();
  const profiles = useMemo(() => moduleProfiles(TASKS, data.trials, data.blocks, states, params), [data.trials, data.blocks, states, params]);
  const ret = retentionSummary(data.lessons);
  const open = OPEN_TASKS.map((t) => ({ t, blocks: data.blocks.filter((b) => b.taskId === t.id && !b.aborted) }));
  const latestSession = data.sessions.filter((s) => s.endedAt).sort((a, b) => b.startedAt - a.startedAt)[0];

  return (
    <div className="space-y-5">
      <PageTitle title="Perfil cognitivo multidimensional" subtitle="Dos cosas distintas por tarea: el rendimiento OBSERVADO (lo que has hecho) y una ESTIMACIÓN de capacidad latente en la escala de niveles de esa tarea (un modelo, con su incertidumbre). Ninguna es un CI, un percentil ni una comparación con otras personas.">
        <Evidence level="observado" />
      </PageTitle>
      {profiles.every((p) => p.nTrials === 0) && <Empty title="Evidencia insuficiente: completa la evaluación inicial para ver tu perfil." />}
      {profiles.map((p) => (
        <Card key={p.module} title={p.name} actions={p.nTrials === 0 ? <Evidence level="insuficiente" /> : p.provisional ? <Badge tone="amber">estimación provisional</Badge> : <Badge tone="cyan">{p.nTrials} observaciones</Badge>}>
          <div className="mb-3 flex items-center gap-3">
            <div className="w-40 text-xs text-muted">Índice interno del módulo</div>
            <div className="flex-1"><ProgressBar value={Number.isFinite(p.index) ? p.index / 100 : 0} label={`Índice ${p.name}`} /></div>
            <div className="w-10 text-right text-sm tabular">{Number.isFinite(p.index) ? fmt(p.index, 0) : '—'}</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-faint">
                <tr>
                  <th className="p-2">Tarea</th>
                  <th className="p-2">Precisión</th>
                  <th className="p-2">T. mediano</th>
                  <th className="p-2">Consistencia (DE)</th>
                  <th className="p-2">Nivel actual</th>
                  <th className="p-2">Umbral estimado ± DE</th>
                  <th className="p-2">Familiaridad</th>
                  <th className="p-2">Errores típicos</th>
                </tr>
              </thead>
              <tbody>
                {p.tasks.map((t) => (
                  <tr key={t.task.id} className="border-t border-night-700 align-top">
                    <td className="p-2">{t.task.name}</td>
                    <td className="p-2 tabular">{t.nTrials ? pct(t.accuracy) : '—'}</td>
                    <td className="p-2 tabular">{Number.isFinite(t.medianRt) ? `${(t.medianRt / 1000).toFixed(2)} s` : '—'}</td>
                    <td className="p-2 tabular">{Number.isFinite(t.consistency) ? fmt(t.consistency * 100, 0) + ' pts' : '—'}</td>
                    <td className="p-2 tabular">{t.nTrials ? fmt(t.observedLevel, 1) : '—'}</td>
                    <td className="p-2 tabular">
                      {t.estimate ? (
                        <>
                          {fmt(t.estimate.theta, 1)} ± {fmt(t.estimate.sdTheta, 1)} {t.estimate.provisional && <Badge tone="amber">provisional</Badge>}
                        </>
                      ) : <span className="text-faint">evidencia insuficiente</span>}
                    </td>
                    <td className="p-2 tabular text-muted">{t.nBlocks} bloques · {t.nTrials} ens.</td>
                    <td className="p-2 text-xs text-muted">{t.topErrors.map((e) => `${e.tag} (${e.n})`).join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Aprendizaje (módulo F)" subtitle="Retención inmediata y diferida de lecciones">
          <div className="text-sm">Inmediata: <b>{pct(ret.immediate)}</b> · Diferida: <b>{ret.nDelayed ? pct(ret.delayed) : 'evidencia insuficiente'}</b> · Proporción retenida: <b>{Number.isFinite(ret.retentionRatio) ? pct(ret.retentionRatio) : '—'}</b></div>
        </Card>
        <Card title="Pensamiento divergente (módulo G)" subtitle="Cuatro dimensiones autoevaluadas con rúbrica. No es una medida de inteligencia.">
          {open.every((o) => !o.blocks.length) ? <Empty title="Sin datos todavía" /> : (
            <ul className="space-y-1 text-sm">
              {open.filter((o) => o.blocks.length).map(({ t, blocks }) => (
                <li key={t.id}>{t.name}: fluidez {fmt(mean(blocks.map((b) => b.extra.fluidez)), 1)} · variedad {fmt(mean(blocks.map((b) => b.extra.variedad)), 1)} · originalidad {fmt(mean(blocks.map((b) => b.extra.originalidad)), 2)} · adecuación {pct(mean(blocks.map((b) => b.extra.adecuacion)))} <span className="text-faint">(n = {blocks.length})</span></li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Card title="Cómo leer este perfil">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li><b>Precisión y tiempo</b>: rendimiento observado. En tareas adaptativas la precisión tiende al {Math.round(params.targetAccuracy * 100)} % por diseño.</li>
          <li><b>Umbral estimado</b>: nivel de la tarea con ~50 % de probabilidad de acierto según un modelo logístico simple con previa débil. La DE es la incertidumbre del modelo, no un intervalo poblacional.</li>
          <li><b>Índice interno 0–100</b>: posición del umbral dentro del rango de niveles de la tarea. Es solo una forma de poner tareas distintas en la misma barra.</li>
          <li>Condiciones de la última sesión: {latestSession ? `${latestSession.fatigueBefore !== undefined ? `fatiga ${latestSession.fatigueBefore}` : 'fatiga no registrada'}, ${latestSession.sleepHours !== undefined ? `sueño ${latestSession.sleepHours} h` : 'sueño no registrado'}.` : 'sin sesiones.'}</li>
        </ul>
      </Card>
    </div>
  );
}

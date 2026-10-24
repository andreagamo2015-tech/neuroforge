import { useMemo, useState } from 'react';
import { TASKS, getTask } from '../../core/registry';
import { calibration, chunkingSplit, demandSplit, errorSummary, strategyEffectiveness } from '../../core/analytics';
import { fmt, pct } from '../../core/stats';
import { useStore } from '../../data/store';
import { CalibrationChart } from '../components/charts';
import { Button, Card, Empty, Evidence, PageTitle, Stat, inputCls } from '../components/ui';
import { navigate } from '../hooks';

export function MetacognitionPage() {
  const { data } = useStore();
  const cal = useMemo(() => calibration(data.trials), [data.trials]);
  const errors = useMemo(() => errorSummary(data.trials, TASKS, 30), [data.trials]);
  const [taskId, setTaskId] = useState('A-series');
  const strat = strategyEffectiveness(data.trials, taskId);
  const demand = demandSplit(data.trials);
  const chunk = chunkingSplit(data.trials);
  return (
    <div className="space-y-5">
      <PageTitle title="Metacognición" subtitle="¿Sabes cuándo sabes? Calibración entre confianza y acierto, errores recurrentes y eficacia de tus estrategias." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Calibración" subtitle="Cada punto agrupa respuestas con confianza similar. Sobre la diagonal = buena calibración." actions={cal.n < 20 ? <Evidence level="insuficiente" /> : <Evidence level="observado" />}>
          {cal.n === 0 ? <Empty title="Evidencia insuficiente: registra tu confianza antes de responder en los ejercicios." /> : (
            <>
              <CalibrationChart bins={cal.bins} />
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Stat label="Respuestas" value={cal.n} />
                <Stat label="Brier" value={fmt(cal.brier, 3)} hint="0 = perfecto" />
                <Stat label="Sesgo" value={`${cal.bias > 0 ? '+' : ''}${fmt(cal.bias * 100, 0)} pts`} hint={cal.bias > 0.05 ? 'sobreconfianza' : cal.bias < -0.05 ? 'infraconfianza' : 'equilibrado'} />
              </div>
            </>
          )}
        </Card>
        <Card title="Errores recurrentes (30 días)" subtitle="El motor programa revisiones dirigidas a los más frecuentes.">
          {errors.length === 0 ? <Empty title="Sin errores registrados" /> : (
            <ul className="max-h-96 space-y-2 overflow-y-auto pr-1 text-sm">
              {errors.slice(0, 12).map((e) => (
                <li key={e.taskId + e.tag} className="rounded-lg border border-night-700 p-2">
                  <div className="flex justify-between"><span>{e.taskName} · <span className="text-amber">{e.tag}</span></span><span className="tabular text-faint">×{e.n}</span></div>
                  {e.advice && <div className="mt-1 text-xs text-muted"><b>Qué ocurre:</b> {e.advice.meaning} <br /><b>Alternativa:</b> {e.advice.better}</div>}
                  <Button variant="ghost" className="mt-1 px-2 py-1 text-xs" onClick={() => navigate(`/sesion?modo=bloque&tarea=${e.taskId}`)}>Practicar esta tarea</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Estrategias declaradas" subtitle="Precisión según la estrategia que dijiste usar (descriptivo: el nivel de dificultad no es igual en todos los casos).">
          <select className={inputCls} value={taskId} onChange={(e) => setTaskId(e.target.value)} aria-label="Tarea">
            {TASKS.filter((t) => t.kind === 'item').map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {strat.length === 0 ? <p className="mt-3 text-sm text-faint">Evidencia insuficiente.</p> : (
            <ul className="mt-3 space-y-1 text-sm">{strat.map((s) => <li key={s.strategy}>{getTask(taskId).strategies.find((x) => x.id === s.strategy)?.label ?? s.strategy}: {pct(s.accuracy)} <span className="text-faint">(n = {s.n})</span></li>)}</ul>
          )}
        </Card>
        <Card title="Memoria: agrupación" subtitle="Span inverso con secuencias agrupables (p. ej. 4-5-6) frente a no agrupables. Una diferencia grande sugiere que el rendimiento depende de agrupar más que de capacidad de manipulación.">
          <div className="text-sm">Agrupables: <b>{pct(chunk.agrupable.accuracy)}</b> (n = {chunk.agrupable.n})<br />No agrupables: <b>{pct(chunk.noAgrupable.accuracy)}</b> (n = {chunk.noAgrupable.n})</div>
          {(chunk.agrupable.n < 10 || chunk.noAgrupable.n < 10) && <p className="mt-2 text-xs text-faint">Evidencia insuficiente (se necesitan al menos 10 de cada tipo).</p>}
        </Card>
        <Card title="Cuantitativo: conocimiento vs razonamiento" subtitle="Separa ítems que dependen de saber una fórmula de los que solo requieren razonar con relaciones.">
          <div className="text-sm">Razonamiento: <b>{pct(demand.razonamiento.accuracy)}</b> (n = {demand.razonamiento.n})<br />Conocimiento: <b>{pct(demand.conocimiento.accuracy)}</b> (n = {demand.conocimiento.n})</div>
        </Card>
      </div>
    </div>
  );
}

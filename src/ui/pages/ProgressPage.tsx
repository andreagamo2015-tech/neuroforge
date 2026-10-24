import { useMemo, useState } from 'react';
import { uid } from '../../core/rng';
import type { ExternalAssessment } from '../../core/records';
import { TASKS, TRANSFER_TASKS } from '../../core/registry';
import { generalizationByTask, learningTransfer, masteryByTask, transferByTask } from '../../core/analytics';
import { fmt, pct, type PeriodComparison } from '../../core/stats';
import { useStore } from '../../data/store';
import { LineChart } from '../components/charts';
import { Badge, Button, Card, Empty, Evidence, Field, PageTitle, Segmented, inputCls } from '../components/ui';

type Tab = 'dominio' | 'generalizacion' | 'transferencia' | 'externa';

export function ProgressPage() {
  const [tab, setTab] = useState<Tab>('dominio');
  return (
    <div className="space-y-5">
      <PageTitle title="Progreso" subtitle="Cuatro paneles separados a propósito: mejorar en un ejercicio conocido no implica mejorar en variantes nuevas, ni en problemas distintos, ni en una medición estandarizada.">
        <Segmented label="Panel" value={tab} onChange={setTab} options={[
          { value: 'dominio', label: '1 · Dominio' },
          { value: 'generalizacion', label: '2 · Generalización' },
          { value: 'transferencia', label: '3 · Transferencia' },
          { value: 'externa', label: '4 · Evaluación externa' },
        ]} />
      </PageTitle>
      {tab === 'dominio' && <MasteryPanel />}
      {tab === 'generalizacion' && <GeneralizationPanel />}
      {tab === 'transferencia' && <TransferPanel />}
      {tab === 'externa' && <ExternalPanel />}
      <SessionNotes />
    </div>
  );
}

export function Comparison({ c, unit = 'pct', label }: { c: PeriodComparison; unit?: 'pct' | 'nivel'; label: string }) {
  if (c.status === 'insuficiente') return <div className="text-xs text-faint">{label}: <Evidence level="insuficiente" /> (n = {c.nA} / {c.nB})</div>;
  const f = (x: number) => (unit === 'pct' ? pct(x) : fmt(x, 1));
  return (
    <div className="text-xs text-muted">
      {label}: {f(c.meanA)} → {f(c.meanB)} <span className={c.diff >= 0 ? 'text-ok' : 'text-bad'}>({c.diff >= 0 ? '+' : ''}{unit === 'pct' ? `${fmt(c.diff * 100, 0)} pts` : fmt(c.diff, 1)})</span>
      <span className="text-faint"> · n = {c.nA}/{c.nB}</span>
    </div>
  );
}

function MasteryPanel() {
  const { data, states, params } = useStore();
  const rows = useMemo(() => masteryByTask(TASKS.filter((t) => !t.reserved && t.kind !== 'open'), data.blocks, states, params), [data.blocks, states, params]);
  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm text-muted"><Evidence level="observado" /> Progreso en ejercicios ya conocidos (bloques de entrenamiento, práctica libre, revisión y evaluación inicial). La línea muestra el <b>nivel de dificultad</b> alcanzado: como la dificultad se adapta para mantener la precisión cerca del {Math.round(params.targetAccuracy * 100)} %, el nivel es mejor indicador que la precisión. Parte de la mejora es esperable por pura familiaridad con la tarea.</p>
      </Card>
      {rows.length === 0 && <Empty title="Evidencia insuficiente: todavía no hay bloques de entrenamiento." />}
      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map((r) => (
          <Card key={r.task.id} title={r.task.name} actions={r.plateau ? <Badge tone="amber">estancada</Badge> : undefined}>
            <LineChart series={[{ name: 'Nivel', points: r.levelSeries }]} yDomain={[r.task.minLevel, r.task.maxLevel]} yLabel="Nivel de dificultad" />
            <div className="mt-2 space-y-0.5">
              <Comparison c={r.levelComparison} unit="nivel" label="Nivel (primeros vs últimos bloques)" />
              <Comparison c={r.comparison} label="Precisión (primeros vs últimos bloques)" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function GeneralizationPanel() {
  const { data, states, params } = useStore();
  const rows = useMemo(() => generalizationByTask(TASKS.filter((t) => !t.reserved), data.blocks, states, params), [data.blocks, states, params]);
  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm text-muted">Rendimiento en <b>variantes nuevas</b> que requieren la misma habilidad con otra forma (familias de reglas no entrenadas, otro material, otra estructura). La <b>brecha</b> compara tu precisión entrenando a niveles similares con la precisión en la variante nueva: una brecha grande indica una mejora específica de la tarea que no se generaliza (todavía).</p>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map((r) => (
          <Card key={r.task.id} title={r.task.name} subtitle={r.task.novelDescription} actions={r.status === 'insuficiente' ? <Evidence level="insuficiente" /> : <Evidence level={r.nNovel >= 4 ? 'preliminar' : 'observado'} />}>
            <LineChart series={[{ name: 'Precisión en variante nueva', points: r.series }]} yDomain={[0, 1]} percent yLabel="Precisión en variante nueva" emptyText="Evidencia insuficiente: aún no has hecho esta variante nueva." />
            <div className="mt-2 text-xs text-muted">
              Brecha entrenamiento − variante nueva: {Number.isFinite(r.gap) ? <b className={r.gap > params.generalizationGap ? 'text-amber' : 'text-ok'}>{fmt(r.gap * 100, 0)} pts</b> : 'evidencia insuficiente'} · {r.nNovel} bloques
              {r.specificOnly && <div className="mt-1 text-amber">La mejora parece específica de la tarea entrenada: no se extrapola a otras capacidades.</div>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function TransferPanel() {
  const { data } = useStore();
  const rows = transferByTask(TRANSFER_TASKS, data.blocks);
  const lt = learningTransfer(data.lessons);
  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm text-muted">Tareas <b>reservadas</b> que nunca se entrenan: series de letras, inferencia de operaciones nuevas y problemas aplicados, administradas con formas paralelas de dificultad fija, más el protocolo de aprendizaje de material nuevo. Advertencias: las formas paralelas no están equiparadas psicométricamente; repetir la prueba produce efectos de práctica propios; una mejora aquí es <Evidence level="preliminar" /> como mucho, salvo que se replique en el tiempo.</p>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map((r) => (
          <Card key={r.task.id} title={r.task.name} subtitle={r.task.objective} actions={r.series.length < 2 ? <Evidence level="insuficiente" /> : r.series.length >= 4 ? <Evidence level="preliminar" /> : <Evidence level="observado" />}>
            <LineChart series={[{ name: 'Precisión', points: r.series }]} yDomain={[0, 1]} percent yLabel="Precisión (forma fija)" emptyText="Evidencia insuficiente: prueba aún no aplicada." />
            <div className="mt-2"><Comparison c={r.comparison} label="Primera vs última aplicación" /></div>
          </Card>
        ))}
        <Card title="Aprendizaje de material nuevo" subtitle="Protocolo fijo: 8 pares, 6 s por tarjeta" actions={lt.n < 2 ? <Evidence level="insuficiente" /> : <Evidence level="observado" />}>
          <LineChart series={[{ name: 'Inmediata', points: lt.immediate }, { name: 'Diferida (≥ 20 h)', points: lt.delayed, dashed: true }]} yDomain={[0, 1]} percent emptyText="Evidencia insuficiente: protocolo aún no realizado (Aprendizaje → Prueba de aprendizaje nuevo)." />
        </Card>
      </div>
    </div>
  );
}

function ExternalPanel() {
  const store = useStore();
  const list = store.data.external.slice().sort((a, b) => a.date - b.date);
  const [f, setF] = useState({ date: new Date().toISOString().slice(0, 10), instrument: '', administeredBy: '', scoreLabel: 'Puntuación total', score: '', ciLow: '', ciHigh: '', notes: '' });
  const save = async () => {
    if (!f.instrument.trim() || !f.score) return;
    const rec: ExternalAssessment = {
      id: uid('ext'), date: new Date(f.date).getTime(), instrument: f.instrument.trim(), administeredBy: f.administeredBy.trim(), scoreLabel: f.scoreLabel.trim(),
      score: Number(f.score.replace(',', '.')), ciLow: f.ciLow ? Number(f.ciLow.replace(',', '.')) : undefined, ciHigh: f.ciHigh ? Number(f.ciHigh.replace(',', '.')) : undefined, notes: f.notes || undefined,
    };
    await store.upsert('external', [rec]);
    setF({ ...f, instrument: '', score: '', ciLow: '', ciHigh: '', notes: '' });
  };
  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm text-muted"><Evidence level="estandarizado" /> Registro manual de evaluaciones realizadas por profesionales cualificados con instrumentos autorizados. NEUROFORGE X <b>no convierte</b> sus puntuaciones internas en CI ni compara sus índices con estas cifras. Los cambios entre dos evaluaciones pueden deberse a efectos de práctica con el propio test, error de medida, regresión a la media o condiciones del día; interpreta cualquier diferencia con el profesional que te evaluó y teniendo en cuenta el intervalo de confianza.</p>
      </Card>
      <Card title="Añadir evaluación">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Fecha"><input type="date" className={inputCls} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Instrumento"><input className={inputCls} value={f.instrument} onChange={(e) => setF({ ...f, instrument: e.target.value })} placeholder="Nombre y versión del test" /></Field>
          <Field label="Administrado por"><input className={inputCls} value={f.administeredBy} onChange={(e) => setF({ ...f, administeredBy: e.target.value })} placeholder="Profesional / centro" /></Field>
          <Field label="Qué puntuación es"><input className={inputCls} value={f.scoreLabel} onChange={(e) => setF({ ...f, scoreLabel: e.target.value })} /></Field>
          <Field label="Puntuación comunicada"><input className={inputCls} inputMode="decimal" value={f.score} onChange={(e) => setF({ ...f, score: e.target.value })} /></Field>
          <Field label="IC inferior (si consta)"><input className={inputCls} inputMode="decimal" value={f.ciLow} onChange={(e) => setF({ ...f, ciLow: e.target.value })} /></Field>
          <Field label="IC superior (si consta)"><input className={inputCls} inputMode="decimal" value={f.ciHigh} onChange={(e) => setF({ ...f, ciHigh: e.target.value })} /></Field>
          <Field label="Notas"><input className={inputCls} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        </div>
        <Button className="mt-3" variant="primary" disabled={!f.instrument.trim() || !f.score} onClick={() => void save()}>Guardar evaluación</Button>
      </Card>
      <Card title="Evaluaciones registradas">
        {list.length === 0 ? <Empty title="No hay evaluaciones externas registradas" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-faint"><tr><th className="p-2">Fecha</th><th className="p-2">Instrumento</th><th className="p-2">Puntuación</th><th className="p-2">IC</th><th className="p-2">Profesional</th><th /></tr></thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.id} className="border-t border-night-700">
                    <td className="p-2">{new Date(e.date).toLocaleDateString('es-ES')}</td>
                    <td className="p-2">{e.instrument}</td>
                    <td className="p-2 tabular">{e.scoreLabel}: {e.score}</td>
                    <td className="p-2 tabular">{e.ciLow !== undefined && e.ciHigh !== undefined ? `${e.ciLow}–${e.ciHigh}` : '—'}</td>
                    <td className="p-2">{e.administeredBy || '—'}</td>
                    <td className="p-2"><Button variant="ghost" aria-label="Eliminar" onClick={() => void store.remove('external', e.id)}>✕</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.length >= 2 && <p className="mt-2 text-xs text-faint">Con dos evaluaciones, comprueba si los intervalos de confianza se solapan antes de hablar de cambio. Esta aplicación no calcula significación ni atribuye ningún cambio al entrenamiento.</p>}
      </Card>
    </div>
  );
}

function SessionNotes() {
  const { data } = useStore();
  const notes = data.sessions.filter((s) => s.notes || s.fatigueBefore || s.sleepHours).sort((a, b) => b.startedAt - a.startedAt).slice(0, 8);
  if (!notes.length) return null;
  return (
    <Card title="Notas y condiciones de las sesiones" subtitle="Contexto para interpretar las curvas (sueño, fatiga, notas).">
      <ul className="space-y-1 text-sm">
        {notes.map((s) => (
          <li key={s.id} className="text-muted">
            <span className="text-ink">{new Date(s.startedAt).toLocaleDateString('es-ES')}</span>
            {s.fatigueBefore !== undefined && ` · fatiga ${s.fatigueBefore}${s.fatigueAfter !== undefined ? `→${s.fatigueAfter}` : ''}`}
            {s.sleepHours !== undefined && ` · sueño ${s.sleepHours} h`}
            {s.notes && ` · «${s.notes}»`}
          </li>
        ))}
      </ul>
      <Button variant="ghost" className="mt-2" onClick={() => (window.location.hash = '/diario')}>Ir al diario</Button>
    </Card>
  );
}

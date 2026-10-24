import { useState } from 'react';
import { TASKS, getTask } from '../../core/registry';
import { ARM_LABEL, createExperiment, nextExperimentSession, summarizeExperiment } from '../../core/experiment';
import { fmt, pct } from '../../core/stats';
import { useStore } from '../../data/store';
import { Badge, Button, Card, Empty, Evidence, Field, PageTitle, Segmented, inputCls } from '../components/ui';
import { navigate } from '../hooks';

export function ExperimentsPage() {
  const store = useStore();
  const candidates = TASKS.filter((t) => !t.reserved && t.kind !== 'open');
  const [taskId, setTaskId] = useState('A-series');
  const [sessions, setSessions] = useState(8);
  const [minutes, setMinutes] = useState(8);
  const create = async () => {
    const t = getTask(taskId);
    const level = Math.max(t.minLevel, Math.round(store.states[taskId].level));
    await store.upsert('experiments', [createExperiment(taskId, `${t.name}: repetida vs variada`, sessions, minutes, level)]);
  };
  return (
    <div className="space-y-5">
      <PageTitle title="Modo experimental" subtitle="Compara dos estrategias de entrenamiento en ti mismo con un protocolo de alternancia fijado de antemano (ABBA BAAB), mediciones a nivel fijo antes y después, retención en la sesión siguiente y una variante nueva." />
      <Card title="Nuevo experimento">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Tarea objetivo"><select className={inputCls} value={taskId} onChange={(e) => setTaskId(e.target.value)}>{candidates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.hasNovel ? ' (con variante nueva)' : ''}</option>)}</select></Field>
          <Field label="Sesiones del protocolo"><Segmented label="Sesiones" value={sessions} onChange={setSessions} options={[6, 8, 12].map((v) => ({ value: v, label: String(v) }))} /></Field>
          <Field label="Minutos de práctica por sesión"><Segmented label="Minutos" value={minutes} onChange={setMinutes} options={[5, 8, 12].map((v) => ({ value: v, label: `${v}` }))} /></Field>
        </div>
        <ul className="mt-3 list-disc pl-5 text-xs text-muted">
          <li>{ARM_LABEL.A}</li>
          <li>{ARM_LABEL.B}</li>
          <li>Medición pre y post a nivel fijo (tu nivel actual redondeado), sin feedback. La medición inicial de cada sesión cuenta como retención de la anterior.</li>
        </ul>
        <Button className="mt-3" variant="primary" onClick={() => void create()}>Crear experimento</Button>
      </Card>
      {store.data.experiments.length === 0 && <Empty title="No hay experimentos" />}
      {store.data.experiments.slice().sort((a, b) => b.createdAt - a.createdAt).map((exp) => {
        const res = summarizeExperiment(exp);
        const next = nextExperimentSession(exp);
        return (
          <Card key={exp.id} title={exp.name} subtitle={`Nivel de medición fijo: ${exp.probeLevel} · ${exp.minutesPerSession} min de práctica por sesión`} actions={<div className="flex gap-2">{exp.status === 'terminado' ? <Badge tone="ok">terminado</Badge> : <Badge tone="cyan">activo</Badge>}<Button variant="ghost" onClick={() => { if (confirm('¿Eliminar este experimento? Los bloques registrados se conservan.')) void store.remove('experiments', exp.id); }}>Eliminar</Button></div>}>
            <p className="mb-3 text-sm"><Evidence level="hipotesis" /> {exp.hypothesis}</p>
            <div className="mb-3 flex flex-wrap gap-1.5" aria-label="Protocolo">
              {exp.schedule.map((s) => (
                <span key={s.index} className={`rounded-md border px-2 py-1 text-xs tabular ${s.post !== undefined ? 'border-ok/40 text-ok' : s === next ? 'border-cyan text-cyan' : 'border-night-500 text-faint'}`} title={s.post !== undefined ? `pre ${pct(s.pre ?? NaN)} → post ${pct(s.post)}` : 'pendiente'}>
                  {s.index + 1}·{s.arm}
                </span>
              ))}
            </div>
            {next && <Button variant="primary" onClick={() => navigate(`/sesion?modo=experimento&id=${exp.id}`)}>Hacer sesión {next.index + 1} (estrategia {next.arm})</Button>}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-xs text-faint"><tr><th className="p-2">Estrategia</th><th className="p-2">Sesiones</th><th className="p-2">Minutos</th><th className="p-2">Cambio pre→post</th><th className="p-2">Retención</th><th className="p-2">Variante nueva</th></tr></thead>
                <tbody>
                  {res.arms.map((a) => (
                    <tr key={a.arm} className="border-t border-night-700">
                      <td className="p-2">{a.arm}</td>
                      <td className="p-2 tabular">{a.n}</td>
                      <td className="p-2 tabular">{a.minutes}</td>
                      <td className="p-2 tabular">{a.n ? `${a.gain >= 0 ? '+' : ''}${fmt(a.gain * 100, 0)} pts${Number.isFinite(a.gainSd) ? ` (DE ${fmt(a.gainSd * 100, 0)})` : ''}` : '—'}</td>
                      <td className="p-2 tabular">{pct(a.retention)}</td>
                      <td className="p-2 tabular">{pct(a.novel)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm">{res.status === 'insuficiente' ? <Evidence level="insuficiente" /> : <Evidence level="preliminar" />} {res.message}</p>
            <details className="mt-2 text-xs text-muted">
              <summary className="cursor-pointer text-faint">Advertencias de interpretación</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">{res.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </details>
          </Card>
        );
      })}
    </div>
  );
}

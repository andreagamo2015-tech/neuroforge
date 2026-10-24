import { PHASES, programStatus, weeklyMinutes } from '../../core/engine/program';
import { useStore } from '../../data/store';
import { BarChart } from '../components/charts';
import { Badge, Button, Card, PageTitle, cx } from '../components/ui';

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export function ProgramPage() {
  const store = useStore();
  const { settings, data } = store;
  const status = programStatus(settings.programStart, Date.now(), settings.restDays);
  const weeks = weeklyMinutes(data.sessions, 12);
  return (
    <div className="space-y-5">
      <PageTitle title="Programa de 12 semanas" subtitle="Una estructura organizativa revisable según tus resultados. No asume que 12 semanas basten para producir ningún cambio concreto en inteligencia: es un periodo para practicar, medir y decidir con datos." />
      <Card title="Estado" actions={settings.programStart ? <Badge tone="violet">Ciclo {status.cycle} · semana {status.week}</Badge> : <Badge>sin iniciar</Badge>}>
        {settings.programStart ? (
          <p className="text-sm">Inicio: {new Date(settings.programStart).toLocaleDateString('es-ES')} · Día {status.day} · Fase actual: <b className="text-violet">{status.phase.name}</b></p>
        ) : (
          <p className="text-sm text-muted">El programa se inicia automáticamente al terminar la primera parte de la evaluación inicial, o ahora manualmente.</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => void store.saveSettings({ programStart: Date.now() })}>{settings.programStart ? 'Reiniciar programa desde hoy' : 'Iniciar programa hoy'}</Button>
        </div>
      </Card>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {PHASES.map((p) => (
          <Card key={p.id} className={cx(status.started && status.phase.id === p.id && 'ring-1 ring-violet')} title={`Fase ${p.id}: ${p.name}`} subtitle={`Semana${p.weeks[0] === p.weeks[1] ? '' : 's'} ${p.weeks[0]}${p.weeks[0] === p.weeks[1] ? '' : `–${p.weeks[1]}`}`}>
            <p className="text-sm">{p.goal}</p>
            <ul className="mt-2 list-disc pl-5 text-xs text-muted">{p.emphasis.map((e) => <li key={e}>{e}</li>)}</ul>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Días de descanso sugeridos" subtitle="El descanso forma parte del programa. No hay rachas ni penalizaciones por no entrenar.">
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d, i) => {
              const on = settings.restDays.includes(i);
              return (
                <button key={d} aria-pressed={on} onClick={() => void store.saveSettings({ restDays: on ? settings.restDays.filter((x) => x !== i) : [...settings.restDays, i] })} className={cx('rounded-lg border px-3 py-1.5 text-sm', on ? 'border-violet bg-violet/10 text-violet' : 'border-night-500 text-muted')}>
                  {d}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-faint">Recomendación orientativa: 4–5 sesiones por semana de la duración que te resulte sostenible.</p>
        </Card>
        <Card title="Minutos de práctica (12 semanas)">
          <BarChart data={weeks.map((w) => ({ label: new Date(w.weekStart).toLocaleDateString('es-ES', { day: 'numeric', month: 'numeric' }), value: w.minutes }))} unit="min" />
        </Card>
      </div>
    </div>
  );
}

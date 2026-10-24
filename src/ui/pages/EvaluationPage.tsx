import { getTask } from '../../core/registry';
import { useStore } from '../../data/store';
import { Badge, Button, Card, PageTitle } from '../components/ui';
import { navigate } from '../hooks';
import { BASELINE_PARTS } from './SessionPage';

export function EvaluationPage() {
  const { data } = useStore();
  return (
    <div className="space-y-5">
      <PageTitle title="Evaluación inicial orientativa" subtitle="Cuatro partes breves (8–15 minutos cada una). Puedes hacerlas en días distintos. Cada tarea ofrece ensayos de práctica antes de empezar. El resultado es un perfil de rendimiento observado, no un CI." />
      <div className="grid gap-4 md:grid-cols-2">
        {BASELINE_PARTS.map((part, i) => {
          const purpose = i === 3 ? 'transfer' : 'baseline';
          const done = part.tasks.filter((t) => data.blocks.some((b) => b.taskId === t && b.purpose === purpose && !b.aborted));
          const complete = done.length === part.tasks.length;
          return (
            <Card key={part.title} title={part.title} actions={complete ? <Badge tone="ok">completada</Badge> : done.length ? <Badge tone="amber">{done.length}/{part.tasks.length}</Badge> : <Badge>pendiente</Badge>}>
              <ul className="mb-4 space-y-1 text-sm">
                {part.tasks.map((t) => (
                  <li key={t} className="flex justify-between">
                    <span>{getTask(t).name}</span>
                    <span className="text-xs text-faint">{done.includes(t) ? '✓' : `~${Math.round(getTask(t).blockSeconds / 60)} min`}</span>
                  </li>
                ))}
              </ul>
              <Button variant={complete ? 'secondary' : 'primary'} onClick={() => navigate(`/sesion?modo=evaluacion&parte=${i}`)}>{complete ? 'Repetir parte' : 'Hacer esta parte'}</Button>
            </Card>
          );
        })}
      </div>
      <Card title="Cómo se interpreta">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Se registran precisión, tiempo de respuesta, nivel de dificultad alcanzado, consistencia y tipo de error.</li>
          <li>La dificultad se adapta durante la prueba para estimar el nivel en que aciertas aproximadamente la mitad de las veces (estimación latente en la escala de cada tarea).</li>
          <li>Con pocas observaciones, las estimaciones se marcan como <Badge tone="amber">provisional</Badge>.</li>
          <li>La familiaridad importa: el rendimiento de la primera vez incluye aprender cómo funciona la tarea.</li>
          <li>La parte 4 es la primera aplicación del banco de transferencia (tareas que nunca se entrenan).</li>
        </ul>
        <Button className="mt-3" onClick={() => navigate('/perfil')}>Ver perfil cognitivo</Button>
      </Card>
    </div>
  );
}

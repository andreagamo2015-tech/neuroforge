import { TASKS } from '../../core/registry';
import { MODULE_NAMES, type ModuleId } from '../../core/types';
import { useStore } from '../../data/store';
import { Badge, Button, Card, PageTitle } from '../components/ui';
import { navigate } from '../hooks';

const MODS: ModuleId[] = ['A', 'B', 'C', 'D', 'E', 'G'];

export function PracticePage() {
  const { states } = useStore();
  return (
    <div className="space-y-5">
      <PageTitle title="Práctica libre" subtitle="Elige cualquier tarea. La dificultad parte de tu nivel actual y se adapta. Las tareas del banco de transferencia no aparecen aquí: están reservadas para medir." />
      {MODS.map((m) => (
        <Card key={m} title={MODULE_NAMES[m]}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {TASKS.filter((t) => t.module === m && !t.reserved).map((t) => {
              const st = states[t.id];
              return (
                <div key={t.id} className="flex flex-col rounded-xl border border-night-600 bg-night-850/60 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold">{t.name}</h3>
                    {t.kind !== 'open' && <Badge tone="cyan">nivel {st.level.toFixed(1)}</Badge>}
                  </div>
                  <p className="mt-1 flex-1 text-xs text-muted">{t.objective}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button onClick={() => navigate(`/sesion?modo=bloque&tarea=${t.id}`)}>Practicar</Button>
                    {t.hasNovel && <Button variant="ghost" onClick={() => navigate(`/sesion?modo=bloque&tarea=${t.id}&variante=novel`)}>Variante nueva</Button>}
                  </div>
                  <div className="mt-2 text-[11px] text-faint">{st.blocks} bloques · {st.trials} ensayos</div>
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}

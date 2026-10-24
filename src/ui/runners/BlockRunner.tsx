import { useState } from 'react';
import type { BlockRecord } from '../../core/records';
import type { ItemTask, OpenTask, SequenceTask, SpeededTask, Task } from '../../core/types';
import { MODULE_NAMES, PURPOSE_LABEL } from '../../core/types';
import { getTask } from '../../core/registry';
import { mean, median } from '../../core/stats';
import { useStore } from '../../data/store';
import { Badge, Button, Stat, cx } from '../components/ui';
import { ItemRunner } from './ItemRunner';
import { SequenceRunner } from './SequenceRunner';
import { SimpleRT, SpeededRunner } from './SpeededRunner';
import { OpenRunner } from './OpenRunner';
import { useBlockRecorder, type BlockSpec } from './recorder';

type Phase = 'intro' | 'familiar' | 'calib' | 'run' | 'summary';

/** Envoltorio de un bloque: instrucciones → familiarización opcional → calibración → tarea → resumen. */
export function BlockRunner({ spec, onDone, simpleRtMs, setSimpleRt, compactIntro }: { spec: BlockSpec; onDone: (b: BlockRecord | null) => void; simpleRtMs?: number; setSimpleRt?: (ms: number) => void; compactIntro?: boolean }) {
  const task = getTask(spec.taskId);
  const store = useStore();
  const [phase, setPhase] = useState<Phase>('intro');
  const [familiarKey, setFamiliarKey] = useState(0);
  const [result, setResult] = useState<{ block: BlockRecord; reason: string } | null>(null);
  const [strategy, setStrategy] = useState<string | undefined>();
  const firstTime = (store.states[task.id]?.blocks ?? 0) === 0;
  const needsCalib = task.kind === 'speeded' && simpleRtMs === undefined;

  const start = () => setPhase(needsCalib ? 'calib' : 'run');

  if (phase === 'intro') {
    return (
      <div className="fade-in space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="cyan">{MODULE_NAMES[task.module]}</Badge>
          <Badge tone={spec.purpose === 'transfer' ? 'amber' : spec.purpose === 'novel' ? 'violet' : 'muted'}>{PURPOSE_LABEL[spec.purpose]}</Badge>
          {spec.variant === 'novel' && <Badge tone="violet">Variante nueva</Badge>}
        </div>
        <h2 className="text-xl font-semibold">{task.name}</h2>
        <p className="text-sm text-muted"><b className="text-ink">Objetivo:</b> {task.objective}</p>
        {spec.reason && <p className="text-xs text-faint">Por qué ahora: {spec.reason}</p>}
        {!compactIntro || firstTime ? (
          <ul className="list-disc space-y-1 pl-5 text-sm">{task.instructions.map((l, i) => <li key={i}>{l}</li>)}</ul>
        ) : null}
        {spec.variant === 'novel' && task.novelDescription && <p className="rounded-lg border border-violet/30 bg-violet/5 p-2 text-sm">Esta vez: {task.novelDescription}</p>}
        {spec.purpose === 'transfer' && <p className="rounded-lg border border-amber/30 bg-amber/5 p-2 text-sm">Prueba de medición: no verás la solución de cada ítem para no convertir la prueba en entrenamiento. Dificultad fija para poder comparar con aplicaciones futuras.</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={start} autoFocus>Empezar</Button>
          {task.kind !== 'open' && (
            <Button onClick={() => { setFamiliarKey((k) => k + 1); setPhase('familiar'); }}>
              {firstTime ? 'Practicar primero (recomendado)' : 'Ensayos de práctica'}
            </Button>
          )}
          <Button variant="ghost" onClick={() => onDone(null)}>Saltar bloque</Button>
        </div>
      </div>
    );
  }

  if (phase === 'familiar') {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Badge tone="violet">Familiarización — no cuenta para tus resultados</Badge>
          <Button variant="ghost" onClick={start}>Ir a la tarea real →</Button>
        </div>
        <TaskBody key={familiarKey} task={task} spec={{ ...spec, purpose: 'familiarization', nItems: task.kind === 'speeded' ? 8 : 2, fixedLevels: undefined }} onFinished={() => setPhase('intro')} />
      </div>
    );
  }

  if (phase === 'calib') {
    return <SimpleRT onDone={(ms) => { setSimpleRt?.(ms); setPhase('run'); }} />;
  }

  if (phase === 'run') {
    return (
      <TaskBody
        task={task}
        spec={spec}
        simpleRtMs={simpleRtMs}
        onFinished={(r) => {
          if (!r) return onDone(null);
          setResult(r);
          setPhase('summary');
        }}
      />
    );
  }

  // Resumen del bloque
  const b = result!.block;
  return (
    <div className="fade-in space-y-4">
      <h2 className="text-lg font-semibold">Resumen: {task.name}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Precisión" value={`${Math.round(b.accuracy * 100)} %`} tone="cyan" />
        <Stat label="Tiempo mediano" value={b.medianRt ? `${(b.medianRt / 1000).toFixed(2)} s` : '—'} hint="respuestas correctas" />
        <Stat label="Nivel" value={`${b.startLevel.toFixed(1)} → ${b.endLevel.toFixed(1)}`} tone="violet" />
        <Stat label="Ensayos" value={b.nTrials} />
      </div>
      {b.summary.length > 0 && <ul className="space-y-1 text-sm">{b.summary.map((s, i) => <li key={i}>• {s}</li>)}</ul>}
      <p className="text-xs text-muted">Ajuste de dificultad: {result!.reason}</p>
      {b.simpleRtMs !== undefined && task.kind === 'speeded' && (
        <p className="text-xs text-faint">Latencia simple de referencia (dispositivo + reacción): {Math.round(b.simpleRtMs)} ms. Tiempo de decisión estimado ≈ {b.medianRt ? Math.max(0, Math.round(b.medianRt - b.simpleRtMs)) : '—'} ms. Compara tiempos solo entre sesiones con el mismo dispositivo ({b.inputType}).</p>
      )}
      {task.kind !== 'item' && task.kind !== 'open' && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted">Estrategia principal en este bloque:</span>
          {task.strategies.map((s) => (
            <button key={s.id} aria-pressed={strategy === s.id} onClick={() => { setStrategy(s.id); void store.upsert('blocks', [{ ...b, strategy: s.id }]); }} className={cx('rounded-full border px-2.5 py-1', strategy === s.id ? 'border-cyan text-cyan' : 'border-night-500 text-muted')}>{s.label}</button>
          ))}
        </div>
      )}
      <Button variant="primary" autoFocus onClick={() => onDone(strategy ? { ...b, strategy } : b)}>Continuar</Button>
    </div>
  );
}

function TaskBody({ task, spec, simpleRtMs, onFinished }: { task: Task; spec: BlockSpec; simpleRtMs?: number; onFinished: (r: { block: BlockRecord; reason: string } | null) => void }) {
  const store = useStore();
  const rec = useBlockRecorder(task, spec);
  const familiar = spec.purpose === 'familiarization';
  const measurement = spec.purpose === 'transfer' || spec.purpose === 'experiment-probe';
  const finishFromTrials = async (extra: Record<string, number> = {}) => {
    const tr = rec.trials();
    const r = await rec.finish({
      accuracy: tr.length ? mean(tr.map((t) => t.score)) : 0,
      medianRt: tr.length ? median(tr.filter((t) => t.correct && t.rtMs).map((t) => t.rtMs!)) || null : null,
      extra,
      summary: extra.precision_operaciones !== undefined ? [`Precisión en las operaciones: ${Math.round(extra.precision_operaciones * 100)} %${extra.precision_operaciones < 0.85 ? ' (por debajo del 85 %: el span de este bloque es menos fiable)' : ''}.`] : [],
    });
    onFinished(r);
  };

  if (task.kind === 'item') {
    return <ItemRunner task={task as ItemTask} spec={spec} rec={rec} feedback={measurement ? 'none' : 'full'} askConfidence={store.settings.askConfidence && !familiar} sound={store.settings.sound} onComplete={() => void finishFromTrials()} />;
  }
  if (task.kind === 'sequence') {
    return <SequenceRunner task={task as SequenceTask} spec={spec} rec={rec} feedback={!measurement} sound={store.settings.sound} onComplete={(extra) => void finishFromTrials(extra)} />;
  }
  if (task.kind === 'speeded') {
    return (
      <SpeededRunner
        task={task as SpeededTask}
        spec={spec}
        rec={rec}
        sound={store.settings.sound}
        onComplete={async (m) => {
          const r = await rec.finish({ accuracy: m.accuracy, medianRt: Number.isFinite(m.medianRtCorrect) ? m.medianRtCorrect : null, extra: m.extra, summary: m.summary, speeded: true, simpleRtMs });
          onFinished(r);
        }}
      />
    );
  }
  const used = store.data.blocks.filter((b) => b.taskId === task.id).map((b) => (b.payload as { promptSig?: string } | undefined)?.promptSig ?? '');
  return (
    <OpenRunner
      task={task as OpenTask}
      usedSignatures={used}
      onComplete={async ({ scores, ratings, promptSig }) => {
        const r = await rec.finish({
          accuracy: scores.adecuacion,
          medianRt: null,
          extra: { fluidez: scores.fluidez, variedad: scores.variedad, originalidad: scores.originalidad, adecuacion: scores.adecuacion },
          summary: [`Fluidez ${scores.fluidez} · variedad ${scores.variedad} · originalidad ${scores.originalidad.toFixed(2)} · adecuación ${Math.round(scores.adecuacion * 100)} %`],
          payload: { promptSig, ratings },
        });
        onFinished(r);
      }}
    />
  );
}

import { useMemo, useRef, useState } from 'react';
import { uid } from '../../core/rng';
import type { BlockRecord, SessionKind, SessionRecord } from '../../core/records';
import { MODULE_NAMES, type ModuleId } from '../../core/types';
import { TASKS, getTask, tasksOfModule } from '../../core/registry';
import { planSession, TRANSFER_FORMS, type PlannedBlock, type SessionPlan } from '../../core/engine/session';
import { programStatus } from '../../core/engine/program';
import { ARM_LABEL, nextExperimentSession } from '../../core/experiment';
import { mean } from '../../core/stats';
import { useStore } from '../../data/store';
import { BlockRunner } from '../runners/BlockRunner';
import type { BlockSpec } from '../runners/recorder';
import { Badge, Button, Card, Field, PageTitle, ProgressBar, Segmented, inputCls } from '../components/ui';
import { deviceDescription, navigate } from '../hooks';

export const BASELINE_PARTS: { title: string; tasks: string[] }[] = [
  { title: 'Parte 1 · Razonamiento', tasks: ['A-series', 'A-matrices', 'E-logic', 'E-problems'] },
  { title: 'Parte 2 · Memoria de trabajo', tasks: ['B-backward', 'B-nback', 'B-filtering'] },
  { title: 'Parte 3 · Velocidad, atención y flexibilidad', tasks: ['C-symbols', 'C-flanker', 'D-switch', 'D-sorting'] },
  { title: 'Parte 4 · Línea base de transferencia', tasks: ['T-letters', 'T-operations', 'T-applied'] },
];

type Stage = 'setup' | 'plan' | 'run' | 'between' | 'end';

export function SessionPage({ query }: { query: URLSearchParams }) {
  const store = useStore();
  const mode = query.get('modo') ?? 'recomendada';
  const [stage, setStage] = useState<Stage>('setup');
  const [minutes, setMinutes] = useState<number>(Number(query.get('min')) || store.settings.sessionMinutes);
  const [fatigue, setFatigue] = useState<number | undefined>();
  const [sleep, setSleep] = useState<string>('');
  const [stress, setStress] = useState<number | undefined>();
  const [plan, setPlan] = useState<SessionPlan | null>(null);
  const [specs, setSpecs] = useState<BlockSpec[]>([]);
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState<BlockRecord[]>([]);
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [fatigueAfter, setFatigueAfter] = useState<number | undefined>();
  const [notes, setNotes] = useState('');
  const simpleRt = useRef<number | undefined>(undefined);
  const now = Date.now();
  const status = programStatus(store.settings.programStart, now, store.settings.restDays);
  const experiment = mode === 'experimento' ? store.data.experiments.find((e) => e.id === query.get('id')) : undefined;
  const expSession = experiment ? nextExperimentSession(experiment) : undefined;
  const lastTransferAt = useMemo(() => Math.max(0, ...store.data.blocks.filter((b) => b.purpose === 'transfer').map((b) => b.startedAt)) || undefined, [store.data.blocks]);

  const kind: SessionKind = mode === 'evaluacion' ? 'baseline' : mode === 'transferencia' ? 'transfer' : mode === 'experimento' ? 'experiment' : mode === 'bloque' ? 'free' : 'training';

  function buildSpecs(sessionId: string): { specs: BlockSpec[]; plan: SessionPlan | null } {
    if (mode === 'evaluacion') {
      const part = BASELINE_PARTS[Number(query.get('parte') ?? 0)] ?? BASELINE_PARTS[0];
      return { plan: null, specs: part.tasks.map((t) => (t.startsWith('T-') ? { taskId: t, purpose: 'transfer', variant: 'train', sessionId, fixedLevels: TRANSFER_FORMS[t], reason: 'Primera aplicación del banco de transferencia (línea base).' } : { taskId: t, purpose: 'baseline', variant: 'train', sessionId, reason: 'Evaluación inicial orientativa: la dificultad se adapta para estimar tu nivel de partida.' })) };
    }
    if (mode === 'transferencia') {
      return { plan: null, specs: Object.keys(TRANSFER_FORMS).map((t) => ({ taskId: t, purpose: 'transfer', variant: 'train', sessionId, fixedLevels: TRANSFER_FORMS[t], reason: 'Batería de transferencia con formas paralelas de dificultad fija.' })) };
    }
    if (mode === 'bloque') {
      const t = getTask(query.get('tarea') ?? 'A-series');
      const variant = query.get('variante') === 'novel' ? 'novel' : 'train';
      return { plan: null, specs: [{ taskId: t.id, purpose: variant === 'novel' ? 'novel' : 'free', variant, sessionId, reason: 'Práctica libre elegida por ti.' }] };
    }
    if (mode === 'experimento' && experiment && expSession) {
      const target = getTask(experiment.targetTaskId);
      const L = experiment.probeLevel;
      const probe = (phase: BlockSpec['experimentPhase'], variant: 'train' | 'novel' = 'train'): BlockSpec => ({ taskId: target.id, purpose: 'experiment-probe', variant, sessionId, fixedLevels: [L], nItems: target.kind === 'speeded' ? undefined : 6, experimentId: experiment.id, experimentArm: expSession.arm, experimentPhase: phase, reason: `Medición ${phase === 'pre' ? 'inicial' : phase === 'post' ? 'final' : 'con variante nueva'} a nivel fijo ${L}.` });
      const practice: BlockSpec[] = [];
      let budget = experiment.minutesPerSession * 60;
      const related = tasksOfModule(target.module).filter((t) => t.id !== target.id && t.kind !== 'open');
      let k = 0;
      while (budget > 60 && k < 12) {
        let spec: BlockSpec;
        if (expSession.arm === 'A') spec = { taskId: target.id, purpose: 'experiment-train', variant: 'train', sessionId, experimentId: experiment.id, experimentArm: 'A', experimentPhase: 'practica', reason: ARM_LABEL.A };
        else {
          const opts = [target.id, ...related.map((t) => t.id)];
          const id = opts[k % opts.length];
          spec = { taskId: id, purpose: 'experiment-train', variant: id === target.id && target.hasNovel && k % 2 === 1 ? 'novel' : 'train', sessionId, experimentId: experiment.id, experimentArm: 'B', experimentPhase: 'practica', reason: ARM_LABEL.B };
        }
        budget -= getTask(spec.taskId).blockSeconds;
        practice.push(spec);
        k++;
      }
      const list = [probe('pre'), ...practice, probe('post')];
      if (target.hasNovel) list.push(probe('nueva', 'novel'));
      return { plan: null, specs: list };
    }
    const p = planSession(
      { tasks: TASKS, states: store.states, blocks: store.data.blocks, trials: store.data.trials, goals: store.settings.goals, params: store.params },
      { minutes, fatigue, program: status, lastTransferAt, now },
    );
    return { plan: p, specs: p.blocks.map((b: PlannedBlock) => ({ taskId: b.taskId, purpose: b.purpose, variant: b.variant, sessionId, focus: b.focus, levelOffset: b.levelOffset, fixedLevels: b.fixedLevels, reason: b.reason })) };
  }

  async function begin() {
    const s: SessionRecord = {
      id: uid('ses'),
      kind,
      startedAt: Date.now(),
      plannedMinutes: minutes,
      activeSeconds: 0,
      fatigueBefore: fatigue,
      sleepHours: sleep ? Number(sleep.replace(',', '.')) : undefined,
      stress,
      week: status.started ? status.week : undefined,
      phase: status.started ? status.phase.id : undefined,
      device: deviceDescription(),
    };
    const built = buildSpecs(s.id);
    s.plan = built.specs.map((b) => `${getTask(b.taskId).name} (${b.purpose})`);
    setSession(s);
    setSpecs(built.specs);
    setPlan(built.plan);
    await store.upsert('sessions', [s]);
    setStage(built.plan ? 'plan' : 'run');
  }

  async function onBlockDone(b: BlockRecord | null) {
    const nextDone = b ? [...done, b] : done;
    setDone(nextDone);
    if (session && b) {
      const s = { ...session, activeSeconds: session.activeSeconds + Math.round((b.endedAt - b.startedAt) / 1000) };
      setSession(s);
      await store.upsert('sessions', [s]);
    }
    if (idx + 1 >= specs.length) setStage('end');
    else {
      setIdx(idx + 1);
      setStage('between');
    }
  }

  async function finishSession(aborted = false) {
    if (!session) return navigate('/');
    const summary = done.map((b) => `${getTask(b.taskId).name}: ${Math.round(b.accuracy * 100)} % · nivel ${b.startLevel.toFixed(1)}→${b.endLevel.toFixed(1)}`);
    const s: SessionRecord = { ...session, endedAt: Date.now(), fatigueAfter, notes: notes || undefined, aborted, summary };
    await store.upsert('sessions', [s]);
    if (experiment && expSession && !aborted) {
      const get = (ph: string) => done.find((b) => b.experimentId === experiment.id && b.experimentPhase === ph)?.accuracy;
      const sched = experiment.schedule.map((x) => {
        if (x.index === expSession.index) return { ...x, sessionId: session.id, date: Date.now(), pre: get('pre'), post: get('post'), novel: get('nueva'), minutes: Math.round(done.filter((b) => b.experimentPhase === 'practica').reduce((a, b) => a + (b.endedAt - b.startedAt), 0) / 60000) };
        // la medición inicial de esta sesión sirve como retención de la sesión anterior
        if (x.index === expSession.index - 1 && x.retention === undefined) return { ...x, retention: get('pre') };
        return x;
      });
      const finished = sched.every((x) => x.post !== undefined);
      await store.upsert('experiments', [{ ...experiment, schedule: sched, status: finished ? 'terminado' : 'activo' }]);
    }
    if (kind === 'baseline' && !store.settings.programStart) await store.saveSettings({ programStart: Date.now() });
    navigate(mode === 'experimento' ? '/experimentos' : mode === 'evaluacion' ? '/evaluacion' : '/');
  }

  // ---------- Vistas ----------
  if (stage === 'setup') {
    const title = mode === 'evaluacion' ? BASELINE_PARTS[Number(query.get('parte') ?? 0)]?.title ?? 'Evaluación' : mode === 'transferencia' ? 'Batería de transferencia' : mode === 'experimento' ? `Experimento: ${experiment?.name ?? ''}` : mode === 'bloque' ? `Práctica libre: ${getTask(query.get('tarea') ?? 'A-series').name}` : 'Sesión recomendada';
    if (mode === 'experimento' && (!experiment || !expSession)) return <Card title="Experimento no disponible"><Button onClick={() => navigate('/experimentos')}>Volver</Button></Card>;
    return (
      <div className="mx-auto max-w-2xl">
        <PageTitle title={title} subtitle="Las condiciones de la sesión son opcionales. Ayudan a interpretar los resultados (fatiga, sueño y estrés influyen en el rendimiento)." />
        <Card>
          <div className="space-y-4">
            {mode === 'recomendada' && (
              <Field label="Duración">
                <Segmented label="Duración" value={minutes} onChange={setMinutes} options={[10, 20, 30, 45].map((m) => ({ value: m, label: `${m} min` }))} />
              </Field>
            )}
            {mode === 'experimento' && expSession && (
              <p className="text-sm">Sesión {expSession.index + 1} de {experiment!.schedule.length}. Estrategia asignada por el protocolo: <Badge tone="violet">{ARM_LABEL[expSession.arm]}</Badge></p>
            )}
            <Field label="Fatiga ahora mismo (opcional)" hint="1 = nada cansado · 5 = muy cansado">
              <Segmented label="Fatiga" value={fatigue ?? 0} onChange={(v) => setFatigue(v || undefined)} options={[{ value: 0, label: '—' }, ...[1, 2, 3, 4, 5].map((v) => ({ value: v, label: String(v) }))]} />
            </Field>
            {fatigue !== undefined && fatigue >= store.params.fatigueLightThreshold && mode === 'recomendada' && (
              <p className="rounded-lg border border-amber/30 bg-amber/5 p-2 text-sm text-amber">Fatiga alta: se propondrá una sesión ligera. También puedes descansar hoy; no se pierde nada.</p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Horas de sueño anoche (opcional)"><input className={inputCls} inputMode="decimal" value={sleep} onChange={(e) => setSleep(e.target.value)} placeholder="p. ej. 7,5" /></Field>
              <Field label="Estrés (opcional)"><Segmented label="Estrés" value={stress ?? 0} onChange={(v) => setStress(v || undefined)} options={[{ value: 0, label: '—' }, ...[1, 2, 3, 4, 5].map((v) => ({ value: v, label: String(v) }))]} /></Field>
            </div>
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => void begin()}>Continuar</Button>
              <Button variant="ghost" onClick={() => navigate('/')}>Cancelar</Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (stage === 'plan' && plan) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageTitle title="Plan de la sesión" subtitle={`${plan.minutes} minutos${plan.light ? ' · sesión ligera' : ''}. El motor adaptativo explica por qué elige cada bloque.`} />
        {plan.notes.map((n, i) => <p key={i} className="mb-3 rounded-lg border border-amber/30 bg-amber/5 p-2 text-sm">{n}</p>)}
        <Card>
          <ol className="space-y-3">
            {plan.blocks.map((b, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-night-700 text-xs text-cyan">{i + 1}</span>
                <div>
                  <div className="text-sm font-medium">{getTask(b.taskId).name} <Badge tone={b.role === 'transferencia' ? 'amber' : 'muted'}>{b.role}</Badge> {b.variant === 'novel' && <Badge tone="violet">variante nueva</Badge>}</div>
                  <div className="text-xs text-muted">{b.reason} · ~{Math.round(b.estSeconds / 60)} min</div>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex gap-2">
            <Button variant="primary" onClick={() => setStage('run')} autoFocus>Comenzar</Button>
            <Button variant="ghost" onClick={() => void finishSession(true)}>Cancelar</Button>
          </div>
        </Card>
      </div>
    );
  }

  if (stage === 'between') {
    const accs = done.map((b) => b.accuracy);
    const fatigueSignal = accs.length >= 3 && mean(accs.slice(-2)) < mean(accs.slice(0, 2)) - 0.2;
    return (
      <div className="mx-auto max-w-2xl">
        <Card title={`Bloque ${idx} de ${specs.length} completado`}>
          <ProgressBar value={idx / specs.length} label="Progreso de la sesión" />
          {fatigueSignal && <p className="mt-3 rounded-lg border border-amber/30 bg-amber/5 p-2 text-sm">Tu precisión ha bajado en los últimos bloques. Puede ser fatiga: tómate una pausa o termina aquí. Terminar antes no es un fracaso.</p>}
          <p className="mt-3 text-sm text-muted">Siguiente: <b className="text-ink">{getTask(specs[idx].taskId).name}</b></p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" autoFocus onClick={() => setStage('run')}>Continuar</Button>
            <Button onClick={() => setStage('end')}>Terminar sesión aquí</Button>
          </div>
        </Card>
      </div>
    );
  }

  if (stage === 'run' && specs[idx]) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-xs text-faint">Bloque {idx + 1} de {specs.length}</span>
          <Button variant="ghost" onClick={() => setStage('end')} aria-label="Detener la sesión">■ Detener sesión</Button>
        </div>
        <ProgressBar value={idx / specs.length} label="Progreso de la sesión" />
        <Card className="mt-3">
          <BlockRunner key={idx} spec={specs[idx]} onDone={(b) => void onBlockDone(b)} simpleRtMs={simpleRt.current} setSimpleRt={(ms) => (simpleRt.current = ms)} compactIntro={kind === 'training'} />
        </Card>
      </div>
    );
  }

  // Fin de sesión
  const next = planSession({ tasks: TASKS, states: store.states, blocks: store.data.blocks, trials: store.data.trials, goals: store.settings.goals, params: store.params }, { minutes: store.settings.sessionMinutes, program: status, lastTransferAt, now: Date.now() + 86400000 });
  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="Resumen de la sesión" subtitle="Resultados observados en esta sesión. Una sola sesión no permite conclusiones sobre cambios de capacidad." />
      <Card>
        {done.length === 0 ? <p className="text-sm text-muted">No se completó ningún bloque.</p> : (
          <ul className="space-y-2 text-sm">
            {done.map((b) => (
              <li key={b.id} className="flex flex-wrap justify-between gap-2 border-b border-night-700 pb-2">
                <span>{getTask(b.taskId).name} <span className="text-xs text-faint">({MODULE_NAMES[b.module as ModuleId]})</span></span>
                <span className="tabular text-muted">{Math.round(b.accuracy * 100)} % · nivel {b.startLevel.toFixed(1)} → {b.endLevel.toFixed(1)}</span>
              </li>
            ))}
          </ul>
        )}
        {kind === 'training' && next.blocks[1] && (
          <p className="mt-4 text-sm"><span className="text-violet">Recomendación para la próxima sesión:</span> {getTask(next.blocks[1].taskId).name} — {next.blocks[1].reason}</p>
        )}
        <div className="mt-4 space-y-3">
          <Field label="Fatiga al terminar (opcional)">
            <Segmented label="Fatiga final" value={fatigueAfter ?? 0} onChange={(v) => setFatigueAfter(v || undefined)} options={[{ value: 0, label: '—' }, ...[1, 2, 3, 4, 5].map((v) => ({ value: v, label: String(v) }))]} />
          </Field>
          <Field label="Notas de la sesión (opcional)"><textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Distracciones, estrategias nuevas, sensaciones…" /></Field>
          <Button variant="primary" onClick={() => void finishSession(false)}>Guardar y salir</Button>
        </div>
      </Card>
    </div>
  );
}

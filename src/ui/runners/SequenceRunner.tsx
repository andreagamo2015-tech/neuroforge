import { useEffect, useRef, useState } from 'react';
import type { SeqScore, SeqTrial, SequenceTask } from '../../core/types';
import { generateValidTrial, clampLevel } from '../../core/registry';
import { Badge, Button, cx } from '../components/ui';
import { beep, useKey } from '../hooks';
import type { BlockSpec, Recorder } from './recorder';

type Phase = 'ready' | 'blank' | 'stim' | 'proc' | 'recall' | 'feedback';

export function SequenceRunner({ task, spec, rec, feedback, sound, onComplete }: { task: SequenceTask; spec: BlockSpec; rec: Recorder; feedback: boolean; sound: boolean; onComplete: (extra: Record<string, number>) => void }) {
  const n = spec.nItems ?? spec.fixedLevels?.length ?? task.trialsPerBlock;
  const make = (i: number) => generateValidTrial(task, clampLevel(task, Math.round(rec.fixedLevelAt(i))), spec.variant, rec.seen());
  const [index, setIndex] = useState(0);
  const [trial, setTrial] = useState<SeqTrial>(() => make(0));
  const [phase, setPhase] = useState<Phase>('ready');
  const [pos, setPos] = useState(0);
  const [typed, setTyped] = useState<string[]>([]);
  const [result, setResult] = useState<SeqScore | null>(null);
  const proc = useRef<{ correct: number; total: number }>({ correct: 0, total: 0 });
  const procAnswered = useRef(false);
  const t0 = useRef(0);

  // Avance automático de la presentación
  useEffect(() => {
    let timer: number | undefined;
    if (phase === 'ready') timer = window.setTimeout(() => { setPos(0); setPhase(trial.stimuli[0].processing ? 'proc' : 'stim'); }, 900);
    if (phase === 'stim') timer = window.setTimeout(() => setPhase('blank'), trial.durationMs);
    if (phase === 'blank') {
      timer = window.setTimeout(() => {
        const next = pos + 1;
        if (next >= trial.stimuli.length) {
          setPhase('recall');
          t0.current = performance.now();
        } else {
          setPos(next);
          setPhase(trial.stimuli[next].processing ? 'proc' : 'stim');
        }
      }, trial.isiMs);
    }
    if (phase === 'proc') {
      procAnswered.current = false;
      timer = window.setTimeout(() => answerProc(null), 5000);
    }
    return () => window.clearTimeout(timer);
  }, [phase, pos, trial]); // eslint-disable-line react-hooks/exhaustive-deps

  function answerProc(v: boolean | null) {
    if (procAnswered.current) return;
    procAnswered.current = true;
    const truth = trial.stimuli[pos].processing!.truth;
    proc.current.total++;
    if (v === truth) proc.current.correct++;
    setPhase('stim');
  }

  function submit(resp: string[] | number) {
    const rt = performance.now() - t0.current;
    const s = task.score(trial, resp);
    const chunk = (trial.meta as { chunkable?: boolean } | undefined)?.chunkable;
    rec.recordTrial({
      correct: s.correct,
      score: s.partial,
      rtMs: rt,
      errorTag: s.errorTag,
      signature: trial.signature,
      level: trial.level,
      condition: task.id === 'B-backward' && trial.variant === 'train' && trial.stimuli.length >= 4 ? (chunk ? 'agrupable' : 'no-agrupable') : undefined,
    });
    beep(s.correct ? 'ok' : 'error', sound);
    setResult(s);
    if (feedback) setPhase('feedback');
    else next();
  }

  function next() {
    const i = index + 1;
    if (i >= n) {
      const extra: Record<string, number> = {};
      if (proc.current.total) extra.precision_operaciones = proc.current.correct / proc.current.total;
      onComplete(extra);
      return;
    }
    setIndex(i);
    setTrial(make(i));
    setTyped([]);
    setResult(null);
    setPhase('ready');
  }

  const alphabet = trial.recall.type === 'ordered' ? trial.recall.alphabet : [];
  useKey((e) => {
    if (phase === 'proc') {
      e.preventDefault();
      if (e.key.toLowerCase() === 'v') answerProc(true);
      if (e.key.toLowerCase() === 'f') answerProc(false);
    } else if (phase === 'recall' && trial.recall.type === 'ordered') {
      const k = e.key.toUpperCase();
      if (alphabet.includes(k)) setTyped((t) => [...t, k]);
      else if (e.key === 'Backspace') setTyped((t) => t.slice(0, -1));
      else if (e.key === 'Enter' && typed.length) {
        // evita que el mismo Intro active el botón «Siguiente» que recibe el foco
        e.preventDefault();
        submit(typed);
      }
    } else if (phase === 'recall' && trial.recall.type === 'choice') {
      const k = Number(e.key);
      if (k >= 1 && k <= trial.recall.options.length) {
        e.preventDefault();
        submit(k - 1);
      }
    } else if (phase === 'feedback' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      next();
    }
  });

  const stim = trial.stimuli[pos];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-faint">
        <span>Ensayo {index + 1} de {n}</span>
        <span className="tabular">Nivel {trial.level.toFixed(1)}</span>
      </div>
      <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-night-600 bg-night-950/50 p-6" aria-live="assertive">
        {phase === 'ready' && <span className="text-sm text-muted">Preparado…</span>}
        {phase === 'stim' && (
          <span className={cx('font-mono text-6xl font-semibold', stim.role === 'distractor' ? 'text-violet' : 'text-cyan')}>
            {stim.role === 'distractor' ? `[${stim.text}]` : stim.text}
          </span>
        )}
        {phase === 'proc' && stim.processing && (
          <div className="text-center">
            <div className="font-mono text-4xl">{stim.processing.statement}</div>
            <div className="mt-4 flex justify-center gap-3">
              <Button onClick={() => answerProc(true)}>Verdadero (V)</Button>
              <Button onClick={() => answerProc(false)}>Falso (F)</Button>
            </div>
          </div>
        )}
        {phase === 'recall' && trial.recall.type === 'ordered' && (
          <div className="w-full max-w-md space-y-3 text-center">
            <div className="text-sm text-muted">{trial.recallPrompt}</div>
            <div className="min-h-[44px] rounded-xl border border-night-500 bg-night-850 p-2 font-mono text-3xl tracking-[0.3em] text-cyan" aria-label={`Escrito: ${typed.join(' ')}`}>{typed.join('') || ' '}</div>
            <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-9">
              {trial.recall.alphabet.map((a) => (
                <button key={a} onClick={() => setTyped((t) => [...t, a])} className="rounded-lg border border-night-500 bg-night-800 py-2 font-mono text-sm hover:border-cyan">{a}</button>
              ))}
            </div>
            <div className="flex justify-center gap-2">
              <Button variant="ghost" onClick={() => setTyped((t) => t.slice(0, -1))}>⌫ Borrar</Button>
              <Button variant="primary" disabled={!typed.length} onClick={() => submit(typed)}>Enviar (Intro)</Button>
            </div>
          </div>
        )}
        {phase === 'recall' && trial.recall.type === 'choice' && (
          <div className="space-y-3 text-center">
            <div className="text-base font-medium">{trial.recall.question}</div>
            <div className="flex flex-wrap justify-center gap-2">
              {trial.recall.options.map((o, i) => <Button key={o} onClick={() => submit(i)}>{i + 1}. {o}</Button>)}
            </div>
          </div>
        )}
        {phase === 'feedback' && result && (
          <div className="fade-in space-y-2 text-center text-sm">
            <div className={cx('text-lg font-semibold', result.correct ? 'text-ok' : 'text-bad')}>{result.correct ? '✓ Correcto' : `✗ ${Math.round(result.partial * 100)} % de posiciones correctas`}</div>
            {trial.explanation.map((l, i) => <div key={i} className="font-mono text-muted">{l}</div>)}
            {!result.correct && result.errorTag && task.errorAdvice[result.errorTag] && (
              <div className="mx-auto max-w-md rounded-xl border border-amber/30 bg-amber/5 p-2 text-left text-xs">
                <b className="text-amber">Qué falló:</b> {task.errorAdvice[result.errorTag].meaning} <br />
                <b className="text-amber">Mejor alternativa:</b> {task.errorAdvice[result.errorTag].better}
              </div>
            )}
            <Button variant="primary" autoFocus onClick={next}>{index + 1 >= n ? 'Terminar bloque' : 'Siguiente'} (Intro)</Button>
          </div>
        )}
      </div>
      {task.id === 'B-complex' && proc.current.total > 0 && (
        <div className="text-xs text-faint">Precisión en operaciones: <Badge tone={proc.current.correct / proc.current.total >= 0.85 ? 'ok' : 'amber'}>{Math.round((proc.current.correct / proc.current.total) * 100)} %</Badge> (objetivo ≥ 85 %)</div>
      )}
    </div>
  );
}

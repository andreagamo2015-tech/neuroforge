import { useEffect, useMemo, useRef, useState } from 'react';
import { createRng, randomSeed } from '../../core/rng';
import type { SpeedBlockMetrics, SpeedJudgement, SpeedStimulus, SpeedTrial, SpeedTrialResult, SpeededTask } from '../../core/types';
import { ANTICIPATION_MS } from '../../core/tasks/speeded';
import { CellSvg, FIG_COLORS } from '../components/Figure';
import { cx } from '../components/ui';
import { beep } from '../hooks';
import type { BlockSpec, Recorder } from './recorder';

type Phase = 'countdown' | 'iti' | 'stim' | 'fb' | 'done';

export function SpeededRunner({ task, spec, rec, sound, onComplete }: { task: SpeededTask; spec: BlockSpec; rec: Recorder; sound: boolean; onComplete: (m: SpeedBlockMetrics) => void }) {
  const level = rec.level();
  const trials = useMemo<SpeedTrial[]>(() => {
    const all = task.generateBlock(createRng(randomSeed()), level, spec.variant);
    return spec.nItems ? all.slice(0, spec.nItems) : all;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const judge = useMemo<(t: SpeedTrial, r: string) => SpeedJudgement>(() => task.createJudge?.() ?? ((t, r) => ({ correct: t.correct === r })), [task]);
  const [phase, setPhase] = useState<Phase>('countdown');
  const [count, setCount] = useState(3);
  const [i, setI] = useState(0);
  const [fb, setFb] = useState<boolean | null>(null);
  const onset = useRef(0);
  const answered = useRef(false);
  const results = useRef<SpeedTrialResult[]>([]);
  const timeout = task.timeoutMs(level);

  useEffect(() => {
    let timer: number | undefined;
    if (phase === 'countdown') {
      timer = window.setTimeout(() => (count > 1 ? setCount(count - 1) : setPhase('iti')), 700);
    } else if (phase === 'iti') {
      timer = window.setTimeout(() => setPhase('stim'), task.itiMs);
    } else if (phase === 'stim') {
      answered.current = false;
      // el inicio se toma en el siguiente fotograma pintado, no al ordenar el render
      const raf = requestAnimationFrame(() => {
        onset.current = performance.now();
      });
      timer = window.setTimeout(() => respond('none'), timeout);
      return () => {
        cancelAnimationFrame(raf);
        window.clearTimeout(timer);
      };
    } else if (phase === 'fb') {
      timer = window.setTimeout(() => advance(), 650);
    }
    return () => window.clearTimeout(timer);
  }, [phase, count, i]); // eslint-disable-line react-hooks/exhaustive-deps

  function respond(value: string) {
    if (phase !== 'stim' || answered.current) return;
    answered.current = true;
    const t = trials[i];
    const rt = value === 'none' ? null : performance.now() - (onset.current || performance.now());
    const j = judge(t, value);
    const anticipation = rt !== null && rt < ANTICIPATION_MS;
    results.current.push({ index: i, condition: t.condition, response: value, rtMs: rt, correct: j.correct && !anticipation, errorTag: anticipation ? 'anticipacion' : j.errorTag, anticipation });
    rec.recordTrial({ correct: j.correct && !anticipation, rtMs: rt, errorTag: anticipation ? 'anticipacion' : j.errorTag, condition: t.condition }, false);
    if (task.feedbackPerTrial) {
      beep(j.correct ? 'ok' : 'error', sound);
      setFb(j.correct);
      setPhase('fb');
    } else advance();
  }

  function advance() {
    const next = i + 1;
    if (next >= trials.length) {
      setPhase('done');
      onComplete(task.metrics(results.current, trials));
      return;
    }
    setFb(null);
    setI(next);
    setPhase('iti');
  }

  // Teclado: respuesta inmediata en keydown
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const def = task.responses.find((r) => r.key === e.key.toLowerCase());
      if (def) {
        e.preventDefault();
        respond(def.value);
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  const t = trials[Math.min(i, trials.length - 1)];
  return (
    <div className="space-y-4 select-none">
      <div className="flex items-center justify-between text-xs text-faint">
        <span>Ensayo {Math.min(i + 1, trials.length)} de {trials.length}</span>
        <span className="tabular">Nivel {level.toFixed(1)} · límite {(timeout / 1000).toFixed(1)} s</span>
      </div>
      <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-night-600 bg-night-950/60 p-4">
        {phase === 'countdown' && <span className="text-5xl font-semibold text-cyan tabular">{count}</span>}
        {phase === 'iti' && <span className="text-3xl text-faint">+</span>}
        {(phase === 'stim' || phase === 'fb') && t.stimulus.type !== 'card' && <Stimulus s={t.stimulus} />}
        {(phase === 'stim' || phase === 'fb') && t.stimulus.type === 'card' && (
          <div className="text-center">
            <CellSvg cell={t.stimulus.card} size={120} />
            {phase === 'fb' && <div className={cx('mt-2 text-lg font-semibold', fb ? 'text-ok' : 'text-bad')}>{fb ? 'Correcto' : 'Incorrecto'}</div>}
          </div>
        )}
      </div>
      {t.stimulus.type === 'card' ? (
        <div className="grid grid-cols-4 gap-2">
          {t.stimulus.references.map((c, k) => (
            <button key={k} onPointerDown={(e) => { e.preventDefault(); respond(String(k)); }} className="flex flex-col items-center rounded-xl border border-night-500 bg-night-850 p-2 hover:border-cyan" aria-label={`Carta ${k + 1}`}>
              <CellSvg cell={c} size={72} />
              <span className="mt-1 font-mono text-xs text-cyan">{k + 1}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className={cx('grid gap-3', task.responses.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
          {task.responses.map((r) => (
            <button key={r.value} onPointerDown={(e) => { e.preventDefault(); respond(r.value); }} className="rounded-2xl border border-night-500 bg-night-800 py-5 text-lg font-medium hover:border-cyan active:bg-night-600">
              {r.label} <span className="ml-1 font-mono text-xs text-faint">[{r.key === ' ' ? 'Espacio' : r.key.toUpperCase()}]</span>
            </button>
          ))}
        </div>
      )}
      <p className="text-center text-[11px] text-faint">Los tiempos se miden desde que el estímulo se pinta en pantalla. Se descartan respuestas anteriores a {ANTICIPATION_MS} ms.</p>
    </div>
  );
}

function Stimulus({ s }: { s: SpeedStimulus }) {
  if (s.type === 'text') {
    return (
      <div className="text-center">
        {s.cue !== undefined && <div className="mb-3 h-5 text-sm font-semibold tracking-widest" style={{ color: s.cueColor ? FIG_COLORS[s.cueColor] : '#9aa6c4' }}>{s.cue}</div>}
        <div className={cx('font-mono font-semibold', s.big ? 'text-6xl sm:text-7xl' : 'text-4xl')} style={{ color: s.color ? FIG_COLORS[s.color] : '#e6ebf5' }}>{s.text}</div>
      </div>
    );
  }
  if (s.type === 'pair') {
    return (
      <div className="space-y-3 text-center font-mono text-3xl tracking-[0.25em] sm:text-4xl">
        <div className="text-cyan-soft">{s.left}</div>
        <div className="text-violet">{s.right}</div>
      </div>
    );
  }
  if (s.type === 'search') {
    return (
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${s.cols}, minmax(0, 1fr))` }} aria-label="Escena de búsqueda">
        {s.cells.map((c, k) => (
          <span key={k} className="flex h-7 w-7 items-center justify-center font-mono text-xl text-ink sm:h-8 sm:w-8" style={{ transform: `rotate(${c.rotation}deg)` }}>{c.glyph}</span>
        ))}
      </div>
    );
  }
  return null;
}

export function SimpleRT({ onDone }: { onDone: (medianMs: number) => void }) {
  const [state, setState] = useState<'wait' | 'go' | 'early'>('wait');
  const [n, setN] = useState(0);
  const rts = useRef<number[]>([]);
  const onset = useRef(0);
  const N = 5;
  useEffect(() => {
    if (state !== 'wait') return;
    const tm = window.setTimeout(() => {
      setState('go');
      requestAnimationFrame(() => (onset.current = performance.now()));
    }, 900 + Math.random() * 1300);
    return () => window.clearTimeout(tm);
  }, [state, n]);
  const press = () => {
    if (state === 'wait') { setState('early'); setTimeout(() => setState('wait'), 700); return; }
    if (state !== 'go') return;
    rts.current.push(performance.now() - onset.current);
    if (rts.current.length >= N) {
      const s = rts.current.slice().sort((a, b) => a - b);
      onDone(s[Math.floor(s.length / 2)]);
      return;
    }
    setN((x) => x + 1);
    setState('wait');
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === ' ') { e.preventDefault(); press(); } };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });
  return (
    <div className="space-y-3 text-center">
      <p className="text-sm text-muted">Calibración de latencia ({rts.current.length}/{N}): pulsa ESPACIO o toca el recuadro en cuanto aparezca el círculo. Sirve para estimar el retardo de tu dispositivo y tu tiempo de reacción simple.</p>
      <button onPointerDown={(e) => { e.preventDefault(); press(); }} className="mx-auto flex h-48 w-full max-w-sm items-center justify-center rounded-2xl border border-night-500 bg-night-950/60" aria-label="Zona de respuesta">
        {state === 'go' && <span className="h-20 w-20 rounded-full bg-cyan" />}
        {state === 'early' && <span className="text-sm text-amber">Demasiado pronto</span>}
        {state === 'wait' && <span className="text-faint">Espera…</span>}
      </button>
    </div>
  );
}

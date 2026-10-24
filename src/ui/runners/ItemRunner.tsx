import { useEffect, useMemo, useRef, useState } from 'react';
import type { Item, ItemTask } from '../../core/types';
import { checkItemAnswer, correctAnswerLabel } from '../../core/tasks/common';
import { generateItemBlock, generateValidItem, clampLevel } from '../../core/registry';
import { Figure } from '../components/Figure';
import { Badge, Button, cx, inputCls } from '../components/ui';
import { beep, useKey } from '../hooks';
import type { BlockSpec, Recorder } from './recorder';

export type FeedbackMode = 'full' | 'none';

const CONFIDENCE = [
  { v: 0.1, label: 'Al azar' },
  { v: 0.35, label: 'Baja' },
  { v: 0.6, label: 'Media' },
  { v: 0.8, label: 'Alta' },
  { v: 0.97, label: 'Segura' },
];

export interface ItemBlockResult {
  accuracy: number;
  medianRt: number | null;
}

export function ItemRunner({ task, spec, rec, feedback, askConfidence, sound, onComplete }: { task: ItemTask; spec: BlockSpec; rec: Recorder; feedback: FeedbackMode; askConfidence: boolean; sound: boolean; onComplete: () => void }) {
  const n = spec.nItems ?? spec.fixedLevels?.length ?? task.itemsPerBlock;
  // bloques con orden significativo (p. ej. jarras) se generan completos al inicio
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const preset = useMemo(() => (task.generateBlock && !spec.focus ? generateItemBlock(task, rec.level(), spec.variant, n, rec.seen()) : null), []);
  const [index, setIndex] = useState(0);
  const makeItem = (i: number): Item => (preset ? preset[i] : generateValidItem(task, clampLevel(task, rec.fixedLevelAt(i)), spec.variant, rec.seen(), spec.focus));
  const [item, setItem] = useState<Item>(() => makeItem(0));
  const [phase, setPhase] = useState<'question' | 'feedback' | 'worked'>('question');
  const [answer, setAnswer] = useState('');
  const [choice, setChoice] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<number | undefined>();
  const [strategy, setStrategy] = useState<string | undefined>();
  const [last, setLast] = useState<{ correct: boolean; errorTag?: string; given: string } | null>(null);
  const [worked, setWorked] = useState<Item | null>(null);
  const t0 = useRef(performance.now());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    t0.current = performance.now();
    if (phase === 'question') inputRef.current?.focus();
  }, [item, phase]);

  const submit = (raw: number | string) => {
    if (phase !== 'question') return;
    if (item.response.type !== 'choice' && String(raw).trim() === '') return;
    const rt = performance.now() - t0.current;
    const correct = checkItemAnswer(item, raw);
    let errorTag: string | undefined;
    if (!correct) {
      errorTag = item.response.type === 'choice' ? item.response.options[Number(raw)]?.errorTag : task.diagnose?.(item, raw);
    }
    const given = item.response.type === 'choice' ? item.response.options[Number(raw)]?.label ?? '' : String(raw);
    rec.recordTrial({ correct, rtMs: rt, confidence, errorTag, focusKey: item.focusKey, demand: item.demand, signature: item.signature, level: item.level });
    beep(correct ? 'ok' : 'error', sound);
    setLast({ correct, errorTag, given });
    if (feedback === 'none') advance();
    else setPhase('feedback');
  };

  const advance = () => {
    const next = index + 1;
    if (next >= n) {
      onComplete();
      return;
    }
    if (feedback === 'full' && rec.needsWorkedExample() && !rec.fixed) {
      // Regla 2: tras errores seguidos, ejemplo resuelto a un nivel más bajo
      try {
        setWorked(generateValidItem(task, clampLevel(task, rec.level() - 1), spec.variant, rec.seen()));
        setPhase('worked');
      } catch {
        rec.clearWorkedExample();
      }
    } else setPhase('question');
    setIndex(next);
    setItem(makeItem(next));
    setAnswer('');
    setChoice(null);
    setConfidence(undefined);
    setStrategy(undefined);
  };

  useKey((e) => {
    if (phase === 'question' && item.response.type === 'choice') {
      const k = Number(e.key);
      if (k >= 1 && k <= item.response.options.length) {
        e.preventDefault();
        submit(k - 1);
      }
    } else if (phase === 'feedback' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      advance();
    } else if (phase === 'worked' && e.key === 'Enter') {
      e.preventDefault();
      rec.clearWorkedExample();
      setPhase('question');
    }
  });

  if (phase === 'worked' && worked) {
    return (
      <div className="fade-in space-y-4">
        <Badge tone="violet">Ejemplo resuelto</Badge>
        <p className="text-sm text-muted">Has fallado varios seguidos. Antes de continuar, revisa este ejemplo resuelto paso a paso (un nivel más sencillo).</p>
        <ItemView item={worked} />
        <div className="rounded-xl border border-ok/30 bg-ok/5 p-3 text-sm">
          <div className="font-medium text-ok">Respuesta: {correctAnswerLabel(worked)}</div>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink">{worked.explanation.map((l, i) => <li key={i}>{l}</li>)}</ol>
        </div>
        <Button variant="primary" onClick={() => { rec.clearWorkedExample(); setPhase('question'); }}>Entendido, continuar (Intro)</Button>
      </div>
    );
  }

  const r = item.response;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-faint">
        <span>Ítem {index + 1} de {n}</span>
        <span className="tabular">Nivel {item.level.toFixed(1)}{item.variant === 'novel' ? ' · variante nueva' : ''}</span>
      </div>
      <ItemView item={item} />

      {phase === 'question' && (
        <>
          {askConfidence && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted">Confianza antes de responder (opcional):</span>
              {CONFIDENCE.map((c) => (
                <button key={c.v} onClick={() => setConfidence(confidence === c.v ? undefined : c.v)} aria-pressed={confidence === c.v} className={cx('rounded-full border px-2.5 py-1', confidence === c.v ? 'border-violet bg-violet/15 text-violet' : 'border-night-500 text-muted hover:text-ink')}>
                  {c.label}
                </button>
              ))}
            </div>
          )}
          {r.type === 'choice' ? (
            <div className={cx('grid gap-2', r.options.some((o) => o.figure) ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2')}>
              {r.options.map((o, i) => (
                <button
                  key={i}
                  onClick={() => { setChoice(i); submit(i); }}
                  className={cx('flex items-center gap-3 rounded-xl border border-night-500 bg-night-850 p-3 text-left text-sm transition hover:border-cyan hover:bg-night-700', choice === i && 'border-cyan')}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-night-700 font-mono text-xs text-cyan">{i + 1}</span>
                  {o.figure ? <Figure figure={o.figure} /> : <span>{o.label}</span>}
                  {o.figure && <span className="sr-only">{o.label}</span>}
                </button>
              ))}
            </div>
          ) : (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); submit(answer); }}>
              <input
                ref={inputRef}
                className={cx(inputCls, 'max-w-xs text-lg tabular')}
                inputMode={r.type === 'numeric' ? 'decimal' : 'text'}
                autoComplete="off"
                aria-label="Tu respuesta"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder={r.type === 'numeric' ? 'Número' : 'Respuesta'}
              />
              <Button variant="primary" type="submit" disabled={!answer.trim()}>Responder (Intro)</Button>
            </form>
          )}
        </>
      )}

      {phase === 'feedback' && last && (
        <div className="fade-in space-y-3" aria-live="polite">
          <div className={cx('rounded-xl border p-3', last.correct ? 'border-ok/40 bg-ok/5' : 'border-bad/40 bg-bad/5')}>
            <div className={cx('font-semibold', last.correct ? 'text-ok' : 'text-bad')}>{last.correct ? '✓ Correcto' : '✗ Incorrecto'}</div>
            {!last.correct && (
              <div className="mt-1 text-sm text-ink">
                Tu respuesta: <b>{last.given || '—'}</b> · Correcta: <b>{correctAnswerLabel(item)}</b>
              </div>
            )}
          </div>
          <div className="rounded-xl border border-night-600 bg-night-850/70 p-3 text-sm">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">Explicación paso a paso</div>
            <ol className="list-decimal space-y-1 pl-5">{item.explanation.map((l, i) => <li key={i}>{l}</li>)}</ol>
          </div>
          {!last.correct && last.errorTag && task.errorAdvice[last.errorTag] && (
            <div className="rounded-xl border border-amber/30 bg-amber/5 p-3 text-sm">
              <div><span className="font-semibold text-amber">Qué falló:</span> {task.errorAdvice[last.errorTag].meaning}</div>
              <div className="mt-1"><span className="font-semibold text-amber">Alternativa más eficiente:</span> {task.errorAdvice[last.errorTag].better}</div>
            </div>
          )}
          <div className="text-xs text-muted"><span className="font-semibold text-violet">Aplicación en otro contexto:</span> {task.transferHint}</div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted">¿Qué estrategia usaste?</span>
            {task.strategies.map((s) => (
              <button key={s.id} aria-pressed={strategy === s.id} onClick={() => { setStrategy(s.id); rec.annotateLast({ strategy: s.id }); }} className={cx('rounded-full border px-2.5 py-1', strategy === s.id ? 'border-cyan bg-cyan/10 text-cyan' : 'border-night-500 text-muted hover:text-ink')}>
                {s.label}
              </button>
            ))}
          </div>
          <Button variant="primary" onClick={advance} autoFocus>{index + 1 >= n ? 'Terminar bloque' : 'Siguiente'} (Intro)</Button>
        </div>
      )}
    </div>
  );
}

export function ItemView({ item }: { item: Item }) {
  return (
    <div className="space-y-3">
      {item.lines && item.lines.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-night-600 bg-night-850/60 p-3 text-sm leading-relaxed">
          {item.lines.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      )}
      {item.figure && <div className="flex justify-center overflow-x-auto rounded-xl border border-night-600 bg-night-950/40 p-4"><Figure figure={item.figure} /></div>}
      <p className="text-base font-medium">{item.prompt}</p>
    </div>
  );
}

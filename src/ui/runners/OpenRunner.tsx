import { useEffect, useMemo, useState } from 'react';
import type { OpenTask } from '../../core/types';
import { APPROPRIATENESS_RUBRIC, ORIGINALITY_RUBRIC, isCommon, scoreDivergent, type DivergentScores, type OpenRating } from '../../core/tasks/divergent';
import { Badge, Button, Stat, cx, inputCls } from '../components/ui';
import { fmt, pct } from '../../core/stats';

// Pensamiento divergente: generación con tiempo límite y autoevaluación con rúbrica explícita.
export function OpenRunner({ task, usedSignatures, onComplete }: { task: OpenTask; usedSignatures: string[]; onComplete: (r: { scores: DivergentScores; ratings: OpenRating[]; promptSig: string }) => void }) {
  const prompt = useMemo(() => {
    const fresh = task.prompts.filter((p) => !usedSignatures.includes(p.signature));
    const pool = fresh.length ? fresh : task.prompts;
    return pool[Math.floor(Math.random() * pool.length)];
  }, [task, usedSignatures]);
  const [phase, setPhase] = useState<'write' | 'rate' | 'result'>('write');
  const [left, setLeft] = useState(task.durationSeconds);
  const [lines, setLines] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [ratings, setRatings] = useState<OpenRating[]>([]);

  useEffect(() => {
    if (phase !== 'write') return;
    if (left <= 0) { finishWriting(); return; }
    const t = window.setTimeout(() => setLeft((x) => x - 1), 1000);
    return () => window.clearTimeout(t);
  }, [left, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  function finishWriting() {
    const all = [...lines, draft].map((l) => l.trim()).filter(Boolean);
    setRatings(all.map((text) => {
      const autoCommon = isCommon(text, prompt.common);
      return { text, category: prompt.categories[0], originality: autoCommon ? 1 : 2, appropriate: true, autoCommon };
    }));
    setPhase('rate');
  }

  const scores = scoreDivergent(ratings);

  if (phase === 'write') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{prompt.title}</h3>
          <Badge tone={left < 30 ? 'amber' : 'cyan'}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</Badge>
        </div>
        <p className="text-sm text-muted">{prompt.prompt}</p>
        <form onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { setLines((l) => [...l, draft.trim()]); setDraft(''); } }} className="flex gap-2">
          <input autoFocus className={inputCls} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Escribe una idea y pulsa Intro" aria-label="Nueva idea" />
          <Button type="submit">Añadir</Button>
        </form>
        <ol className="list-decimal space-y-1 pl-6 text-sm">{lines.map((l, i) => <li key={i}>{l}</li>)}</ol>
        <Button variant="secondary" onClick={finishWriting}>Terminar antes de tiempo</Button>
      </div>
    );
  }

  if (phase === 'rate') {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Valora tus respuestas con la rúbrica</h3>
        <div className="grid gap-2 rounded-xl border border-night-600 bg-night-850/60 p-3 text-xs text-muted sm:grid-cols-2">
          <div>
            <b className="text-ink">Originalidad</b>
            {ORIGINALITY_RUBRIC.map((r) => <div key={r.value}>{r.value} · {r.label}: {r.desc}</div>)}
            <div className="mt-1 text-faint">Las respuestas que coinciden con la lista de respuestas frecuentes se marcan automáticamente como «común».</div>
          </div>
          <div><b className="text-ink">Adecuación</b><div>{APPROPRIATENESS_RUBRIC}</div><b className="mt-2 block text-ink">Categoría</b><div>Sirve para medir la variedad (número de categorías distintas).</div></div>
        </div>
        {ratings.length === 0 && <p className="text-sm text-muted">No escribiste respuestas. Puedes continuar.</p>}
        <ul className="space-y-2">
          {ratings.map((r, i) => (
            <li key={i} className="rounded-xl border border-night-600 p-3 text-sm">
              <div className="mb-2 font-medium">{r.text} {r.autoCommon && <Badge>respuesta frecuente</Badge>}</div>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <select className={cx(inputCls, 'w-auto py-1 text-xs')} value={r.category} aria-label="Categoría" onChange={(e) => setRatings((rs) => rs.map((x, k) => (k === i ? { ...x, category: e.target.value } : x)))}>
                  {prompt.categories.map((c) => <option key={c}>{c}</option>)}
                </select>
                <div role="radiogroup" aria-label="Originalidad" className="flex gap-1">
                  {[1, 2, 3].map((v) => (
                    <button key={v} disabled={r.autoCommon} aria-checked={r.originality === v} role="radio" onClick={() => setRatings((rs) => rs.map((x, k) => (k === i ? { ...x, originality: v as 1 | 2 | 3 } : x)))} className={cx('rounded-md border px-2 py-1', r.originality === v ? 'border-violet text-violet' : 'border-night-500 text-muted')}>
                      {ORIGINALITY_RUBRIC[v - 1].label}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={r.appropriate} onChange={(e) => setRatings((rs) => rs.map((x, k) => (k === i ? { ...x, appropriate: e.target.checked } : x)))} /> Adecuada
                </label>
              </div>
            </li>
          ))}
        </ul>
        <Button variant="primary" onClick={() => setPhase('result')}>Ver resultado</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Resultado (cuatro dimensiones independientes)</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Fluidez" value={scores.fluidez} hint="Ideas distintas" />
        <Stat label="Variedad" value={scores.variedad} hint="Categorías distintas" />
        <Stat label="Originalidad" value={fmt(scores.originalidad, 2)} hint="Media 1–3 (autoevaluada)" />
        <Stat label="Adecuación" value={pct(scores.adecuacion)} hint="Ideas viables" />
      </div>
      <p className="text-xs text-faint">Estas puntuaciones describen tu producción en esta tarea con una rúbrica autoevaluada. No se combinan en un índice y no son una medida de inteligencia general.</p>
      <Button variant="primary" onClick={() => onComplete({ scores, ratings, promptSig: prompt.signature })}>Guardar y continuar</Button>
    </div>
  );
}

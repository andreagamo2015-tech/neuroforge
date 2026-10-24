import { useEffect, useMemo, useRef, useState } from 'react';
import { createRng, randomSeed, uid } from '../../core/rng';
import type { Card as CardT, LessonRecord } from '../../core/records';
import { TRANSFER_DECK, USER_DECK, VELTARI_DECK, buildTransferLesson, buildVeltariDeck, checkCardAnswer, dueCards, interleave, newCard, pendingDelayed, schedule, DELAYED_MIN_HOURS } from '../../core/learning';
import { retentionSummary } from '../../core/analytics';
import { pct } from '../../core/stats';
import { useStore } from '../../data/store';
import { Badge, Button, Card, Empty, Field, PageTitle, Stat, cx, inputCls } from '../components/ui';
import { useKey } from '../hooks';

type Flow =
  | { kind: 'none' }
  | { kind: 'study'; lesson: LessonRecord; cards: CardT[]; fixed: boolean }
  | { kind: 'review'; cards: CardT[]; phase: 'repaso' | 'diferida'; lesson?: LessonRecord };

export function LearningPage() {
  const store = useStore();
  const { data } = store;
  const now = Date.now();
  const [flow, setFlow] = useState<Flow>({ kind: 'none' });
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const lessons = data.lessons.filter((l) => !l.transfer).sort((a, b) => a.title.localeCompare(b.title));
  const due = dueCards(data.cards, now);
  const delayed = pendingDelayed(data.lessons, now);
  const ret = retentionSummary(data.lessons);
  const cardsOf = (l: LessonRecord) => data.cards.filter((c) => l.cardIds.includes(c.id));
  const userNew = data.cards.filter((c) => c.deckId === USER_DECK && !c.studiedAt);

  async function createVeltari() {
    const plans = buildVeltariDeck(randomSeed());
    await store.upsert('cards', plans.flatMap((p) => p.cards));
    await store.upsert('lessons', plans.map((p) => p.lesson));
  }

  async function addUserCard() {
    if (!front.trim() || !back.trim()) return;
    await store.upsert('cards', [newCard({ deckId: USER_DECK, kind: 'usuario', front: front.trim(), back: back.trim(), now: Date.now() })]);
    setFront('');
    setBack('');
  }

  function startUserStudy() {
    const lesson: LessonRecord = { id: uid('les'), deckId: USER_DECK, title: `Mis tarjetas · ${new Date().toLocaleDateString('es-ES')}`, startedAt: 0, cardIds: userNew.map((c) => c.id) };
    setFlow({ kind: 'study', lesson, cards: userNew, fixed: false });
  }

  function startTransfer() {
    const prev = data.cards.filter((c) => c.deckId === TRANSFER_DECK).map((c) => c.front.replace(/^¿Cómo se dice «|»\?$/g, ''));
    const plan = buildTransferLesson(randomSeed(), prev);
    setFlow({ kind: 'study', lesson: plan.lesson, cards: plan.cards, fixed: true });
  }

  if (flow.kind === 'study') return <StudyFlow {...flow} onExit={() => setFlow({ kind: 'none' })} />;
  if (flow.kind === 'review') return <ReviewFlow {...flow} onExit={() => setFlow({ kind: 'none' })} />;

  return (
    <div className="space-y-5">
      <PageTitle title="Aprendizaje acelerado" subtitle="Recuperación activa, repetición espaciada, intercalado, elaboración con tus palabras, ejemplos resueltos y pruebas de retención diferida (≥ 20 h). Se usa un léxico artificial para medir aprendizaje real sin conocimientos previos." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Retención inmediata" value={pct(ret.immediate)} hint={`${ret.lessons} lecciones`} tone="cyan" />
        <Stat label="Retención diferida" value={pct(ret.delayed)} hint={ret.nDelayed ? `${ret.nDelayed} pruebas` : 'evidencia insuficiente'} tone="violet" />
        <Stat label="Tarjetas pendientes" value={due.length} />
        <Stat label="Pruebas diferidas pendientes" value={delayed.length} />
      </div>

      {delayed.length > 0 && (
        <Card title="Prueba de retención diferida disponible" subtitle={`Han pasado al menos ${DELAYED_MIN_HOURS} h desde el estudio. Hazla antes de repasar para medir la retención real.`}>
          <div className="flex flex-wrap gap-2">
            {delayed.map((l) => <Button key={l.id} variant="primary" onClick={() => setFlow({ kind: 'review', cards: cardsOf(l), phase: 'diferida', lesson: l })}>{l.title}</Button>)}
          </div>
        </Card>
      )}

      <Card title="Repaso espaciado" subtitle="Tarjetas cuya fecha de repaso ha llegado, intercaladas entre lecciones. Los errores vuelven al final de la sesión." actions={<Button variant="primary" disabled={!due.length} onClick={() => setFlow({ kind: 'review', cards: interleave(due, createRng(randomSeed())).slice(0, 30), phase: 'repaso' })}>Repasar {due.length ? `(${Math.min(30, due.length)})` : ''}</Button>}>
        {!due.length && <p className="text-sm text-muted">No hay tarjetas pendientes ahora.</p>}
      </Card>

      <Card title="Léxico Veltari (lengua artificial)" subtitle="4 lecciones de vocabulario y 2 reglas gramaticales que hay que aplicar a palabras nuevas (aprendizaje de reglas, no solo memoria).">
        {!data.cards.some((c) => c.deckId === VELTARI_DECK) ? (
          <Button variant="primary" onClick={() => void createVeltari()}>Crear léxico (único para ti)</Button>
        ) : (
          <ul className="space-y-2">
            {lessons.filter((l) => l.deckId === VELTARI_DECK).map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-night-600 p-3 text-sm">
                <div>
                  <div className="font-medium">{l.title} <span className="text-xs text-faint">· {l.cardIds.length} tarjetas</span></div>
                  <div className="text-xs text-muted">
                    {l.startedAt ? `Estudiada el ${new Date(l.startedAt).toLocaleDateString('es-ES')} · inmediata ${pct(l.immediateAccuracy ?? NaN)} · diferida ${l.delayedAccuracy !== undefined ? pct(l.delayedAccuracy) : now - l.startedAt < DELAYED_MIN_HOURS * 3600000 ? `disponible en ${Math.ceil(DELAYED_MIN_HOURS - (now - l.startedAt) / 3600000)} h` : 'pendiente'}` : 'Sin estudiar'}
                  </div>
                </div>
                {!l.startedAt && <Button onClick={() => setFlow({ kind: 'study', lesson: l, cards: cardsOf(l), fixed: false })}>Estudiar</Button>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Mis tarjetas" subtitle="Crea tarjetas sobre lo que estés aprendiendo (idiomas, fórmulas, conceptos).">
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Field label="Pregunta / anverso"><input className={inputCls} value={front} onChange={(e) => setFront(e.target.value)} /></Field>
          <Field label="Respuesta / reverso"><input className={inputCls} value={back} onChange={(e) => setBack(e.target.value)} /></Field>
          <div className="flex items-end"><Button onClick={() => void addUserCard()} disabled={!front.trim() || !back.trim()}>Añadir</Button></div>
        </div>
        {userNew.length > 0 && <Button className="mt-3" variant="primary" onClick={startUserStudy}>Estudiar {userNew.length} tarjeta{userNew.length > 1 ? 's' : ''} nueva{userNew.length > 1 ? 's' : ''}</Button>}
        <ul className="mt-3 divide-y divide-night-700 text-sm">
          {data.cards.filter((c) => c.deckId === USER_DECK).map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 py-1.5">
              <span>{c.front} → <span className="text-muted">{c.back}</span> {c.studiedAt ? <Badge>caja {c.box}</Badge> : <Badge tone="amber">nueva</Badge>}</span>
              <Button variant="ghost" aria-label={`Eliminar tarjeta ${c.front}`} onClick={() => void store.remove('cards', c.id)}>✕</Button>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Prueba de aprendizaje nuevo (transferencia)" subtitle="Protocolo fijo: 8 pares nuevos, 6 s por tarjeta, sin elaboración, prueba inmediata y diferida. Mide tu capacidad de aprender material nuevo con el mismo procedimiento cada vez.">
        <Button onClick={startTransfer}>Iniciar protocolo</Button>
        {data.lessons.filter((l) => l.transfer).length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-muted">
            {data.lessons.filter((l) => l.transfer).sort((a, b) => b.startedAt - a.startedAt).map((l) => (
              <li key={l.id}>{new Date(l.startedAt).toLocaleDateString('es-ES')} · inmediata {pct(l.immediateAccuracy ?? NaN)} · diferida {l.delayedAccuracy !== undefined ? pct(l.delayedAccuracy) : 'pendiente'}</li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function StudyFlow({ lesson, cards, fixed, onExit }: { lesson: LessonRecord; cards: CardT[]; fixed: boolean; onExit: () => void }) {
  const store = useStore();
  const [phase, setPhase] = useState<'study' | 'test' | 'result'>('study');
  const [i, setI] = useState(0);
  const [elab, setElab] = useState<Record<string, string>>({});
  const studiedAt = useRef(Date.now());
  const testCards = useMemo(() => interleave(cards, createRng(randomSeed())), [cards]);
  const [results, setResults] = useState<boolean[]>([]);

  useEffect(() => {
    if (!fixed || phase !== 'study') return;
    const t = window.setTimeout(() => (i + 1 < cards.length ? setI(i + 1) : setPhase('test')), 6000);
    return () => window.clearTimeout(t);
  }, [fixed, phase, i, cards.length]);

  async function finish(res: boolean[]) {
    const now = Date.now();
    const updated = testCards.map((c, k) => schedule({ ...c, studiedAt: studiedAt.current, elaboration: elab[c.id] || c.elaboration }, res[k], 'inmediata', now));
    const acc = res.filter(Boolean).length / res.length;
    await store.upsert('cards', updated);
    await store.upsert('lessons', [{ ...lesson, startedAt: studiedAt.current, immediateAccuracy: acc }]);
    setResults(res);
    setPhase('result');
  }

  if (phase === 'study') {
    const c = cards[i];
    return (
      <div className="mx-auto max-w-xl">
        <PageTitle title={lesson.title} subtitle={`Fase de estudio · tarjeta ${i + 1} de ${cards.length}${fixed ? ' · 6 s por tarjeta' : ''}`} />
        <Card>
          <div className="text-sm text-muted">{c.front}</div>
          <div className="my-4 text-center font-mono text-4xl text-cyan">{c.back}</div>
          {c.hint && <div className="mb-3 rounded-lg border border-violet/30 bg-violet/5 p-2 text-sm">Ejemplo resuelto: {c.hint}</div>}
          {!fixed && (
            <Field label="Elaboración (opcional): explica o asocia con tus palabras" hint="Crear una imagen mental o una frase propia mejora la retención.">
              <input className={inputCls} value={elab[c.id] ?? ''} onChange={(e) => setElab({ ...elab, [c.id]: e.target.value })} />
            </Field>
          )}
          {!fixed && (
            <div className="mt-4 flex gap-2">
              <Button variant="primary" onClick={() => (i + 1 < cards.length ? setI(i + 1) : setPhase('test'))}>{i + 1 < cards.length ? 'Siguiente' : 'Pasar a la prueba'}</Button>
              <Button variant="ghost" onClick={onExit}>Salir sin guardar</Button>
            </div>
          )}
        </Card>
      </div>
    );
  }
  if (phase === 'test') return <RetrievalTest title={`${lesson.title} · prueba inmediata`} cards={testCards} allowOverride={lesson.deckId === USER_DECK} onDone={(r) => void finish(r)} />;
  const acc = results.filter(Boolean).length / Math.max(1, results.length);
  return (
    <div className="mx-auto max-w-xl">
      <Card title="Lección registrada">
        <p className="text-sm">Retención inmediata: <b className="text-cyan">{pct(acc)}</b>. La prueba diferida estará disponible en {DELAYED_MIN_HOURS} h; hazla antes de repasar para medir la retención real.</p>
        <Button className="mt-3" variant="primary" onClick={onExit}>Volver</Button>
      </Card>
    </div>
  );
}

function ReviewFlow({ cards, phase, lesson, onExit }: { cards: CardT[]; phase: 'repaso' | 'diferida'; lesson?: LessonRecord; onExit: () => void }) {
  const store = useStore();
  const [done, setDone] = useState<number | null>(null);
  async function finish(res: boolean[], order: CardT[]) {
    const now = Date.now();
    const latest = new Map<string, CardT>();
    order.forEach((c, k) => latest.set(c.id, schedule(latest.get(c.id) ?? c, res[k], phase, now)));
    await store.upsert('cards', [...latest.values()]);
    const first = res.slice(0, cards.length);
    const acc = first.filter(Boolean).length / Math.max(1, first.length);
    if (phase === 'diferida' && lesson) await store.upsert('lessons', [{ ...lesson, delayedAccuracy: acc, delayedAt: now }]);
    setDone(acc);
  }
  if (done !== null) {
    return (
      <div className="mx-auto max-w-xl">
        <Card title={phase === 'diferida' ? 'Retención diferida registrada' : 'Repaso completado'}>
          <p className="text-sm">Aciertos al primer intento: <b className="text-cyan">{pct(done)}</b>.</p>
          <Button className="mt-3" variant="primary" onClick={onExit}>Volver</Button>
        </Card>
      </div>
    );
  }
  return <RetrievalTest title={phase === 'diferida' ? `${lesson?.title ?? ''} · prueba diferida` : 'Repaso espaciado'} cards={phase === 'diferida' ? interleave(cards, createRng(randomSeed())) : cards} requeueErrors={phase === 'repaso'} allowOverride={cards.some((c) => c.deckId === USER_DECK)} onDone={(r, order) => void finish(r, order)} onExit={onExit} />;
}

function RetrievalTest({ title, cards, onDone, onExit, requeueErrors, allowOverride }: { title: string; cards: CardT[]; onDone: (res: boolean[], order: CardT[]) => void; onExit?: () => void; requeueErrors?: boolean; allowOverride?: boolean }) {
  const [queue, setQueue] = useState<CardT[]>(cards);
  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState('');
  const [fb, setFb] = useState<boolean | null>(null);
  const res = useRef<boolean[]>([]);
  const c = queue[i];

  const check = () => {
    if (fb !== null || !answer.trim()) return;
    const ok = checkCardAnswer(c, answer);
    res.current[i] = ok;
    setFb(ok);
  };
  const next = () => {
    let q = queue;
    if (requeueErrors && res.current[i] === false && i < cards.length) q = [...queue, c]; // repaso basado en errores
    setQueue(q);
    if (i + 1 >= q.length) return onDone(res.current, q);
    setI(i + 1);
    setAnswer('');
    setFb(null);
  };
  useKey((e) => { if (fb !== null && e.key === 'Enter') next(); }, fb !== null);

  return (
    <div className="mx-auto max-w-xl">
      <PageTitle title={title} subtitle={`Recuperación activa · ${i + 1} de ${queue.length}${i >= cards.length ? ' · repetición de un error' : ''}`} />
      <Card>
        <div className="text-base">{c.front}</div>
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); check(); }}>
          <input autoFocus className={inputCls} value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={fb !== null} aria-label="Respuesta" autoComplete="off" />
          <Button type="submit" variant="primary" disabled={fb !== null || !answer.trim()}>Comprobar</Button>
        </form>
        {fb !== null && (
          <div className="mt-3 space-y-2" aria-live="polite">
            <div className={cx('font-semibold', fb ? 'text-ok' : 'text-bad')}>{fb ? '✓ Correcto' : `✗ Respuesta correcta: ${c.back}`}</div>
            {!fb && c.hint && <div className="text-sm text-muted">Ejemplo resuelto: {c.hint}</div>}
            {!fb && c.elaboration && <div className="text-sm text-muted">Tu elaboración: «{c.elaboration}»</div>}
            <div className="flex gap-2">
              <Button variant="primary" autoFocus onClick={next}>Siguiente (Intro)</Button>
              {!fb && allowOverride && <Button variant="ghost" onClick={() => { res.current[i] = true; setFb(true); }}>Mi respuesta era equivalente</Button>}
            </div>
          </div>
        )}
        {onExit && <Button className="mt-4" variant="ghost" onClick={onExit}>Salir sin guardar</Button>}
      </Card>
      {cards.length === 0 && <Empty title="No hay tarjetas" />}
    </div>
  );
}

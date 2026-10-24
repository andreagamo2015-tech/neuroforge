import { beforeEach, describe, expect, it } from 'vitest';
import { exportJSON, importJSON, loadAll, putRecords, resetConnection, toCSV, validateImport, wipeAll, deleteRecord } from '../src/data/db';
import { buildTransferLesson, buildVeltariDeck, checkCardAnswer, dueCards, interleave, pendingDelayed, schedule, LEITNER_HOURS } from '../src/core/learning';
import { abbaSchedule, createExperiment, summarizeExperiment } from '../src/core/experiment';
import { createRng } from '../src/core/rng';
import { masteryByTask, generalizationByTask, calibration, moduleProfiles } from '../src/core/analytics';
import { TASKS } from '../src/core/registry';
import { DEFAULT_PARAMS } from '../src/core/engine/params';
import { scoreDivergent } from '../src/core/tasks/divergent';
import type { BlockRecord, Card } from '../src/core/records';

describe('Persistencia (IndexedDB)', () => {
  beforeEach(async () => {
    await wipeAll();
  });
  it('vacío → estructuras vacías', async () => {
    const d = await loadAll();
    expect(d.settings).toBeNull();
    expect(d.trials).toEqual([]);
  });
  it('los datos sobreviven a una nueva conexión (equivalente a recargar)', async () => {
    await putRecords('settings', [{ id: 'settings', createdAt: 1, onboardingDone: true }]);
    await putRecords('trials', [{ id: 't1', sessionId: 's', blockId: 'b', taskId: 'A-series', timestamp: 1 }]);
    await resetConnection();
    const d = await loadAll();
    expect(d.settings?.onboardingDone).toBe(true);
    expect(d.trials).toHaveLength(1);
  });
  it('exportar → borrar → importar restaura los datos', async () => {
    await putRecords('journal', [{ id: 'j1', date: 1, text: 'hola' }]);
    const exp = await exportJSON();
    expect(validateImport(exp)).toBe(true);
    await wipeAll();
    expect((await loadAll()).journal).toHaveLength(0);
    await importJSON(JSON.parse(JSON.stringify(exp)));
    expect((await loadAll()).journal[0].text).toBe('hola');
  });
  it('rechaza archivos de importación no válidos', () => {
    expect(validateImport({ foo: 1 })).toBe(false);
    expect(validateImport({ app: 'NEUROFORGE X', format: 1, data: { sessions: [] } })).toBe(false);
  });
  it('eliminar un registro y eliminar todo', async () => {
    await putRecords('external', [{ id: 'e1' }, { id: 'e2' }]);
    await deleteRecord('external', 'e1');
    expect((await loadAll()).external).toHaveLength(1);
    await wipeAll();
    expect((await loadAll()).external).toHaveLength(0);
  });
  it('CSV escapa comas y comillas', () => {
    const csv = toCSV([{ a: 'x,y', b: 'di "hola"' }], ['a', 'b']);
    expect(csv).toBe('a,b\n"x,y","di ""hola"""');
  });
});

describe('Aprendizaje', () => {
  it('el léxico tiene palabras únicas, reglas y aplicaciones verificables', () => {
    const plans = buildVeltariDeck(123);
    const cards = plans.flatMap((p) => p.cards);
    const vocab = cards.filter((c) => c.kind === 'vocabulario').map((c) => c.back);
    expect(new Set(vocab).size).toBe(vocab.length);
    expect(cards.some((c) => c.kind === 'regla')).toBe(true);
    const app = cards.find((c) => c.kind === 'aplicacion')!;
    expect(app.back.endsWith('en')).toBe(true);
  });
  it('corrección de respuestas tolerante a mayúsculas y tildes', () => {
    const c = buildVeltariDeck(1)[0].cards[0];
    expect(checkCardAnswer(c, c.back.toUpperCase())).toBe(true);
    expect(checkCardAnswer(c, 'zzzz')).toBe(false);
  });
  it('Leitner: acierto alarga el intervalo, error lo reinicia', () => {
    const now = 1_000_000;
    let c: Card = { ...buildVeltariDeck(2)[0].cards[0], studiedAt: now };
    c = schedule(c, true, 'inmediata', now);
    expect(c.box).toBe(1);
    expect(c.due).toBe(now + LEITNER_HOURS[1] * 3600000);
    c = schedule(c, false, 'repaso', now);
    expect(c.box).toBe(0);
    expect(dueCards([c], now + LEITNER_HOURS[0] * 3600000 + 1)).toHaveLength(1);
  });
  it('prueba diferida disponible solo tras 20 h', () => {
    const l = { id: 'l', deckId: 'v', title: 'x', startedAt: 0 + 1, cardIds: [], immediateAccuracy: 1 };
    expect(pendingDelayed([l], 1 + 19 * 3600000)).toHaveLength(0);
    expect(pendingDelayed([l], 1 + 21 * 3600000)).toHaveLength(1);
  });
  it('el protocolo de transferencia evita conceptos ya usados', () => {
    const a = buildTransferLesson(5, []);
    const used = a.cards.map((c) => c.front.replace(/^¿Cómo se dice «|»\?$/g, ''));
    const b = buildTransferLesson(6, used);
    b.cards.forEach((c) => expect(used).not.toContain(c.front.replace(/^¿Cómo se dice «|»\?$/g, '')));
  });
  it('el intercalado evita dos tarjetas seguidas de la misma lección cuando es posible', () => {
    const plans = buildVeltariDeck(9);
    const cards = [...plans[0].cards.slice(0, 4), ...plans[1].cards.slice(0, 4)];
    const out = interleave(cards, createRng(3));
    for (let i = 1; i < out.length; i++) expect(out[i].lessonId).not.toBe(out[i - 1].lessonId);
  });
});

describe('Experimentos', () => {
  it('protocolo ABBA predefinido y equilibrado', () => {
    const s = abbaSchedule(8);
    expect(s.join('')).toBe('ABBABAAB');
    expect(s.filter((x) => x === 'A').length).toBe(4);
  });
  it('evidencia insuficiente con pocas sesiones; descriptivo con suficientes', () => {
    const e = createExperiment('A-series', 'x', 8, 8, 4);
    expect(summarizeExperiment(e).status).toBe('insuficiente');
    e.schedule = e.schedule.map((s) => ({ ...s, pre: 0.5, post: s.arm === 'A' ? 0.6 : 0.7 }));
    const r = summarizeExperiment(e);
    expect(r.status).toBe('descriptivo');
    expect(r.arms[1].gain).toBeCloseTo(0.2);
    expect(r.message).toMatch(/no demuestran causalidad/);
  });
});

describe('Analítica con datos reales y vacíos', () => {
  const states = Object.fromEntries(TASKS.map((t) => [t.id, { taskId: t.id, level: 1, blocks: 0, trials: 0, consecutiveErrors: 0, needsWorkedExample: false, blocksSinceNovel: 0, seen: [], history: [] }]));
  it('sin datos: listas vacías y nada inventado', () => {
    expect(masteryByTask(TASKS, [], states, DEFAULT_PARAMS)).toEqual([]);
    expect(generalizationByTask(TASKS, [], states, DEFAULT_PARAMS).every((g) => g.status === 'insuficiente')).toBe(true);
    expect(calibration([]).n).toBe(0);
    expect(moduleProfiles(TASKS, [], [], states, DEFAULT_PARAMS).every((m) => Number.isNaN(m.index))).toBe(true);
  });
  it('dominio usa los bloques registrados y excluye variantes nuevas y transferencia', () => {
    const b = (o: Partial<BlockRecord>): BlockRecord => ({ id: Math.random().toString(), sessionId: 's', taskId: 'A-series', module: 'A', purpose: 'training', variant: 'train', startLevel: 2, endLevel: 3, nTrials: 6, accuracy: 0.8, medianRt: 1, extra: {}, summary: [], startedAt: 1, endedAt: 2, inputType: 'teclado', ...o });
    const rows = masteryByTask(TASKS, [b({}), b({ variant: 'novel', purpose: 'novel' }), b({ endedAt: 3, endLevel: 4 })], states, DEFAULT_PARAMS);
    expect(rows).toHaveLength(1);
    expect(rows[0].levelSeries.map((p) => p.y)).toEqual([3, 4]);
  });
  it('divergente: dimensiones separadas, duplicados no cuentan', () => {
    const s = scoreDivergent([
      { text: 'Tope de puerta', category: 'a', originality: 1, appropriate: true, autoCommon: true },
      { text: 'tope de puerta', category: 'a', originality: 1, appropriate: true, autoCommon: true },
      { text: 'Reloj de sol', category: 'b', originality: 3, appropriate: true, autoCommon: false },
      { text: 'Volar', category: 'c', originality: 3, appropriate: false, autoCommon: false },
    ]);
    expect(s.fluidez).toBe(3);
    expect(s.variedad).toBe(2);
    expect(s.originalidad).toBe(2);
    expect(s.adecuacion).toBeCloseTo(2 / 3);
  });
});

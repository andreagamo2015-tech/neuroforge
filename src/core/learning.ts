import { createRng, uid, type Rng } from './rng';
import type { Card, LessonRecord } from './records';
import { normalizeText } from './tasks/common';

// Módulo F: aprendizaje acelerado.
// Contenido NUEVO para cualquier persona (un léxico artificial) para poder medir aprendizaje
// y retención sin la contaminación del conocimiento previo.

export const LEITNER_HOURS = [0.17, 24, 72, 168, 336, 720, 1440];
export const DELAYED_MIN_HOURS = 20;

const CONS = ['b', 'd', 'f', 'g', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'z'];
const VOW = ['a', 'e', 'i', 'o', 'u'];

export function pseudoWord(rng: Rng, syllables: number): string {
  let w = '';
  for (let i = 0; i < syllables; i++) w += rng.pick(CONS) + rng.pick(VOW);
  if (rng.chance(0.4)) w += rng.pick(['n', 'r', 'l', 's']);
  return w;
}

const CONCEPTS: { es: string; plural: string }[][] = [
  [{ es: 'agua', plural: 'aguas' }, { es: 'fuego', plural: 'fuegos' }, { es: 'piedra', plural: 'piedras' }, { es: 'árbol', plural: 'árboles' }, { es: 'río', plural: 'ríos' }, { es: 'montaña', plural: 'montañas' }, { es: 'cielo', plural: 'cielos' }, { es: 'viento', plural: 'vientos' }],
  [{ es: 'casa', plural: 'casas' }, { es: 'puerta', plural: 'puertas' }, { es: 'camino', plural: 'caminos' }, { es: 'puente', plural: 'puentes' }, { es: 'ciudad', plural: 'ciudades' }, { es: 'mercado', plural: 'mercados' }, { es: 'torre', plural: 'torres' }, { es: 'barco', plural: 'barcos' }],
  [{ es: 'pájaro', plural: 'pájaros' }, { es: 'caballo', plural: 'caballos' }, { es: 'pez', plural: 'peces' }, { es: 'lobo', plural: 'lobos' }, { es: 'abeja', plural: 'abejas' }, { es: 'serpiente', plural: 'serpientes' }, { es: 'oveja', plural: 'ovejas' }, { es: 'zorro', plural: 'zorros' }],
  [{ es: 'libro', plural: 'libros' }, { es: 'llave', plural: 'llaves' }, { es: 'cuchillo', plural: 'cuchillos' }, { es: 'lámpara', plural: 'lámparas' }, { es: 'mesa', plural: 'mesas' }, { es: 'espejo', plural: 'espejos' }, { es: 'cuerda', plural: 'cuerdas' }, { es: 'reloj', plural: 'relojes' }],
];

// Conceptos reservados para el protocolo de transferencia (nunca en las lecciones normales)
const TRANSFER_CONCEPTS = ['nube', 'hoja', 'arena', 'nieve', 'semilla', 'concha', 'pluma', 'raíz', 'huevo', 'hueso', 'sal', 'miel', 'humo', 'hielo', 'rueda', 'vela', 'cesta', 'campana', 'escalera', 'tambor', 'ventana', 'jarra', 'aguja', 'moneda'];

export const VELTARI_DECK = 'veltari';
export const USER_DECK = 'propio';
export const TRANSFER_DECK = 'transferencia';
export const PLURAL_SUFFIX = 'en';
export const BIG_PREFIX = 'ma';

export interface LessonPlan {
  lesson: LessonRecord;
  cards: Card[];
}

/** Crea todas las tarjetas del léxico Veltari (4 lecciones de vocabulario + reglas y aplicación). */
export function buildVeltariDeck(seed: number, now = Date.now()): LessonPlan[] {
  const rng = createRng(seed);
  const used = new Set<string>();
  const lessons: LessonPlan[] = [];
  const words: Record<string, string> = {};
  CONCEPTS.forEach((group, li) => {
    const lessonId = uid('les');
    const cards: Card[] = group.map((c) => {
      let w: string;
      do w = pseudoWord(rng, rng.int(2, 3)); while (used.has(w));
      used.add(w);
      words[c.es] = w;
      return newCard({ deckId: VELTARI_DECK, lessonId, kind: 'vocabulario', front: `¿Cómo se dice «${c.es}» en veltari?`, back: w, now });
    });
    if (li === 1) {
      cards.push(newCard({ deckId: VELTARI_DECK, lessonId, kind: 'regla', front: 'Regla: ¿qué sufijo forma el plural en veltari?', back: `-${PLURAL_SUFFIX}`, accept: [PLURAL_SUFFIX, `-${PLURAL_SUFFIX}`], hint: `El plural se forma añadiendo -${PLURAL_SUFFIX} al final de la palabra.`, now }));
      // aplicación de la regla a palabras de la lección anterior
      CONCEPTS[0].slice(0, 3).forEach((c) => cards.push(newCard({ deckId: VELTARI_DECK, lessonId, kind: 'aplicacion', front: `Aplica la regla: ¿cómo se dice «${c.plural}»?`, back: words[c.es] + PLURAL_SUFFIX, hint: `${words[c.es]} + -${PLURAL_SUFFIX}`, now })));
    }
    if (li === 3) {
      cards.push(newCard({ deckId: VELTARI_DECK, lessonId, kind: 'regla', front: 'Regla: ¿qué prefijo significa «grande» en veltari?', back: `${BIG_PREFIX}-`, accept: [BIG_PREFIX, `${BIG_PREFIX}-`], hint: `Se antepone ${BIG_PREFIX}- a la palabra.`, now }));
      [CONCEPTS[1][2], CONCEPTS[2][3], CONCEPTS[0][5]].forEach((c) => cards.push(newCard({ deckId: VELTARI_DECK, lessonId, kind: 'aplicacion', front: `Combina las reglas: ¿cómo se dice «${c.plural} grandes»?`, back: BIG_PREFIX + words[c.es] + PLURAL_SUFFIX, hint: `${BIG_PREFIX}- + ${words[c.es]} + -${PLURAL_SUFFIX}`, now })));
    }
    lessons.push({ lesson: { id: lessonId, deckId: VELTARI_DECK, title: `Veltari · Lección ${li + 1}`, startedAt: 0, cardIds: cards.map((c) => c.id) }, cards });
  });
  return lessons;
}

/** Protocolo de transferencia: 8 pares nuevos con presentación de tiempo fijo. */
export function buildTransferLesson(seed: number, previousConcepts: string[], now = Date.now()): LessonPlan {
  const rng = createRng(seed);
  const available = TRANSFER_CONCEPTS.filter((c) => !previousConcepts.includes(c));
  const concepts = rng.sample(available.length >= 8 ? available : TRANSFER_CONCEPTS, 8);
  const lessonId = uid('les');
  const used = new Set<string>();
  const cards = concepts.map((c) => {
    let w: string;
    do w = pseudoWord(rng, 2); while (used.has(w));
    used.add(w);
    return newCard({ deckId: TRANSFER_DECK, lessonId, kind: 'vocabulario', front: `¿Cómo se dice «${c}»?`, back: w, now });
  });
  return { lesson: { id: lessonId, deckId: TRANSFER_DECK, title: 'Prueba de aprendizaje nuevo', startedAt: now, cardIds: cards.map((c) => c.id), transfer: true }, cards };
}

export function newCard(o: { deckId: string; lessonId?: string; kind: Card['kind']; front: string; back: string; accept?: string[]; hint?: string; now: number }): Card {
  return { id: uid('card'), deckId: o.deckId, lessonId: o.lessonId, kind: o.kind, front: o.front, back: o.back, accept: o.accept, hint: o.hint, box: 0, due: Number.MAX_SAFE_INTEGER, createdAt: o.now, history: [] };
}

export function checkCardAnswer(card: Card, answer: string): boolean {
  const a = normalizeText(answer);
  if (!a) return false;
  return [card.back, ...(card.accept ?? [])].some((x) => normalizeText(x) === a);
}

/** Programación Leitner: acierto → caja siguiente; error → caja 0 (repaso en ~10 min). */
export function schedule(card: Card, correct: boolean, phase: 'inmediata' | 'diferida' | 'repaso', now: number): Card {
  const box = correct ? Math.min(card.box + 1, LEITNER_HOURS.length - 1) : 0;
  const hoursSinceStudy = card.studiedAt ? (now - card.studiedAt) / 3600000 : 0;
  return {
    ...card,
    box,
    due: now + LEITNER_HOURS[box] * 3600000,
    lastReviewed: now,
    history: [...card.history, { t: now, correct, phase, hoursSinceStudy }],
  };
}

export function dueCards(cards: Card[], now: number): Card[] {
  return cards.filter((c) => c.studiedAt && c.due <= now && c.deckId !== TRANSFER_DECK);
}

/** Lecciones cuya prueba diferida está disponible (≥ 20 h) y aún no se ha hecho. */
export function pendingDelayed(lessons: LessonRecord[], now: number): LessonRecord[] {
  return lessons.filter((l) => l.startedAt > 0 && l.immediateAccuracy !== undefined && l.delayedAccuracy === undefined && now - l.startedAt >= DELAYED_MIN_HOURS * 3600000);
}

/** Intercalado: mezcla tarjetas de distintas lecciones/mazos evitando dos seguidas del mismo. */
export function interleave(cards: Card[], rng: Rng): Card[] {
  const groups = new Map<string, Card[]>();
  rng.shuffle(cards).forEach((c) => {
    const k = c.lessonId ?? c.deckId;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  });
  const out: Card[] = [];
  let last = '';
  while (out.length < cards.length) {
    const keys = [...groups.keys()].filter((k) => groups.get(k)!.length);
    const k = keys.filter((x) => x !== last).sort((a, b) => groups.get(b)!.length - groups.get(a)!.length)[0] ?? keys[0];
    out.push(groups.get(k)!.shift()!);
    last = k;
  }
  return out;
}

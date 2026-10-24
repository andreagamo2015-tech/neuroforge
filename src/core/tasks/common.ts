import type { Item, ItemResponse } from '../types';

export const NAMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elena', 'Fabio', 'Gema', 'Hugo', 'Irene', 'Jorge', 'Lucía', 'Marcos'];
export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export function lvl(level: number): number {
  return Math.max(1, Math.min(10, Math.round(level)));
}

export function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr.slice()];
  const out: T[][] = [];
  arr.forEach((x, i) => {
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const p of permutations(rest)) out.push([x, ...p]);
  });
  return out;
}

/** Validaciones genéricas de cualquier ítem. */
export function baseValidate(item: Item): string[] {
  const errs: string[] = [];
  if (!item.prompt) errs.push('enunciado vacío');
  if (!item.explanation?.length) errs.push('sin explicación');
  const r: ItemResponse = item.response;
  if (r.type === 'choice') {
    if (r.options.length < 2) errs.push('menos de dos opciones');
    if (r.correctIndex < 0 || r.correctIndex >= r.options.length) errs.push('índice correcto fuera de rango');
    const keys = r.options.map((o) => o.label + JSON.stringify(o.figure ?? null));
    if (new Set(keys).size !== keys.length) errs.push('opciones duplicadas');
  }
  if (r.type === 'numeric' && !Number.isFinite(r.answer)) errs.push('respuesta numérica no finita');
  return errs;
}

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Evalúa una respuesta de ítem. Devuelve acierto. */
export function checkItemAnswer(item: Item, answer: number | string): boolean {
  const r = item.response;
  if (r.type === 'choice') return Number(answer) === r.correctIndex;
  if (r.type === 'numeric') {
    const v = typeof answer === 'number' ? answer : Number(String(answer).replace(',', '.'));
    if (!Number.isFinite(v)) return false;
    const tol = Math.max(r.tolerance ?? 0, (r.relativeTolerance ?? 0) * Math.abs(r.answer));
    return Math.abs(v - r.answer) <= tol + 1e-9;
  }
  const n = normalizeText(String(answer));
  return r.accept.some((a) => normalizeText(a) === n);
}

export function correctAnswerLabel(item: Item): string {
  const r = item.response;
  if (r.type === 'choice') return r.options[r.correctIndex].label || `Opción ${r.correctIndex + 1}`;
  if (r.type === 'numeric') return r.answer.toLocaleString('es-ES');
  return r.accept[0];
}

export const ordinal = (k: number) => ['primero', 'segundo', 'tercero', 'cuarto', 'quinto', 'sexto', 'séptimo'][k] ?? `${k + 1}.º`;

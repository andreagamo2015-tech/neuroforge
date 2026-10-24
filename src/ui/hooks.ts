import { useEffect, useRef, useState } from 'react';
import type { InputType } from '../core/records';

/** Ruta basada en hash (funciona en cualquier alojamiento estático sin configuración). */
export function useHashRoute(): { path: string; query: URLSearchParams } {
  const parse = () => {
    const h = window.location.hash.replace(/^#/, '') || '/';
    const [path, q] = h.split('?');
    return { path, query: new URLSearchParams(q ?? '') };
  };
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function navigate(to: string) {
  window.location.hash = to;
}

/** Último tipo de entrada usado (para separar tiempos de teclado y táctiles). */
let lastInput: InputType = 'desconocido';
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', () => (lastInput = 'teclado'), true);
  window.addEventListener('pointerdown', (e) => (lastInput = e.pointerType === 'touch' || e.pointerType === 'pen' ? 'táctil' : 'ratón'), true);
}
export const currentInputType = () => lastInput;

export function useKey(handler: (e: KeyboardEvent) => void, active = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active) return;
    const on = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      ref.current(e);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [active]);
}

// ---------- Sonidos opcionales (WebAudio, sin archivos externos) ----------
let ctx: AudioContext | null = null;
export function beep(kind: 'ok' | 'error' | 'tick', enabled: boolean) {
  if (!enabled || typeof window === 'undefined') return;
  try {
    ctx = ctx ?? new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = kind === 'ok' ? 880 : kind === 'error' ? 240 : 600;
    g.gain.value = 0.04;
    o.connect(g).connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
    o.stop(ctx.currentTime + 0.16);
  } catch {
    /* audio no disponible */
  }
}

export function deviceDescription(): string {
  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  return `${coarse ? 'táctil' : 'escritorio'} · ${window.innerWidth}×${window.innerHeight}`;
}

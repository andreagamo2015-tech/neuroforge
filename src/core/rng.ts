// Generador pseudoaleatorio con semilla (mulberry32). Permite reproducir cualquier ítem
// a partir de su semilla, lo que hace verificables los ejercicios generados.

export interface Rng {
  seed: number;
  next(): number; // [0, 1)
  int(min: number, max: number): number; // ambos incluidos
  pick<T>(arr: readonly T[]): T;
  shuffle<T>(arr: readonly T[]): T[];
  chance(p: number): boolean;
  sample<T>(arr: readonly T[], n: number): T[];
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    seed,
    next,
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    pick(arr) {
      if (arr.length === 0) throw new Error('pick: lista vacía');
      return arr[Math.floor(next() * arr.length)];
    },
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    chance(p) {
      return next() < p;
    },
    sample(arr, n) {
      return rng.shuffle(arr).slice(0, n);
    },
  };
  return rng;
}

export function randomSeed(): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 2 ** 32);
}

export function uid(prefix = ''): string {
  const r = randomSeed().toString(36) + randomSeed().toString(36);
  return `${prefix}${Date.now().toString(36)}${r}`.slice(0, 24);
}

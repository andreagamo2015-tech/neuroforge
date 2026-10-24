import type { Rng } from '../rng';
import type { Item, ItemTask, Variant } from '../types';
import { baseValidate, lvl } from './common';

// Problemas cuantitativos construidos para tener respuesta entera.
// Cada plantilla declara si depende de conocimiento matemático específico o de razonamiento
// con relaciones (para separar ambas fuentes de mejora en los informes).

interface QTemplate {
  id: string;
  minLevel: number;
  demand: 'razonamiento' | 'conocimiento';
  make(rng: Rng): { lines: string[]; prompt: string; answer: number; unit: string; naive?: number; naiveTag?: string; explanation: string[] };
}

const TEMPLATES: QTemplate[] = [
  {
    id: 'proporcion-inversa', minLevel: 1, demand: 'razonamiento',
    make(r) {
      for (;;) {
        const w = r.int(2, 8), d = r.int(3, 15), w2 = r.int(2, 12);
        if (w2 === w || (w * d) % w2) continue;
        const answer = (w * d) / w2;
        return {
          lines: [`${w} personas tardan ${d} días en pintar un edificio trabajando al mismo ritmo.`],
          prompt: `¿Cuántos días tardarían ${w2} personas?`,
          answer, unit: 'días', naive: (d * w2) / w, naiveTag: 'proporcion-directa',
          explanation: [`El trabajo total es ${w} × ${d} = ${w * d} jornadas-persona.`, `Repartido entre ${w2} personas: ${w * d} ÷ ${w2} = ${answer} días.`, 'Más personas → menos días: es una proporción inversa.'],
        };
      }
    },
  },
  {
    id: 'porcentajes-sucesivos', minLevel: 2, demand: 'razonamiento',
    make(r) {
      const P = r.int(1, 9) * 100, a = r.int(1, 5) * 10, b = r.pick([a, r.int(1, 5) * 10]);
      const answer = (P * (100 + a) * (100 - b)) / 10000;
      return {
        lines: [`Un artículo cuesta ${P} €. Su precio sube un ${a} % y, después, el nuevo precio baja un ${b} %.`],
        prompt: '¿Cuál es el precio final en euros?',
        answer, unit: '€', naive: P * (1 + (a - b) / 100), naiveTag: 'sumar-porcentajes',
        explanation: [`Tras la subida: ${P} × ${1 + a / 100} = ${(P * (100 + a)) / 100} €.`, `Tras la bajada: ${(P * (100 + a)) / 100} × ${1 - b / 100} = ${answer} €.`, 'Los porcentajes sucesivos se aplican sobre bases distintas: no se pueden sumar sin más.'],
      };
    },
  },
  {
    id: 'encuentro', minLevel: 3, demand: 'razonamiento',
    make(r) {
      const t = r.int(2, 5), v1 = r.int(4, 12) * 10, v2 = r.int(4, 12) * 10;
      const D = t * (v1 + v2);
      return {
        lines: [`Dos trenes salen a la vez de dos ciudades separadas ${D} km, uno hacia el otro.`, `Uno va a ${v1} km/h y el otro a ${v2} km/h.`],
        prompt: `¿Cuántos kilómetros habrá recorrido el tren de ${v1} km/h cuando se crucen?`,
        answer: v1 * t, unit: 'km', naive: D / 2, naiveTag: 'reparto-igual',
        explanation: [`Se acercan a ${v1} + ${v2} = ${v1 + v2} km/h.`, `Se cruzan tras ${D} ÷ ${v1 + v2} = ${t} h.`, `El primero recorre ${v1} × ${t} = ${v1 * t} km.`],
      };
    },
  },
  {
    id: 'edades', minLevel: 3, demand: 'razonamiento',
    make(r) {
      const b = r.int(3, 12), k = r.int(3, 4), n = b * (k - 2);
      return {
        lines: [`Hoy, Marta tiene ${k} veces la edad de su sobrino.`, `Dentro de ${n} años, Marta tendrá el doble de la edad que tenga su sobrino.`],
        prompt: '¿Cuántos años tiene hoy el sobrino?',
        answer: b, unit: 'años',
        explanation: [`Sea x la edad del sobrino: ${k}x + ${n} = 2(x + ${n}).`, `${k}x − 2x = 2·${n} − ${n} → ${k - 2}x = ${n} → x = ${b}.`, `Comprobación: hoy ${k * b} y ${b}; dentro de ${n} años, ${k * b + n} = 2 × ${b + n}.`],
      };
    },
  },
  {
    id: 'mezcla', minLevel: 4, demand: 'razonamiento',
    make(r) {
      for (;;) {
        const x = r.int(1, 6), y = r.int(1, 6), a = r.int(1, 9) * 10, b = r.int(1, 9) * 10;
        if (a === b || x === y || (x * a + y * b) % (x + y)) continue;
        const answer = (x * a + y * b) / (x + y);
        return {
          lines: [`Mezclas ${x} litros de zumo al ${a} % con ${y} litros de zumo al ${b} %.`],
          prompt: '¿Qué porcentaje de zumo tiene la mezcla?',
          answer, unit: '%', naive: (a + b) / 2, naiveTag: 'media-simple',
          explanation: [`Zumo puro: ${x} × ${a / 100} + ${y} × ${b / 100} = ${(x * a + y * b) / 100} L.`, `Volumen total: ${x + y} L → ${(x * a + y * b) / 100} ÷ ${x + y} = ${answer} %.`, 'Cada concentración pesa según su volumen (media ponderada).'],
        };
      }
    },
  },
  {
    id: 'media-ponderada', minLevel: 4, demand: 'razonamiento',
    make(r) {
      for (;;) {
        const n1 = r.int(2, 6), n2 = r.int(2, 6), a = r.int(4, 9), b = r.int(4, 9);
        if (a === b || n1 === n2 || (n1 * a + n2 * b) % (n1 + n2)) continue;
        const answer = (n1 * a + n2 * b) / (n1 + n2);
        return {
          lines: [`En ${n1} exámenes, Leo tiene una media de ${a}. En otros ${n2} exámenes, una media de ${b}.`],
          prompt: '¿Cuál es su media global?',
          answer, unit: 'puntos', naive: (a + b) / 2, naiveTag: 'media-simple',
          explanation: [`Suma total: ${n1}·${a} + ${n2}·${b} = ${n1 * a + n2 * b}.`, `Número de exámenes: ${n1 + n2}. Media: ${answer}.`],
        };
      }
    },
  },
  {
    id: 'ritmo-conjunto', minLevel: 5, demand: 'razonamiento',
    make(r) {
      const [a, b] = r.pick([[3, 6], [4, 12], [6, 12], [10, 15], [12, 24], [20, 30], [2, 3], [4, 6], [5, 20]] as [number, number][]);
      const answer = (a * b * 60) / (a + b);
      return {
        lines: [`Un grifo llena un depósito en ${a} horas; otro lo llena en ${b} horas.`],
        prompt: '¿Cuántos minutos tardan si se abren los dos a la vez?',
        answer, unit: 'min', naive: ((a + b) / 2) * 60, naiveTag: 'media-de-tiempos',
        explanation: [`En una hora llenan 1/${a} + 1/${b} = ${a + b}/${a * b} del depósito.`, `Tiempo: ${a * b}/${a + b} h = ${answer} minutos.`, 'Los ritmos se suman; los tiempos no.'],
      };
    },
  },
  {
    id: 'descuento-inverso', minLevel: 5, demand: 'razonamiento',
    make(r) {
      const P = r.int(2, 9) * 100, d = r.pick([10, 20, 25, 40, 50]);
      const F = (P * (100 - d)) / 100;
      return {
        lines: [`Tras aplicar un descuento del ${d} %, pagas ${F} €.`],
        prompt: '¿Cuál era el precio original?',
        answer: P, unit: '€', naive: F * (1 + d / 100), naiveTag: 'base-incorrecta',
        explanation: [`${F} € es el ${100 - d} % del precio original.`, `Original = ${F} ÷ ${(100 - d) / 100} = ${P} €.`, `Sumar el ${d} % a ${F} da otra cifra porque la base es distinta.`],
      };
    },
  },
  {
    id: 'interes-compuesto', minLevel: 6, demand: 'conocimiento',
    make(r) {
      const C = r.int(1, 9) * 1000, i = r.pick([10, 20, 30]);
      const answer = (C * (100 + i) ** 2) / 10000;
      return {
        lines: [`Depositas ${C} € a un interés compuesto del ${i} % anual.`],
        prompt: '¿Cuántos euros tendrás al cabo de 2 años?',
        answer, unit: '€', naive: C * (1 + (2 * i) / 100), naiveTag: 'interes-simple',
        explanation: [`Año 1: ${C} × ${1 + i / 100} = ${(C * (100 + i)) / 100}.`, `Año 2: ${(C * (100 + i)) / 100} × ${1 + i / 100} = ${answer}.`, 'En interés compuesto, el interés del segundo año se calcula sobre el capital ya aumentado.'],
      };
    },
  },
];

function makeQuantItem(rng: Rng, level: number, variant: Variant, focus?: string): Item {
  const L = lvl(level);
  let pool = TEMPLATES.filter((t) => t.minLevel <= L && t.minLevel >= L - 5);
  if (focus) {
    const f = TEMPLATES.filter((t) => t.id === focus);
    if (f.length) pool = f;
  }
  const tpl = rng.pick(pool);
  const q = tpl.make(rng);
  return {
    signature: `quant:${tpl.id}:${q.lines.join('|')}`,
    taskId: 'E-problems',
    level,
    variant,
    seed: rng.seed,
    prompt: `${q.prompt} (${q.unit})`,
    lines: q.lines,
    response: { type: 'numeric', answer: q.answer, tolerance: 0.01 },
    explanation: q.explanation,
    focusKey: tpl.id,
    demand: tpl.demand,
    meta: { template: tpl.id, naive: q.naive, naiveTag: q.naiveTag },
  };
}

export const quantProblemsTask: ItemTask = {
  kind: 'item',
  id: 'E-problems',
  module: 'E',
  name: 'Problemas cuantitativos',
  short: 'Problemas',
  objective: 'Modelizar situaciones cotidianas con relaciones numéricas y evitar respuestas intuitivas erróneas.',
  instructions: [
    'Lee el problema y escribe la respuesta numérica.',
    'Muchos problemas tienen una respuesta intuitiva incorrecta: comprueba tu resultado.',
    'Puedes usar papel. No uses calculadora si quieres entrenar el cálculo mental.',
  ],
  strategies: [
    { id: 'plantear-ecuacion', label: 'Planteé una ecuación' },
    { id: 'caso-concreto', label: 'Probé con un caso concreto' },
    { id: 'unidades', label: 'Razoné con las unidades' },
    { id: 'intuicion', label: 'Respuesta intuitiva' },
  ],
  errorAdvice: {
    'proporcion-directa': { meaning: 'Trataste una proporción inversa como directa.', better: 'Pregúntate: si aumenta una magnitud, ¿la otra aumenta o disminuye?' },
    'sumar-porcentajes': { meaning: 'Sumaste porcentajes aplicados sobre bases distintas.', better: 'Aplica cada porcentaje como un factor multiplicativo (×1,2; ×0,8).' },
    'reparto-igual': { meaning: 'Supusiste que cada uno recorre la mitad.', better: 'Calcula primero el tiempo de encuentro con la velocidad relativa.' },
    'ecuacion-mal-planteada': { meaning: 'El planteamiento no recoge ambas condiciones.', better: 'Escribe ambas edades dentro de n años y aplica la condición.' },
    'media-simple': { meaning: 'Hiciste la media simple sin ponderar.', better: 'Pondera cada valor por su cantidad.' },
    'media-de-tiempos': { meaning: 'Promediaste tiempos en lugar de sumar ritmos.', better: 'Convierte tiempos en ritmos (fracción por hora), súmalos y vuelve a tiempo.' },
    'base-incorrecta': { meaning: 'Aplicaste el porcentaje sobre la base equivocada.', better: 'Identifica de qué cantidad es porcentaje el dato.' },
    'interes-simple': { meaning: 'Aplicaste interés simple en lugar de compuesto.', better: 'Encadena los factores año a año.' },
    'error-calculo': { meaning: 'Planteamiento probablemente correcto, cálculo erróneo.', better: 'Comprueba el resultado sustituyéndolo en el enunciado.' },
    'otro': { meaning: 'La respuesta no coincide con errores típicos conocidos.', better: 'Identifica qué se pide, qué datos hay y qué relación los une.' },
  },
  transferHint: 'Antes de aceptar una cifra (oferta, estadística, presupuesto), pregúntate sobre qué base se calcula.',
  minLevel: 1,
  maxLevel: 10,
  hasNovel: false,
  blockSeconds: 240,
  itemsPerBlock: 4,
  expectedSeconds: (level) => 40 + level * 6,
  generate: makeQuantItem,
  validate(item) {
    const errs = baseValidate(item);
    if (item.response.type !== 'numeric') return [...errs, 'tipo incorrecto'];
    if (!Number.isInteger(item.response.answer)) errs.push('respuesta no entera');
    const m = item.meta as { naive?: number };
    if (m.naive !== undefined && Math.abs(m.naive - item.response.answer) < 1e-9 && item.focusKey !== 'porcentajes-sucesivos') errs.push('la respuesta intuitiva coincide con la correcta');
    return errs;
  },
  diagnose(item, raw) {
    const v = Number(String(raw).replace(',', '.'));
    const m = item.meta as { naive?: number; naiveTag?: string };
    if (m.naive !== undefined && Math.abs(v - m.naive) < 0.01) return m.naiveTag;
    if (item.response.type === 'numeric' && Math.abs(v - item.response.answer) <= Math.abs(item.response.answer) * 0.05) return 'error-calculo';
    return 'otro';
  },
};

// ---------- Estimación ----------
function makeEstimationItem(rng: Rng, level: number, variant: Variant): Item {
  const L = lvl(level);
  const digitsA = L <= 3 ? 2 : L <= 6 ? 3 : 4;
  const a = rng.int(10 ** (digitsA - 1) + 1, 10 ** digitsA - 1);
  const b = rng.int(L <= 5 ? 11 : 101, L <= 5 ? 99 : 999);
  const op = L >= 5 && rng.chance(0.4) ? 'div' : 'mul';
  const exact = op === 'mul' ? a * b : (a * b) / b; // en la división se presenta a·b ÷ b
  const shown = op === 'mul' ? `${a.toLocaleString('es-ES')} × ${b.toLocaleString('es-ES')}` : `${(a * b).toLocaleString('es-ES')} ÷ ${b.toLocaleString('es-ES')}`;
  const ra = Number(a.toPrecision(1)), rb = Number(b.toPrecision(1));
  return {
    signature: `estim:${shown}`,
    taskId: 'E-estimation',
    level,
    variant,
    seed: rng.seed,
    prompt: 'Estima el resultado sin calcularlo exactamente (se acepta un error de ±10 %).',
    figure: { type: 'symbols', text: `${shown} ≈ ?` },
    response: { type: 'numeric', answer: exact, relativeTolerance: 0.1 },
    explanation: [
      `Valor exacto: ${exact.toLocaleString('es-ES')}. Rango aceptado: ${Math.round(exact * 0.9).toLocaleString('es-ES')} – ${Math.round(exact * 1.1).toLocaleString('es-ES')}.`,
      op === 'mul' ? `Redondeo rápido: ${ra} × ${rb} = ${(ra * rb).toLocaleString('es-ES')}; después corrige según hacia dónde redondeaste.` : 'Redondea el divisor y ajusta el dividendo en la misma dirección.',
      'Redondear un factor hacia arriba y el otro hacia abajo compensa el error.',
    ],
    focusKey: op,
    demand: 'conocimiento',
    meta: { a, b, op },
  };
}

export const estimationTask: ItemTask = {
  kind: 'item',
  id: 'E-estimation',
  module: 'E',
  name: 'Estimación numérica',
  short: 'Estimación',
  objective: 'Estimar magnitudes con rapidez y con un error acotado.',
  instructions: ['Escribe una estimación del resultado.', 'Se considera correcta si está a menos de un 10 % del valor exacto.', 'No hace falta calcular de forma exacta: redondea.'],
  strategies: [
    { id: 'redondeo-compensado', label: 'Redondeo compensado' },
    { id: 'orden-magnitud', label: 'Orden de magnitud primero' },
    { id: 'calculo-exacto', label: 'Cálculo exacto' },
  ],
  errorAdvice: {
    'orden-magnitud': { meaning: 'Te desviaste en un factor 10 o más.', better: 'Cuenta primero las cifras del resultado.' },
    'fuera-de-rango': { meaning: 'Estimación con más del 10 % de error.', better: 'Compensa el redondeo: si subes un factor, baja el otro.' },
  },
  transferHint: 'La estimación permite detectar errores en facturas, presupuestos o datos antes de analizarlos.',
  minLevel: 1,
  maxLevel: 10,
  hasNovel: false,
  blockSeconds: 120,
  itemsPerBlock: 6,
  expectedSeconds: () => 15,
  generate: makeEstimationItem,
  validate(item) {
    const errs = baseValidate(item);
    const m = item.meta as { a: number; b: number; op: string };
    if (item.response.type !== 'numeric') return [...errs, 'tipo incorrecto'];
    const expected = m.op === 'mul' ? m.a * m.b : m.a;
    if (item.response.answer !== expected) errs.push('respuesta exacta incorrecta');
    return errs;
  },
  diagnose(item, raw) {
    const v = Number(String(raw).replace(',', '.'));
    if (item.response.type !== 'numeric' || !(v > 0)) return 'fuera-de-rango';
    const ratio = v / item.response.answer;
    return ratio > 5 || ratio < 0.2 ? 'orden-magnitud' : 'fuera-de-rango';
  },
};

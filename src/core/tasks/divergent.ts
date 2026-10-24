import type { OpenTask } from '../types';
import { normalizeText } from './common';

// Pensamiento divergente. La evaluación usa una rúbrica explícita con dimensiones separadas.
// No se calcula ningún índice global ni se presenta como medida de inteligencia.

const CATS_OBJ = ['Uso original del objeto', 'Construcción / soporte', 'Herramienta', 'Arte / decoración', 'Juego / ocio', 'Protección / seguridad', 'Comunicación / señal', 'Medida / cálculo', 'Otro'];

export const altUsesTask: OpenTask = {
  kind: 'open',
  id: 'G-uses',
  module: 'G',
  name: 'Usos alternativos',
  short: 'Usos',
  objective: 'Generar muchas ideas distintas y originales para un objeto cotidiano.',
  instructions: ['Escribe todos los usos posibles del objeto, uno por línea (pulsa Intro).', 'Tienes 3 minutos. Cantidad, variedad y originalidad cuentan por separado.', 'Al terminar valorarás tus respuestas con una rúbrica.'],
  strategies: [{ id: 'propiedades', label: 'Descompuse el objeto en propiedades' }, { id: 'contextos', label: 'Imaginé contextos distintos' }, { id: 'libre', label: 'Asociación libre' }],
  errorAdvice: {},
  transferHint: 'Descomponer un objeto en propiedades (forma, material, peso) es una técnica útil para resolver problemas prácticos.',
  minLevel: 1, maxLevel: 1, hasNovel: false, blockSeconds: 240,
  durationSeconds: 180,
  prompts: [
    { signature: 'uses:ladrillo', title: 'Un ladrillo', prompt: '¿Para qué se puede usar un ladrillo?', common: ['construir', 'pared', 'muro', 'casa', 'pisapapeles', 'arma', 'tope de puerta', 'sujetar puerta'], categories: CATS_OBJ },
    { signature: 'uses:clip', title: 'Un clip', prompt: '¿Para qué se puede usar un clip?', common: ['sujetar papeles', 'abrir cerradura', 'ganzua', 'reiniciar movil', 'sacar sim', 'pendiente', 'gancho'], categories: CATS_OBJ },
    { signature: 'uses:periodico', title: 'Un periódico', prompt: '¿Para qué se puede usar un periódico viejo?', common: ['leer', 'envolver', 'limpiar cristales', 'encender fuego', 'papel mache', 'proteger suelo', 'gorro'], categories: CATS_OBJ },
    { signature: 'uses:botella', title: 'Una botella de plástico', prompt: '¿Para qué se puede usar una botella de plástico vacía?', common: ['beber', 'maceta', 'regadera', 'hucha', 'embudo', 'flotador', 'reciclar'], categories: CATS_OBJ },
    { signature: 'uses:cuerda', title: 'Una cuerda', prompt: '¿Para qué se puede usar una cuerda?', common: ['atar', 'saltar', 'tender ropa', 'escalar', 'remolcar', 'columpio', 'cinturon'], categories: CATS_OBJ },
    { signature: 'uses:calcetin', title: 'Un calcetín', prompt: '¿Para qué se puede usar un calcetín desparejado?', common: ['marioneta', 'limpiar', 'guante', 'funda', 'trapo', 'saco de arena'], categories: CATS_OBJ },
    { signature: 'uses:cuchara', title: 'Una cuchara', prompt: '¿Para qué se puede usar una cuchara?', common: ['comer', 'remover', 'catapulta', 'cavar', 'espejo', 'medir', 'abrir lata'], categories: CATS_OBJ },
    { signature: 'uses:paraguas', title: 'Un paraguas', prompt: '¿Para qué se puede usar un paraguas?', common: ['protegerse de la lluvia', 'sombrilla', 'baston', 'gancho', 'arma', 'colgar ropa'], categories: CATS_OBJ },
  ],
};

const CATS_SOL = ['Cambio de proceso', 'Tecnología', 'Personas / organización', 'Incentivos / normas', 'Espacio / diseño físico', 'Información / comunicación', 'Eliminar el problema de raíz', 'Otro'];

export const altSolutionsTask: OpenTask = {
  kind: 'open',
  id: 'G-solutions',
  module: 'G',
  name: 'Soluciones alternativas',
  short: 'Soluciones',
  objective: 'Generar soluciones distintas a un problema práctico, incluyendo enfoques poco obvios.',
  instructions: ['Lee el problema y propón todas las soluciones que se te ocurran, una por línea.', 'Tienes 3 minutos.', 'Busca soluciones de tipos distintos, no variaciones de la misma.'],
  strategies: [{ id: 'reformular', label: 'Reformulé el problema' }, { id: 'perspectivas', label: 'Adopté perspectivas distintas' }, { id: 'invertir', label: 'Pensé cómo empeorarlo y lo invertí' }],
  errorAdvice: {},
  transferHint: 'Generar varias alternativas antes de elegir mejora las decisiones en cualquier ámbito.',
  minLevel: 1, maxLevel: 1, hasNovel: false, blockSeconds: 240,
  durationSeconds: 180,
  prompts: [
    { signature: 'sol:colas', title: 'Colas en el supermercado', prompt: 'Las colas en las cajas de un supermercado son muy largas por la tarde. ¿Cómo podría reducirse la espera?', common: ['mas cajas', 'mas cajeros', 'autopago', 'cajas rapidas', 'contratar mas personal'], categories: CATS_SOL },
    { signature: 'sol:ruido', title: 'Ruido en la biblioteca', prompt: 'En una biblioteca hay demasiado ruido en la sala de estudio. ¿Qué soluciones se te ocurren?', common: ['carteles', 'vigilante', 'sala de silencio', 'multas', 'cascos'], categories: CATS_SOL },
    { signature: 'sol:olvidos', title: 'Llaves olvidadas', prompt: 'Una persona olvida a menudo las llaves al salir de casa. ¿Cómo podría evitarlo?', common: ['gancho junto a la puerta', 'recordatorio en el movil', 'cerradura digital', 'copia a un vecino', 'llavero localizador'], categories: CATS_SOL },
    { signature: 'sol:comida', title: 'Desperdicio de comida', prompt: 'En un comedor escolar se tira mucha comida cada día. ¿Cómo reducirlo?', common: ['raciones mas pequenas', 'donar', 'compost', 'preguntar preferencias', 'menu mas variado'], categories: CATS_SOL },
  ],
};

const CATS_ASSOC = ['Relación física', 'Relación funcional', 'Relación simbólica / cultural', 'Juego de palabras', 'Relación causal', 'Relación emocional', 'Otro'];

export const remoteAssocTask: OpenTask = {
  kind: 'open',
  id: 'G-connections',
  module: 'G',
  name: 'Conexiones remotas',
  short: 'Conexiones',
  objective: 'Encontrar relaciones entre conceptos aparentemente lejanos (flexibilidad semántica).',
  instructions: ['Se presentan dos conceptos que parecen no tener relación.', 'Escribe todas las conexiones que encuentres entre ellos, una por línea.', 'Tienes 3 minutos.'],
  strategies: [{ id: 'puente', label: 'Busqué conceptos puente' }, { id: 'propiedades', label: 'Comparé propiedades' }, { id: 'historias', label: 'Inventé una historia' }],
  errorAdvice: {},
  transferHint: 'Conectar ideas de campos distintos es el origen de muchas soluciones innovadoras.',
  minLevel: 1, maxLevel: 1, hasNovel: false, blockSeconds: 240,
  durationSeconds: 180,
  prompts: [
    { signature: 'con:faro-abeja', title: 'Faro ↔ Abeja', prompt: '¿Qué conexiones hay entre un faro y una abeja?', common: ['amarillo', 'rayas', 'guian', 'luz', 'colmena'], categories: CATS_ASSOC },
    { signature: 'con:reloj-rio', title: 'Reloj ↔ Río', prompt: '¿Qué conexiones hay entre un reloj y un río?', common: ['fluye', 'tiempo', 'corre', 'movimiento', 'agua'], categories: CATS_ASSOC },
    { signature: 'con:llave-libro', title: 'Llave ↔ Libro', prompt: '¿Qué conexiones hay entre una llave y un libro?', common: ['abrir', 'conocimiento', 'secreto', 'puerta', 'clave'], categories: CATS_ASSOC },
    { signature: 'con:nube-esponja', title: 'Nube ↔ Esponja', prompt: '¿Qué conexiones hay entre una nube y una esponja?', common: ['agua', 'absorbe', 'blanda', 'suave', 'lluvia'], categories: CATS_ASSOC },
  ],
};

export interface OpenRating {
  text: string;
  category: string;
  /** 1 = común, 2 = poco frecuente, 3 = muy original (autoevaluado con la rúbrica). */
  originality: 1 | 2 | 3;
  appropriate: boolean;
  autoCommon: boolean;
}

export const ORIGINALITY_RUBRIC = [
  { value: 1, label: 'Común', desc: 'Respuesta que mucha gente daría o uso habitual del objeto.' },
  { value: 2, label: 'Poco frecuente', desc: 'Razonable pero no la primera que se le ocurriría a la mayoría.' },
  { value: 3, label: 'Muy original', desc: 'Inesperada, combina el objeto con un contexto lejano y sigue siendo viable.' },
];
export const APPROPRIATENESS_RUBRIC = 'Adecuada: la idea es físicamente posible y responde realmente a la consigna.';

export function isCommon(text: string, common: string[]): boolean {
  const n = normalizeText(text);
  return common.some((c) => {
    const cn = normalizeText(c);
    return n === cn || n.includes(cn) || (n.length >= 4 && cn.includes(n));
  });
}

export interface DivergentScores {
  fluidez: number;
  variedad: number;
  originalidad: number;
  adecuacion: number;
}

/** Cuatro dimensiones separadas; no se combinan en una puntuación global. */
export function scoreDivergent(ratings: OpenRating[]): DivergentScores {
  const unique = ratings.filter((r, i) => ratings.findIndex((q) => normalizeText(q.text) === normalizeText(r.text)) === i && normalizeText(r.text).length > 0);
  const appropriate = unique.filter((r) => r.appropriate);
  return {
    fluidez: unique.length,
    variedad: new Set(appropriate.map((r) => r.category)).size,
    originalidad: appropriate.length ? appropriate.reduce((a, r) => a + (r.autoCommon ? 1 : r.originality), 0) / appropriate.length : 0,
    adecuacion: unique.length ? appropriate.length / unique.length : 0,
  };
}

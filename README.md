# NEUROFORGE X

Laboratorio personal de entrenamiento cognitivo con medición honesta. Funciona en el navegador, sin cuentas, sin servidores y sin API de pago.

> **Hipótesis de trabajo (no un resultado):** un entrenamiento eficaz, prolongado, adaptativo y multidimensional podría mejorar capacidades concretas y parte de esa mejora podría transferirse a razonamiento general y, quizá, a mediciones estandarizadas. La aplicación está diseñada para **ponerlo a prueba**, separando dominio, generalización, transferencia y evaluación externa. No calcula CI, percentiles ni baremos.

## Qué incluye

| Área | Implementación |
|---|---|
| A · Razonamiento fluido | Series numéricas, matrices 3×3 (opciones por bisección de atributos), analogías relacionales, deducción de órdenes, problemas de restricciones |
| B · Memoria de trabajo | Span inverso (agrupable / no agrupable), n-back con señuelos, actualización continua, memoria con distractores, span complejo, integración temporal |
| C · Velocidad y atención | Comparación de símbolos, búsqueda visual (pendiente ms/elemento), flancos (coste de interferencia), go/no-go |
| D · Flexibilidad | Alternancia de tareas (coste de cambio), clasificación con reglas cambiantes (errores perseverativos), jarras (efecto Einstellung), información contradictoria |
| E · Cuantitativo y lógica | Problemas cotidianos con respuesta intuitiva errónea, probabilidad exacta, inferencia lógica por tabla de verdad, estimación; separación conocimiento/razonamiento |
| F · Aprendizaje | Léxico artificial con reglas, tarjetas propias, repetición espaciada Leitner, intercalado, elaboración, ejemplos resueltos, repaso de errores, retención diferida ≥ 20 h |
| G · Divergente | Usos alternativos, soluciones alternativas, conexiones remotas; rúbrica con 4 dimensiones separadas |
| H · Metacognición | Confianza previa opcional, feedback (estrategia, error, alternativa, aplicación), calibración (Brier, sesgo), revisión dirigida |
| Transferencia | Banco reservado (series de letras, inferencia de operaciones, razonamiento aplicado) con formas paralelas de dificultad fija + protocolo de aprendizaje nuevo |
| Motor adaptativo | Escalera ponderada, reglas 1–8, selección por puntuación con pesos heurísticos configurables, planificador de sesión, programa de 12 semanas en 6 fases |
| Medición | 4 paneles (dominio, generalización, transferencia, evaluación externa), perfil observado vs. estimación latente, comparación entre periodos, «evidencia insuficiente» |
| Experimentos | Protocolo ABBA predefinido, pre/post a nivel fijo, retención, variante nueva, advertencias |
| Datos | IndexedDB local, exportación JSON/CSV, importación, borrado total |
| App instalable | PWA: icono propio, pantalla completa y funcionamiento sin conexión (service worker generado en cada compilación) |
| Otros | Diario, modo concentración, sonidos opcionales, teclado, móvil, reducción de animaciones, modo desarrollo |

La metodología completa está en [`METODOLOGIA.md`](METODOLOGIA.md) y en la página *Metodología* de la aplicación.

## Ejecutar en local

Requisitos: Node.js 18 o superior.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 77 pruebas: generadores, motor, persistencia, analítica
npm run build      # genera dist/ (sitio estático)
npm run preview    # sirve dist/ en http://localhost:4173
```

## Arquitectura

```
src/
  core/            Lógica pura, sin React (probada con Vitest)
    tasks/         Generadores de ejercicios + validadores automáticos
    engine/        Motor adaptativo, selección, planificador, programa, simulador
    analytics.ts   Agregados de los paneles (devuelven «insuficiente» sin datos)
    learning.ts    Módulo F (léxico, Leitner, intercalado)
    experiment.ts  Modo experimental
  data/            IndexedDB (idb), exportación/importación, store de React
  ui/              Interfaz: runners de ejercicios, páginas, gráficos SVG propios
tests/             Pruebas unitarias y de integración
```

Pila: React 18 + TypeScript + Vite + Tailwind CSS 4 + IndexedDB (`idb`). Gráficos en SVG sin dependencias. Enrutado por hash, de modo que funciona en cualquier alojamiento estático.

## Publicar gratis

El resultado de `npm run build` es un sitio estático (`dist/`, ~140 KB comprimidos). No hay backend ni claves secretas.

| Opción | Cómo | Límites relevantes |
|---|---|---|
| **GitHub Pages** | Incluido `.github/workflows/deploy.yml`: sube el repositorio, activa *Settings → Pages → Source: GitHub Actions* y haz push a `main`. | Gratis en repositorios públicos (en privados requiere plan de pago). Límites de uso blando (~100 GB/mes de tráfico, sitio ≤ 1 GB). |
| **Netlify** | Nuevo sitio desde Git, comando `npm run build`, carpeta `dist`. O arrastra `dist/` a app.netlify.com/drop. | Plan gratuito con cuota mensual de ancho de banda y minutos de compilación. |
| **Vercel** | Importa el repositorio; detecta Vite automáticamente. | Plan Hobby solo para uso no comercial. |
| **Cloudflare Pages** | Conecta el repositorio, comando `npm run build`, salida `dist`. | Ancho de banda generoso; límite de compilaciones mensuales. |

Los límites cambian con el tiempo: consulta la página de precios de cada servicio antes de decidir.

**Importante:** los datos viven en el navegador de cada persona. Cambiar de dominio, de navegador o borrar los datos del sitio implica empezar de cero; usa *Ajustes → Exportar* para conservar una copia.

## Instalar como app

Abre la web y pulsa **«Instalar app»** (menú lateral o *Ajustes*):

- **Chrome / Edge (ordenador) y Android:** aparece el diálogo de instalación del navegador.
- **iPhone / iPad:** en Safari, *Compartir → Añadir a pantalla de inicio*.

Instalada se abre a pantalla completa y funciona sin conexión. Cada versión nueva publicada se descarga sola la próxima vez que se abra con internet.

## Privacidad

- No se envía ningún dato a ningún servidor; no hay analítica ni cookies de terceros.
- No se cargan recursos externos (tipografías, scripts) en tiempo de ejecución.
- El nombre es opcional y solo se guarda localmente.

## Limitaciones conocidas

- Sin baremos ni comparación con otras personas, por diseño.
- Las formas paralelas del banco de transferencia no están equiparadas psicométricamente.
- La latencia del navegador y de la pantalla no puede eliminarse por completo; compara tiempos solo con el mismo dispositivo.
- La originalidad de las respuestas abiertas es autoevaluada (con detección automática de respuestas frecuentes).
- Si se detiene una sesión a mitad de un bloque, los ensayos ya respondidos se guardan pero ese bloque no cuenta en los paneles.
- Sin sincronización entre dispositivos.
- No es una herramienta clínica ni diagnóstica.

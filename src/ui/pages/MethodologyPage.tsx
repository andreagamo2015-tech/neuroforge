import { TASKS } from '../../core/registry';
import { MODULE_NAMES, type ModuleId } from '../../core/types';
import { Badge, Card, Evidence, PageTitle } from '../components/ui';

export function MethodologyPage() {
  const byModule = (['A', 'B', 'C', 'D', 'E', 'G', 'T'] as ModuleId[]).map((m) => ({ m, tasks: TASKS.filter((t) => t.module === m) }));
  return (
    <div className="space-y-5">
      <PageTitle title="Metodología y honestidad científica" subtitle="Qué hace la aplicación, qué no hace y cómo interpretar sus resultados." />
      <Card title="Hipótesis de trabajo">
        <p className="text-sm"><Evidence level="hipotesis" /> «Si diseñamos un entrenamiento suficientemente eficaz, prolongado, adaptativo y multidimensional, es posible que una persona mejore determinadas capacidades cognitivas y que parte de esas mejoras se transfiera a tareas de razonamiento general y, potencialmente, a mediciones estandarizadas de inteligencia.»</p>
        <p className="mt-2 text-sm text-muted">Es un objetivo que se pone a prueba, no un resultado demostrado. La investigación publicada sobre entrenamiento cognitivo suele encontrar mejoras en las tareas entrenadas y en tareas muy parecidas, mientras que la transferencia lejana a la inteligencia general es objeto de debate y a menudo no se observa en estudios bien controlados (véanse, por ejemplo, las revisiones de Melby-Lervåg y Hulme, 2013, y de Simons y colaboradores, 2016). Por eso NEUROFORGE X mide los cuatro niveles por separado.</p>
      </Card>
      <Card title="Niveles de evidencia que usa la aplicación">
        <ul className="space-y-2 text-sm">
          <li><Evidence level="hipotesis" /> Lo que se quiere comprobar.</li>
          <li><Evidence level="observado" /> Lo que muestran tus datos, sin generalizar.</li>
          <li><Evidence level="preliminar" /> Un patrón con pocos datos o sin control de factores de confusión.</li>
          <li><Evidence level="replicado" /> Un patrón que se repite en mediciones independientes a lo largo del tiempo.</li>
          <li><Evidence level="estandarizado" /> Evaluación externa con instrumento autorizado, administrada por profesionales.</li>
          <li><Evidence level="insuficiente" /> Se muestra en lugar de un número cuando no hay datos suficientes.</li>
        </ul>
      </Card>
      <Card title="Cinco niveles de mejora">
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>Dominio de un ejercicio concreto → panel <b>Dominio</b>.</li>
          <li>Mejora de una habilidad entrenada → nivel y umbral estimado por tarea (<b>Perfil</b>).</li>
          <li>Transferencia a ejercicios nuevos de la misma familia → panel <b>Generalización</b> (variantes nuevas).</li>
          <li>Transferencia a problemas diferentes → panel <b>Transferencia</b> (banco reservado + aprendizaje de material nuevo).</li>
          <li>Cambios en medidas estandarizadas → panel <b>Evaluación externa</b> (registro manual; sin conversiones).</li>
        </ol>
      </Card>
      <Card title="Motor adaptativo">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li><b className="text-ink">Escalera ponderada</b> (método de Kaernbach, 1991): tras cada acierto el nivel sube un paso; tras cada error baja paso × p/(1−p), de modo que la precisión converge al objetivo (80 % por defecto).</li>
          <li><b className="text-ink">Tareas cronometradas</b>: el nivel cambia al final del bloque solo si la precisión es alta; nunca se premia la velocidad con precisión baja.</li>
          <li><b className="text-ink">Variabilidad alta</b> → pasos a la mitad hasta tener más datos. <b className="text-ink">Errores seguidos</b> → ejemplo resuelto.</li>
          <li><b className="text-ink">Mejora en tareas familiares</b> → variantes nuevas. <b className="text-ink">Estancamiento</b> → menos repetición, más variación y revisión.</li>
          <li><b className="text-ink">Fatiga</b> declarada alta → sesión ligera. Caída de rendimiento dentro de la sesión → sugerencia de pausa.</li>
          <li><b className="text-ink">Habilidad desproporcionadamente avanzada</b> → se redistribuye el tiempo. <b className="text-ink">Mejora solo en una tarea</b> → aviso de mejora específica; no se extrapola.</li>
          <li><b className="text-ink">Selección</b>: puntuación = Σ peso × factor (relevancia, necesidad, falta de datos, progreso, brecha de generalización, coste temporal, sobreentrenamiento, tiempo desde la última práctica, errores). Pesos heurísticos y configurables; el desglose se ve en el modo desarrollo.</li>
          <li><b className="text-ink">Estimación latente</b>: modelo logístico de pendiente fija con previa débil, ajustado por rejilla bayesiana sobre los ensayos de cada tarea. Da un umbral en unidades de nivel de la tarea con su incertidumbre. No es CI.</li>
        </ul>
      </Card>
      <Card title="Validez de los ejercicios">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Todos los ítems se generan con plantillas de reglas verificables y semillas reproducibles. Cada ítem pasa un validador antes de mostrarse (unicidad de la respuesta, ausencia de reglas alternativas más simples, distractores incorrectos). Los ítems que fallan se descartan.</li>
          <li>Matrices: opciones por bisección de atributos (2ᵏ combinaciones), de forma que la respuesta no se puede adivinar eligiendo la opción más frecuente.</li>
          <li>Se guardan las firmas de los últimos 500 ítems por tarea para no repetirlos.</li>
          <li>El banco de transferencia está separado del entrenamiento y usa formas paralelas de dificultad fija. Las formas no están equiparadas psicométricamente.</li>
          <li>Velocidad: tiempos desde el pintado del estímulo (requestAnimationFrame), medianas, exclusión de anticipaciones (&lt; 150 ms), registro del tipo de entrada y una medición de tiempo de reacción simple por sesión como referencia del dispositivo. La latencia del navegador y de la pantalla no puede eliminarse por completo: compara tiempos solo con el mismo dispositivo.</li>
        </ul>
      </Card>
      <Card title="Qué NO hace esta versión">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>No calcula CI, percentiles, baremos ni intervalos de confianza poblacionales.</li>
          <li>No compara tu rendimiento con otras personas ni tiene rankings.</li>
          <li>No integra pruebas psicométricas estandarizadas: solo permite registrar manualmente las que haga un profesional.</li>
          <li>No evalúa automáticamente la originalidad de las respuestas abiertas más allá de una lista de respuestas frecuentes; el resto es autoevaluación con rúbrica.</li>
          <li>No sincroniza datos entre dispositivos (los datos viven en el navegador).</li>
          <li>Los resultados del modo experimental son descriptivos (n = 1): no demuestran causalidad.</li>
        </ul>
      </Card>
      <Card title="Tareas implementadas">
        <div className="grid gap-3 md:grid-cols-2">
          {byModule.map(({ m, tasks }) => (
            <div key={m}>
              <div className="mb-1 text-sm font-semibold">{MODULE_NAMES[m]}</div>
              <ul className="space-y-0.5 text-xs text-muted">{tasks.map((t) => <li key={t.id}>{t.name} {t.hasNovel && <Badge tone="violet">variante nueva</Badge>} {t.reserved && <Badge tone="amber">reservada</Badge>}</li>)}</ul>
            </div>
          ))}
          <div>
            <div className="mb-1 text-sm font-semibold">{MODULE_NAMES.F}</div>
            <p className="text-xs text-muted">Léxico artificial con reglas, tarjetas propias, repetición espaciada (Leitner), intercalado, elaboración, ejemplos resueltos, repaso basado en errores y pruebas diferidas (≥ 20 h).</p>
            <div className="mb-1 mt-2 text-sm font-semibold">{MODULE_NAMES.H}</div>
            <p className="text-xs text-muted">Confianza previa opcional, feedback con estrategia, error, alternativa y aplicación; calibración (Brier, sesgo) y revisión dirigida de errores recurrentes.</p>
          </div>
        </div>
      </Card>
      <Card title="Referencias de los métodos utilizados">
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
          <li>Kaernbach, C. (1991). Simple adaptive testing with the weighted up-down method. <i>Perception &amp; Psychophysics</i>, 49, 227–229.</li>
          <li>Hautus, M. J. (1995). Corrections for extreme proportions and their biasing effects on estimated values of d′. <i>Behavior Research Methods, Instruments, &amp; Computers</i>, 27, 46–51.</li>
          <li>Luchins, A. S. (1942). Mechanization in problem solving: The effect of Einstellung. <i>Psychological Monographs</i>, 54(6).</li>
          <li>Eriksen, B. A., y Eriksen, C. W. (1974). Effects of noise letters upon the identification of a target letter in a nonsearch task. <i>Perception &amp; Psychophysics</i>, 16, 143–149.</li>
          <li>Melby-Lervåg, M., y Hulme, C. (2013). Is working memory training effective? A meta-analytic review. <i>Developmental Psychology</i>, 49(2), 270–291.</li>
          <li>Simons, D. J., et al. (2016). Do “brain-training” programs work? <i>Psychological Science in the Public Interest</i>, 17(3), 103–186.</li>
        </ul>
      </Card>
    </div>
  );
}

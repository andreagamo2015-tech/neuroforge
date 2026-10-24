# Metodología de NEUROFORGE X

## 1. Principio central

Se distinguen cinco niveles de mejora y cada uno tiene su propia fuente de datos:

1. **Dominio de un ejercicio**: bloques de entrenamiento de tareas conocidas (`purpose = training | free | review | baseline`, `variant = train`).
2. **Mejora de una habilidad entrenada**: umbral estimado por tarea (modelo logístico) y nivel alcanzado.
3. **Transferencia cercana**: bloques `variant = novel` con familias de reglas o materiales nunca usados en entrenamiento.
4. **Transferencia a problemas diferentes**: banco reservado (`reserved: true`), nunca entrenado, con formas paralelas de dificultad fija, y protocolo de aprendizaje de material nuevo.
5. **Medidas estandarizadas**: solo registro manual de evaluaciones profesionales. No hay ninguna fórmula que convierta puntuaciones internas en CI.

## 2. Ejercicios verificables

Cada tarea declara un esquema (`src/core/types.ts`): id, módulo, objetivo, instrucciones, generador con semilla, solución, explicación, nivel, tiempo previsto, variantes, puntuación, consejos por tipo de error y **validador**.

- `generateValidItem` descarta cualquier ítem que no supere su validador. Nunca se muestra un ítem no validado.
- Series: se rechazan si un polinomio de grado ≤ 2 o una regla geométrica encaja con los términos visibles y predice otra respuesta.
- Matrices: para cada atributo se calculan todas las reglas (constante, progresión, distribución; por filas y por columnas) que encajan con las 8 celdas conocidas; el conjunto de predicciones debe ser unitario. Las opciones se construyen por bisección de atributos (2ᵏ combinaciones) para impedir el atajo de la «opción más frecuente».
- Analogías: se enumeran todas las composiciones de transformaciones de la misma profundidad que convierten A en B; todas deben dar la misma respuesta para C.
- Deducción y restricciones: solucionador por fuerza bruta (todas las permutaciones).
- Lógica: tabla de verdad completa.
- Probabilidad: conteo exacto con fracciones.
- Operaciones nuevas (transferencia): la respuesta debe ser única frente a una biblioteca de >250 reglas alternativas.
- Se guardan las firmas de los últimos 500 ítems por tarea para no repetirlos.

`tests/generators.test.ts` genera ítems en todos los niveles y variantes y comprueba validez, que la respuesta correcta se reconoce como correcta y que las incorrectas no.

## 3. Motor adaptativo

Todos los valores son **parámetros heurísticos** (`src/core/engine/params.ts`), editables en *Ajustes*.

| Regla | Implementación |
|---|---|
| 1. Precisión alta y estable → subir | Escalera ponderada (Kaernbach, 1991): +paso tras acierto, −paso·p/(1−p) tras error; converge a p = 0,8. Tareas cronometradas: +1 si precisión del bloque ≥ 0,9. |
| 2. Precisión baja persistente → bajar y explicar | Bajada asimétrica; tras 2 errores seguidos, ejemplo resuelto a un nivel inferior. Cronometradas: −1 si precisión < 0,7. |
| 3. Mejora en tareas familiares → variantes nuevas | Variante nueva cada 4 bloques o tras subir 1,5 niveles; en fase 4, con más frecuencia. |
| 4. Estancamiento → cambiar estrategia | Pendiente del nivel < 0,05/bloque en 6 bloques y precisión sin mejorar → baja la prioridad de repetir, se proponen variantes y revisión. |
| 5. Fatiga → pausa o sesión ligera | Fatiga ≥ 4 → máx. 10 min, sin tareas pesadas, nivel −1. Caída de precisión dentro de la sesión → sugerencia de pausa. |
| 6. Habilidad mucho más rápida → redistribuir | Ganancia normalizada del módulo > 1 DE sobre la media → penalización. |
| 7. Resultados variables → más datos | DE de la precisión por bloque > 0,2 → pasos a la mitad. |
| 8. Mejora solo en una tarea → no extrapolar | Brecha entrenamiento − variante nueva > 0,2 con ganancia de nivel → aviso de mejora específica. |

Los bloques de calentamiento, revisión, sesión ligera, sondeos y transferencia **no** modifican el nivel guardado, para no inflarlo.

### Selección de ejercicios

`puntuación = Σ peso·factor`, factores en [0, 1]: relevancia (objetivos), necesidad (índice relativo bajo), falta de datos, progreso (estancamiento/desequilibrio, negativo), brecha de generalización, coste temporal (negativo), sobreentrenamiento (> 35 % de los bloques de 7 días, negativo), tiempo desde la última práctica, errores recientes. El desglose se ve en el modo desarrollo.

### Sesión

Calentamiento → habilidad prioritaria → segunda habilidad (otro módulo) → transferencia (banco reservado cada 14 días o variante nueva) → revisión dirigida del error más frecuente (tarea + foco) → bloques adicionales hasta completar 10/20/30/45 min → resumen y recomendación.

## 4. Medición

- **Observado**: precisión, tiempo mediano de aciertos, consistencia (DE de la precisión por bloque), nivel, errores, familiaridad.
- **Latente**: rejilla bayesiana de θ (nivel con 50 % de acierto), logística de pendiente 1,2, probabilidad de acierto por azar según la tarea, previa N(punto medio, 4). La estimación se acota a ±1 nivel del rango observado para que la previa no extrapole. Se marca *provisional* con < 20 ensayos, DE > 1,5 o acotación.
- **Índice 0–100**: posición de θ dentro del rango de niveles de la tarea. Solo sirve para dibujar tareas distintas en la misma barra.
- **Tendencias**: nivel normalizado de los últimos 7 días frente a los 7 anteriores (no precisión, porque la escalera la mantiene constante a propósito); requiere ≥ 3 bloques por periodo.
- **Velocidad**: inicio del estímulo en `requestAnimationFrame`, medianas, anticipaciones < 150 ms excluidas, tipo de entrada registrado, tiempo de reacción simple de referencia por sesión.

## 5. Modo experimental

Protocolo ABBA BAAB fijado al crear el experimento. Cada sesión: medición pre a nivel fijo (sin feedback) → práctica según estrategia → medición post → variante nueva. La medición pre de la sesión *k+1* es la retención de la *k*. Con menos de 3 sesiones por estrategia se muestra «evidencia insuficiente»; con más, una comparación descriptiva acompañada de advertencias (práctica, regresión a la media, expectativas, fatiga, arrastre, n = 1).

## 6. Lo que no se afirma

Ninguna pantalla presenta una puntuación interna como CI, percentil o comparación poblacional. Las etiquetas de evidencia (hipótesis, observado, preliminar, replicado, estandarizado, insuficiente) acompañan a los resultados.

import { useMemo, useState } from 'react';
import { TASKS, TRAINING_TASKS, generateValidItem, getTask } from '../../core/registry';
import { createRng } from '../../core/rng';
import type { Item, ItemTask } from '../../core/types';
import { novelProbeDue, plateau, recentVariability } from '../../core/engine/adaptive';
import { FACTOR_LABEL, prioritize } from '../../core/engine/selection';
import { simulateStaircase } from '../../core/engine/simulate';
import { correctAnswerLabel } from '../../core/tasks/common';
import { fmt } from '../../core/stats';
import { useStore } from '../../data/store';
import { LineChart } from '../components/charts';
import { Badge, Button, Card, Field, PageTitle, inputCls } from '../components/ui';
import { ItemView } from '../runners/ItemRunner';

export function DevPage() {
  const { data, states, settings, params } = useStore();
  const ranking = useMemo(() => prioritize({ tasks: TRAINING_TASKS, states, blocks: data.blocks, trials: data.trials, goals: settings.goals, params, now: Date.now() }), [states, data.blocks, data.trials, settings.goals, params]);
  const itemTasks = TASKS.filter((t): t is ItemTask => t.kind === 'item');
  const [simTask, setSimTask] = useState('A-series');
  const [theta, setTheta] = useState(6);
  const [sim, setSim] = useState<ReturnType<typeof simulateStaircase> | null>(null);
  const [val, setVal] = useState<{ id: string; ok: number; fail: number; errors: string[] }[] | null>(null);
  const [inspTask, setInspTask] = useState('A-matrices');
  const [inspLevel, setInspLevel] = useState(5);
  const [inspVariant, setInspVariant] = useState<'train' | 'novel'>('train');
  const [sample, setSample] = useState<Item | null>(null);

  function runValidation() {
    const out = itemTasks.map((t) => {
      let ok = 0, fail = 0;
      const errors = new Set<string>();
      for (let s = 1; s <= 60; s++) {
        try {
          const it = t.generate(createRng(Date.now() + s * 7919), t.minLevel + (s % (t.maxLevel - t.minLevel + 1)), 'train');
          const e = t.validate(it);
          if (e.length) { fail++; e.forEach((x) => errors.add(x)); } else ok++;
        } catch (e) { fail++; errors.add(String(e)); }
      }
      return { id: t.id, ok, fail, errors: [...errors].slice(0, 3) };
    });
    setVal(out);
  }

  return (
    <div className="space-y-5">
      <PageTitle title="Modo desarrollo" subtitle="Inspección del motor adaptativo, de la selección de ejercicios y de la validez de los generadores. Todo se calcula con tus datos reales." />
      <Card title="Prioridad de ejercicios (algoritmo de selección)" subtitle="Puntuación = suma de factores normalizados × pesos heurísticos (configurables en Ajustes).">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-xs tabular">
            <thead className="text-left text-faint"><tr><th className="p-1.5">Tarea</th><th className="p-1.5">Total</th>{Object.keys(FACTOR_LABEL).map((k) => <th key={k} className="p-1.5" title={FACTOR_LABEL[k]}>{k}</th>)}<th className="p-1.5">Motivos</th></tr></thead>
            <tbody>
              {ranking.map((r) => (
                <tr key={r.taskId} className="border-t border-night-700">
                  <td className="p-1.5">{getTask(r.taskId).short}</td>
                  <td className="p-1.5 font-semibold text-cyan">{r.score.toFixed(2)}</td>
                  {Object.keys(FACTOR_LABEL).map((k) => <td key={k} className={`p-1.5 ${r.contributions[k] < 0 ? 'text-bad' : ''}`} title={`factor ${fmt(r.factors[k], 2)}`}>{r.contributions[k].toFixed(2)}</td>)}
                  <td className="p-1.5 text-muted">{r.reasons.join(' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Estado de las reglas por tarea">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-xs tabular">
            <thead className="text-left text-faint"><tr><th className="p-1.5">Tarea</th><th className="p-1.5">Nivel</th><th className="p-1.5">Bloques</th><th className="p-1.5">Ensayos</th><th className="p-1.5">Variabilidad (DE)</th><th className="p-1.5">Pendiente</th><th className="p-1.5">Estancada</th><th className="p-1.5">Variante nueva</th><th className="p-1.5">Ejemplo resuelto</th><th className="p-1.5">Ítems vistos</th></tr></thead>
            <tbody>
              {TASKS.filter((t) => t.kind !== 'open').map((t) => {
                const s = states[t.id];
                const pl = plateau(s, params);
                const nd = novelProbeDue(t, s, params);
                return (
                  <tr key={t.id} className="border-t border-night-700">
                    <td className="p-1.5">{t.short}{t.reserved && <Badge tone="amber">reservada</Badge>}</td>
                    <td className="p-1.5">{s.level.toFixed(2)}</td>
                    <td className="p-1.5">{s.blocks}</td>
                    <td className="p-1.5">{s.trials}</td>
                    <td className="p-1.5">{fmt(recentVariability(s, params), 2)}</td>
                    <td className="p-1.5">{fmt(pl.slope, 3)}</td>
                    <td className="p-1.5">{pl.stagnant ? 'sí' : 'no'}</td>
                    <td className="p-1.5" title={nd.reason}>{nd.due ? 'toca' : '—'}</td>
                    <td className="p-1.5">{s.needsWorkedExample ? 'sí' : 'no'}</td>
                    <td className="p-1.5">{s.seen.length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Simulador de la escalera" subtitle="Respondedor sintético con umbral conocido: comprueba que la dificultad cambia y converge.">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Tarea"><select className={inputCls} value={simTask} onChange={(e) => setSimTask(e.target.value)}>{TRAINING_TASKS.filter((t) => t.kind !== 'speeded').map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
            <Field label="Umbral verdadero"><input type="number" className={inputCls} value={theta} step={0.5} onChange={(e) => setTheta(Number(e.target.value))} /></Field>
          </div>
          <Button className="mt-3" onClick={() => setSim(simulateStaircase(getTask(simTask), theta, 150, params, Date.now() % 100000))}>Simular 150 ensayos</Button>
          {sim && (
            <div className="mt-3">
              <LineChart series={[{ name: 'Nivel', points: sim.levels.map((y, i) => ({ t: Date.UTC(2026, 0, 1) + i * 60000, y })) }]} yLabel="Nivel por ensayo" />
              <p className="text-xs text-muted">Nivel medio del último tercio: {sim.finalMean.toFixed(2)} (el umbral del 50 % es {theta}; con objetivo {Math.round(params.targetAccuracy * 100)} % la escalera converge por debajo). Precisión: {Math.round(sim.accuracy * 100)} %.</p>
            </div>
          )}
        </Card>
        <Card title="Validación de generadores" subtitle="Genera 60 ítems por tarea sin filtrar y cuenta cuántos rechaza el validador (los rechazados nunca se muestran).">
          <Button onClick={runValidation}>Ejecutar validación</Button>
          {val && (
            <ul className="mt-3 space-y-1 text-xs">
              {val.map((v) => <li key={v.id}><b>{v.id}</b>: {v.ok} válidos, {v.fail} rechazados {v.errors.length > 0 && <span className="text-faint">({v.errors.join('; ')})</span>}</li>)}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Inspector de ítems" subtitle="Genera un ítem validado y muestra la solución, la explicación y los metadatos.">
        <div className="grid gap-2 sm:grid-cols-4">
          <Field label="Tarea"><select className={inputCls} value={inspTask} onChange={(e) => setInspTask(e.target.value)}>{itemTasks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
          <Field label="Nivel"><input type="number" className={inputCls} min={1} max={10} value={inspLevel} onChange={(e) => setInspLevel(Number(e.target.value))} /></Field>
          <Field label="Variante"><select className={inputCls} value={inspVariant} onChange={(e) => setInspVariant(e.target.value as 'train' | 'novel')}><option value="train">entrenamiento</option><option value="novel">nueva</option></select></Field>
          <div className="flex items-end"><Button onClick={() => { const t = getTask(inspTask) as ItemTask; setSample(generateValidItem(t, inspLevel, t.hasNovel ? inspVariant : 'train')); }}>Generar</Button></div>
        </div>
        {sample && (
          <div className="mt-4 space-y-3">
            <ItemView item={sample} />
            <div className="text-sm">Respuesta: <b className="text-ok">{correctAnswerLabel(sample)}</b></div>
            <ol className="list-decimal pl-5 text-sm text-muted">{sample.explanation.map((l, i) => <li key={i}>{l}</li>)}</ol>
            <pre className="max-h-64 overflow-auto rounded-lg bg-night-950 p-3 text-[11px] text-faint">{JSON.stringify({ signature: sample.signature, seed: sample.seed, focusKey: sample.focusKey, demand: sample.demand, meta: sample.meta }, null, 1)}</pre>
          </div>
        )}
      </Card>
    </div>
  );
}

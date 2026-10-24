import { useRef, useState } from 'react';
import { DEFAULT_PARAMS, PARAM_DOCS, type AdaptiveParams } from '../../core/engine/params';
import { FACTOR_LABEL } from '../../core/engine/selection';
import { MODULE_NAMES, TRAINABLE_MODULES } from '../../core/types';
import { exportJSON, toCSV, validateImport } from '../../data/db';
import { useStore } from '../../data/store';
import { Button, Card, Field, Modal, PageTitle, Segmented, inputCls } from '../components/ui';
import { navigate } from '../hooks';

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SettingsPage() {
  const store = useStore();
  const { settings, params } = store;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stamp = new Date().toISOString().slice(0, 10);

  const setParam = (k: keyof Omit<AdaptiveParams, 'weights'>, v: number) => void store.saveSettings({ params: { ...settings.params, [k]: v } });
  const setWeight = (k: keyof AdaptiveParams['weights'], v: number) => void store.saveSettings({ params: { ...settings.params, weights: { ...params.weights, [k]: v } } });

  async function doImport(f: File) {
    try {
      const obj = JSON.parse(await f.text());
      if (!validateImport(obj)) throw new Error('El archivo no es una exportación válida de NEUROFORGE X.');
      if (!confirm('La importación SUSTITUYE todos los datos actuales. ¿Continuar?')) return;
      await store.importData(obj);
      setMsg('Datos importados correctamente.');
    } catch (e) {
      setMsg(`Error al importar: ${String(e instanceof Error ? e.message : e)}`);
    }
  }

  return (
    <div className="space-y-5">
      <PageTitle title="Ajustes y datos" />
      {msg && <div role="status" className="rounded-xl border border-cyan/40 bg-cyan/10 p-3 text-sm">{msg}</div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Preferencias">
          <div className="space-y-4">
            <Field label="Nombre (opcional)"><input className={inputCls} defaultValue={settings.displayName ?? ''} onBlur={(e) => void store.saveSettings({ displayName: e.target.value.trim() || undefined })} maxLength={40} /></Field>
            <Field label="Duración de sesión por defecto"><Segmented label="Duración" value={settings.sessionMinutes} onChange={(v) => void store.saveSettings({ sessionMinutes: v })} options={[10, 20, 30, 45].map((m) => ({ value: m as 10 | 20 | 30 | 45, label: `${m} min` }))} /></Field>
            <Toggle label="Pedir confianza antes de responder" checked={settings.askConfidence} onChange={(v) => void store.saveSettings({ askConfidence: v })} />
            <Toggle label="Sonidos de retroalimentación" checked={settings.sound} onChange={(v) => void store.saveSettings({ sound: v })} />
            <Toggle label="Modo concentración (ocultar menú durante las sesiones)" checked={settings.focusMode} onChange={(v) => void store.saveSettings({ focusMode: v })} />
            <Field label="Reducir animaciones"><Segmented label="Animaciones" value={settings.reducedMotion} onChange={(v) => void store.saveSettings({ reducedMotion: v })} options={[{ value: 'sistema', label: 'Según el sistema' }, { value: 'sí', label: 'Sí' }, { value: 'no', label: 'No' }]} /></Field>
            <Toggle label="Modo desarrollo (inspeccionar el motor adaptativo)" checked={settings.devMode} onChange={(v) => void store.saveSettings({ devMode: v })} />
            {settings.devMode && <Button onClick={() => navigate('/desarrollo')}>Abrir modo desarrollo</Button>}
          </div>
        </Card>
        <Card title="Objetivos (relevancia por módulo)" subtitle="Peso de cada módulo en la selección de ejercicios: 0 = no priorizar, 1 = normal, 2 = máxima prioridad.">
          <div className="space-y-3">
            {TRAINABLE_MODULES.map((m) => (
              <label key={m} className="flex items-center gap-3 text-sm">
                <span className="w-56">{MODULE_NAMES[m]}</span>
                <input type="range" min={0} max={2} step={0.5} value={settings.goals[m] ?? 1} onChange={(e) => void store.saveSettings({ goals: { ...settings.goals, [m]: Number(e.target.value) } })} className="flex-1" aria-label={`Relevancia de ${MODULE_NAMES[m]}`} />
                <span className="w-8 text-right tabular">{settings.goals[m] ?? 1}</span>
              </label>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Parámetros del motor adaptativo" subtitle="Valores HEURÍSTICOS de partida, no coeficientes científicos. Cámbialos si quieres experimentar; puedes restaurar los valores por defecto." actions={<Button variant="ghost" onClick={() => void store.saveSettings({ params: {} })}>Restaurar por defecto</Button>}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(Object.keys(PARAM_DOCS) as (keyof typeof PARAM_DOCS)[]).map((k) => (
            <Field key={k} label={k} hint={`${PARAM_DOCS[k]} (defecto: ${DEFAULT_PARAMS[k]})`}>
              <input type="number" step="any" className={inputCls} value={params[k]} onChange={(e) => e.target.value !== '' && setParam(k, Number(e.target.value))} />
            </Field>
          ))}
        </div>
        <h3 className="mb-2 mt-5 text-sm font-semibold">Pesos de selección de ejercicios</h3>
        <div className="grid gap-3 md:grid-cols-3">
          {(Object.keys(params.weights) as (keyof AdaptiveParams['weights'])[]).map((k) => (
            <Field key={k} label={FACTOR_LABEL[k]} hint={`defecto: ${DEFAULT_PARAMS.weights[k]}`}>
              <input type="number" step="0.1" className={inputCls} value={params.weights[k]} onChange={(e) => e.target.value !== '' && setWeight(k, Number(e.target.value))} />
            </Field>
          ))}
        </div>
      </Card>

      <Card title="Tus datos" subtitle="Todo se guarda únicamente en este navegador (IndexedDB). No hay cuentas ni servidores. Borrar los datos del navegador también los elimina: exporta una copia si quieres conservarlos.">
        <div className="flex flex-wrap gap-2">
          <Button onClick={async () => download(`neuroforge-x-${stamp}.json`, JSON.stringify(await exportJSON(), null, 2), 'application/json')}>Exportar todo (JSON)</Button>
          <Button onClick={() => download(`neuroforge-x-ensayos-${stamp}.csv`, toCSV(store.data.trials, ['timestamp', 'sessionId', 'blockId', 'taskId', 'module', 'purpose', 'variant', 'level', 'correct', 'score', 'rtMs', 'confidence', 'errorTag', 'focusKey', 'strategy', 'condition', 'inputType']), 'text/csv')}>Exportar ensayos (CSV)</Button>
          <Button onClick={() => download(`neuroforge-x-bloques-${stamp}.csv`, toCSV(store.data.blocks, ['startedAt', 'endedAt', 'sessionId', 'taskId', 'module', 'purpose', 'variant', 'startLevel', 'endLevel', 'nTrials', 'accuracy', 'medianRt', 'simpleRtMs', 'strategy', 'experimentArm', 'experimentPhase', 'inputType']), 'text/csv')}>Exportar bloques (CSV)</Button>
          <Button onClick={() => fileRef.current?.click()}>Importar copia (JSON)</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && void doImport(e.target.files[0])} />
          <Button variant="danger" onClick={() => { setConfirmText(''); setConfirmOpen(true); }}>Eliminar todos los datos</Button>
        </div>
        <p className="mt-3 text-xs text-faint">Registros: {store.data.sessions.length} sesiones · {store.data.blocks.length} bloques · {store.data.trials.length} ensayos · {store.data.cards.length} tarjetas · {store.data.journal.length} entradas de diario.</p>
      </Card>

      <Modal open={confirmOpen} title="Eliminar todos los datos" onClose={() => setConfirmOpen(false)}>
        <p className="text-sm text-muted">Se borrarán de forma irreversible todas tus sesiones, resultados, tarjetas, diario, experimentos y ajustes de este navegador. Escribe <b className="text-ink">BORRAR</b> para confirmar.</p>
        <input className={`${inputCls} mt-3`} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} aria-label="Confirmación" autoFocus />
        <div className="mt-4 flex gap-2">
          <Button variant="danger" disabled={confirmText !== 'BORRAR'} onClick={async () => { await store.wipe(); setConfirmOpen(false); navigate('/'); }}>Eliminar definitivamente</Button>
          <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
        </div>
      </Modal>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <button role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-cyan' : 'bg-night-600'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-night-950 transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </label>
  );
}

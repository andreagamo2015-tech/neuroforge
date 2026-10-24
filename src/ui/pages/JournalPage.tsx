import { useState } from 'react';
import { uid } from '../../core/rng';
import { useStore } from '../../data/store';
import { Button, Card, Empty, Field, PageTitle, Segmented, inputCls } from '../components/ui';

export function JournalPage() {
  const store = useStore();
  const [text, setText] = useState('');
  const [sleep, setSleep] = useState('');
  const [mood, setMood] = useState(0);
  const [stress, setStress] = useState(0);
  const [energy, setEnergy] = useState(0);
  const entries = store.data.journal.slice().sort((a, b) => b.date - a.date);
  const save = async () => {
    if (!text.trim() && !sleep && !mood && !stress && !energy) return;
    await store.upsert('journal', [{ id: uid('jr'), date: Date.now(), text: text.trim(), sleepHours: sleep ? Number(sleep.replace(',', '.')) : undefined, mood: mood || undefined, stress: stress || undefined, energy: energy || undefined }]);
    setText(''); setSleep(''); setMood(0); setStress(0); setEnergy(0);
  };
  const scale = (label: string, v: number, set: (n: number) => void) => (
    <Field label={label}><Segmented label={label} value={v} onChange={set} options={[{ value: 0, label: '—' }, ...[1, 2, 3, 4, 5].map((x) => ({ value: x, label: String(x) }))]} /></Field>
  );
  return (
    <div className="space-y-5">
      <PageTitle title="Diario cognitivo" subtitle="Registra sueño, ánimo, estrés, energía y observaciones: estrategias que funcionan, situaciones en las que aplicaste lo aprendido o factores que crees que influyen." />
      <Card title="Nueva entrada">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Horas de sueño"><input className={inputCls} inputMode="decimal" value={sleep} onChange={(e) => setSleep(e.target.value)} /></Field>
          {scale('Ánimo (1–5)', mood, setMood)}
          {scale('Estrés (1–5)', stress, setStress)}
          {scale('Energía (1–5)', energy, setEnergy)}
        </div>
        <Field label="Observaciones"><textarea className={`${inputCls} mt-3`} rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="¿Qué estrategia probaste? ¿Has notado aplicar algo fuera de la app? ¿Qué te distrajo?" /></Field>
        <Button className="mt-3" variant="primary" onClick={() => void save()}>Guardar</Button>
      </Card>
      <Card title="Entradas">
        {entries.length === 0 ? <Empty title="El diario está vacío" /> : (
          <ul className="space-y-3">
            {entries.map((e) => (
              <li key={e.id} className="rounded-xl border border-night-600 p-3 text-sm">
                <div className="flex justify-between gap-2 text-xs text-faint">
                  <span>{new Date(e.date).toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'short' })}</span>
                  <button className="hover:text-bad" aria-label="Eliminar entrada" onClick={() => void store.remove('journal', e.id)}>✕</button>
                </div>
                <div className="mt-1 text-xs text-muted">{[e.sleepHours !== undefined && `sueño ${e.sleepHours} h`, e.mood && `ánimo ${e.mood}`, e.stress && `estrés ${e.stress}`, e.energy && `energía ${e.energy}`].filter(Boolean).join(' · ')}</div>
                {e.text && <p className="mt-1 whitespace-pre-wrap">{e.text}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

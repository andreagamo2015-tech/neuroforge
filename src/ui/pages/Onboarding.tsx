import { useState } from 'react';
import { useStore } from '../../data/store';
import { Button, Card, Evidence, Field, Segmented, inputCls } from '../components/ui';
import { navigate } from '../hooks';

export function Onboarding() {
  const store = useStore();
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState<10 | 20 | 30 | 45>(20);
  const [ack, setAck] = useState(false);
  const finish = async () => {
    await store.saveSettings({ onboardingDone: true, displayName: name.trim() || undefined, sessionMinutes: minutes, createdAt: Date.now() });
    navigate('/evaluacion');
  };
  return (
    <div className="mx-auto max-w-2xl space-y-5 py-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-[0.15em]">NEUROFORGE <span className="text-cyan">X</span></h1>
        <p className="mt-2 text-sm text-muted">Laboratorio personal de entrenamiento cognitivo con medición honesta.</p>
      </div>
      <Card title="Antes de empezar">
        <div className="space-y-3 text-sm leading-relaxed">
          <p><Evidence level="hipotesis" /> Este proyecto pone a prueba una hipótesis: que un entrenamiento eficaz, prolongado, adaptativo y variado pueda mejorar capacidades concretas y que parte de esa mejora se transfiera a problemas nuevos e, incluso, a mediciones estandarizadas.</p>
          <p>La evidencia científica sobre la transferencia del entrenamiento cognitivo a la inteligencia general es, como mínimo, discutida. Por eso la aplicación separa con cuidado cuatro cosas: <b>dominio</b> de ejercicios conocidos, <b>generalización</b> a variantes nuevas, <b>transferencia</b> a problemas distintos y <b>evaluación externa</b> realizada por profesionales.</p>
          <p>Nada de lo que veas aquí es un CI. No hay baremos, percentiles ni comparaciones con otras personas.</p>
          <p>Tus datos se guardan solo en este navegador. Puedes exportarlos o borrarlos en cualquier momento.</p>
          <p className="text-faint">No es una herramienta clínica ni diagnóstica. Si te preocupa tu memoria, atención o salud mental, consulta a un profesional.</p>
        </div>
      </Card>
      <Card title="Configuración inicial">
        <div className="space-y-4">
          <Field label="¿Cómo quieres que te llamemos? (opcional, solo se guarda en este dispositivo)"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} /></Field>
          <Field label="Duración habitual de las sesiones">
            <Segmented label="Duración" value={minutes} onChange={setMinutes} options={[10, 20, 30, 45].map((m) => ({ value: m as 10 | 20 | 30 | 45, label: `${m} min` }))} />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span>Entiendo que los resultados internos son orientativos y que no equivalen a una medición de inteligencia.</span>
          </label>
          <Button variant="primary" disabled={!ack} onClick={() => void finish()}>Empezar con la evaluación inicial</Button>
        </div>
      </Card>
    </div>
  );
}

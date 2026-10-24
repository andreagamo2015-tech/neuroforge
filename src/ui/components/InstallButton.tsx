import { useState } from 'react';
import { useInstall } from '../pwa';
import { Button, Modal } from './ui';

/** Botón «Instalar app». Se oculta si la app ya está instalada. */
export function InstallButton({ className }: { className?: string }) {
  const inst = useInstall();
  const [help, setHelp] = useState(false);
  if (inst.installed) return null;
  return (
    <>
      <Button variant="secondary" className={className} onClick={() => (inst.canPrompt ? void inst.install() : setHelp(true))}>
        ⤓ Instalar app
      </Button>
      <Modal open={help} title="Instalar NEUROFORGE X" onClose={() => setHelp(false)}>
        {inst.ios ? (
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>Abre esta página en <b>Safari</b>.</li>
            <li>Pulsa el botón <b>Compartir</b> (el cuadrado con una flecha hacia arriba).</li>
            <li>Elige <b>«Añadir a pantalla de inicio»</b> y confirma con <b>«Añadir»</b>.</li>
          </ol>
        ) : (
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>En <b>Chrome o Edge</b> (ordenador): pulsa el icono de instalar que aparece a la derecha de la barra de direcciones, o abre el menú <b>⋮ → «Instalar NEUROFORGE X»</b>.</li>
            <li>En <b>Android</b>: menú <b>⋮ → «Instalar aplicación»</b> o «Añadir a pantalla de inicio».</li>
            <li>Si no aparece la opción, recarga la página una vez y vuelve a intentarlo.</li>
          </ol>
        )}
        <p className="mt-3 text-xs text-muted">Una vez instalada se abre a pantalla completa con su propio icono y funciona sin conexión. Tus datos siguen guardados solo en este dispositivo.</p>
        <Button className="mt-4" variant="primary" onClick={() => setHelp(false)}>Entendido</Button>
      </Modal>
    </>
  );
}

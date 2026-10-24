import { useEffect, useState, type ReactNode } from 'react';
import { useStore } from '../data/store';
import { navigate, useHashRoute } from './hooks';
import { Button, cx } from './components/ui';
import { Dashboard } from './pages/Dashboard';
import { SessionPage } from './pages/SessionPage';
import { EvaluationPage } from './pages/EvaluationPage';
import { PracticePage } from './pages/PracticePage';
import { LearningPage } from './pages/LearningPage';
import { ProgressPage } from './pages/ProgressPage';
import { ProfilePage } from './pages/ProfilePage';
import { MetacognitionPage } from './pages/MetacognitionPage';
import { ProgramPage } from './pages/ProgramPage';
import { ExperimentsPage } from './pages/ExperimentsPage';
import { JournalPage } from './pages/JournalPage';
import { SettingsPage } from './pages/SettingsPage';
import { DevPage } from './pages/DevPage';
import { MethodologyPage } from './pages/MethodologyPage';
import { Onboarding } from './pages/Onboarding';
import { InstallButton } from './components/InstallButton';

const NAV: { path: string; label: string; icon: string; dev?: boolean }[] = [
  { path: '/', label: 'Inicio', icon: '◈' },
  { path: '/evaluacion', label: 'Evaluación inicial', icon: '◎' },
  { path: '/practica', label: 'Práctica libre', icon: '▶' },
  { path: '/aprendizaje', label: 'Aprendizaje', icon: '✎' },
  { path: '/progreso', label: 'Progreso', icon: '↗' },
  { path: '/perfil', label: 'Perfil cognitivo', icon: '⬡' },
  { path: '/metacognicion', label: 'Metacognición', icon: '◐' },
  { path: '/programa', label: 'Programa', icon: '▦' },
  { path: '/experimentos', label: 'Experimentos', icon: '⚗' },
  { path: '/diario', label: 'Diario', icon: '☰' },
  { path: '/metodologia', label: 'Metodología', icon: 'ⓘ' },
  { path: '/ajustes', label: 'Ajustes y datos', icon: '⚙' },
  { path: '/desarrollo', label: 'Modo desarrollo', icon: '⌘', dev: true },
];

export function App() {
  const { path, query } = useHashRoute();
  const store = useStore();
  const [menu, setMenu] = useState(false);
  const inSession = path === '/sesion';
  const focus = inSession && store.settings.focusMode;

  useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle('reduce-motion', store.settings.reducedMotion === 'sí');
    html.classList.toggle('force-motion', store.settings.reducedMotion === 'no');
  }, [store.settings.reducedMotion]);

  useEffect(() => {
    setMenu(false);
    window.scrollTo(0, 0);
  }, [path]);

  if (!store.ready) return <div className="flex min-h-screen items-center justify-center text-muted">Cargando datos locales…</div>;
  if (!store.data.settings?.onboardingDone) return <Shell focus><Onboarding /></Shell>;

  let page: ReactNode;
  switch (path) {
    case '/': page = <Dashboard />; break;
    case '/sesion': page = <SessionPage key={query.toString()} query={query} />; break;
    case '/evaluacion': page = <EvaluationPage />; break;
    case '/practica': page = <PracticePage />; break;
    case '/aprendizaje': page = <LearningPage />; break;
    case '/progreso': page = <ProgressPage />; break;
    case '/perfil': page = <ProfilePage />; break;
    case '/metacognicion': page = <MetacognitionPage />; break;
    case '/programa': page = <ProgramPage />; break;
    case '/experimentos': page = <ExperimentsPage />; break;
    case '/diario': page = <JournalPage />; break;
    case '/ajustes': page = <SettingsPage />; break;
    case '/desarrollo': page = <DevPage />; break;
    case '/metodologia': page = <MethodologyPage />; break;
    default: page = <div className="text-muted">Página no encontrada. <Button onClick={() => navigate('/')}>Inicio</Button></div>;
  }

  return (
    <Shell focus={focus}>
      {store.error && <div role="alert" className="mb-4 rounded-xl border border-bad/40 bg-bad/10 p-3 text-sm text-bad">{store.error}</div>}
      {!focus && (
        <>
          <header className="sticky top-0 z-30 -mx-4 mb-4 flex items-center justify-between border-b border-night-700 bg-night-900/90 px-4 py-3 backdrop-blur lg:hidden">
            <Logo />
            <Button variant="ghost" aria-expanded={menu} aria-controls="nav" onClick={() => setMenu((m) => !m)}>☰ Menú</Button>
          </header>
          <nav id="nav" aria-label="Principal" className={cx('fixed inset-y-0 left-0 z-40 w-64 overflow-y-auto border-r border-night-700 bg-night-950/95 p-4 backdrop-blur transition-transform lg:translate-x-0', menu ? 'translate-x-0' : '-translate-x-full')}>
            <div className="mb-6 hidden lg:block"><Logo /></div>
            <ul className="space-y-0.5">
              {NAV.filter((n) => !n.dev || store.settings.devMode).map((n) => (
                <li key={n.path}>
                  <a href={`#${n.path}`} aria-current={path === n.path ? 'page' : undefined} className={cx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition', path === n.path ? 'bg-night-700 text-cyan' : 'text-muted hover:bg-night-800 hover:text-ink')}>
                    <span aria-hidden className="w-4 text-center">{n.icon}</span>
                    {n.label}
                  </a>
                </li>
              ))}
            </ul>
            <InstallButton className="mt-6 w-full" />
            <p className="mt-4 text-[11px] leading-relaxed text-faint">Datos guardados solo en este navegador. Sin cuentas, sin servidores, sin rankings.</p>
          </nav>
          {menu && <div className="fixed inset-0 z-30 bg-night-950/60 lg:hidden" onClick={() => setMenu(false)} />}
        </>
      )}
      <main id="contenido" className={cx(!focus && 'lg:pl-64')}>{page}</main>
    </Shell>
  );
}

function Shell({ children, focus }: { children: ReactNode; focus?: boolean }) {
  return (
    <div className={cx('mx-auto min-h-screen px-4 pb-16', focus ? 'max-w-4xl pt-6' : 'max-w-7xl pt-4 lg:pt-8')}>
      <a href="#contenido" className="sr-only focus:not-sr-only">Saltar al contenido</a>
      {children}
    </div>
  );
}

function Logo() {
  return (
    <a href="#/" className="flex items-center gap-2" aria-label="NEUROFORGE X, inicio">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#0e1530" stroke="#1f2b5c" />
        <path d="M8 22 L16 8 L24 22 Z" fill="none" stroke="#22d3ee" strokeWidth="2.2" />
        <circle cx="16" cy="17" r="3" fill="#a78bfa" />
      </svg>
      <span className="text-sm font-bold tracking-[0.2em]">NEUROFORGE <span className="text-cyan">X</span></span>
    </a>
  );
}

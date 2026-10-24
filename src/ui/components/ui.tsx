import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({ variant = 'secondary', className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const styles: Record<Variant, string> = {
    primary: 'bg-linear-to-r from-cyan to-violet text-night-950 font-semibold hover:brightness-110 shadow-[0_0_20px_rgba(34,211,238,0.25)]',
    secondary: 'bg-night-700 text-ink border border-night-500 hover:border-cyan/60 hover:bg-night-600',
    ghost: 'text-muted hover:text-ink hover:bg-night-700/60',
    danger: 'bg-bad/15 text-bad border border-bad/40 hover:bg-bad/25',
  };
  return (
    <button
      {...rest}
      className={cx('inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm transition disabled:opacity-40 disabled:cursor-not-allowed', styles[variant], className)}
    >
      {children}
    </button>
  );
}

export function Card({ title, subtitle, actions, children, className }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <section className={cx('panel p-4 sm:p-5', className)}>
      {(title || actions) && (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone = 'ink' }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'ink' | 'cyan' | 'violet' | 'muted' }) {
  const color = { ink: 'text-ink', cyan: 'text-cyan', violet: 'text-violet', muted: 'text-muted' }[tone];
  return (
    <div className="rounded-xl border border-night-600 bg-night-850/60 p-3">
      <div className="text-[11px] uppercase tracking-wider text-faint">{label}</div>
      <div className={cx('mt-1 text-xl font-semibold tabular', color)}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'cyan' | 'violet' | 'amber' | 'ok' | 'bad' }) {
  const t = {
    muted: 'border-night-500 text-muted',
    cyan: 'border-cyan/40 text-cyan bg-cyan/10',
    violet: 'border-violet/40 text-violet bg-violet/10',
    amber: 'border-amber/40 text-amber bg-amber/10',
    ok: 'border-ok/40 text-ok bg-ok/10',
    bad: 'border-bad/40 text-bad bg-bad/10',
  }[tone];
  return <span className={cx('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium', t)}>{children}</span>;
}

/** Niveles de evidencia (regla de honestidad científica). */
export type EvidenceLevel = 'hipotesis' | 'observado' | 'preliminar' | 'replicado' | 'estandarizado' | 'insuficiente';
const EVIDENCE: Record<EvidenceLevel, { label: string; tone: 'muted' | 'cyan' | 'violet' | 'amber' | 'ok' | 'bad'; title: string }> = {
  hipotesis: { label: 'Hipótesis', tone: 'violet', title: 'Objetivo a poner a prueba, no un resultado.' },
  observado: { label: 'Resultado observado', tone: 'cyan', title: 'Lo que se ha medido en tus datos, sin generalizar.' },
  preliminar: { label: 'Evidencia preliminar', tone: 'amber', title: 'Patrón con pocos datos o sin control de factores de confusión.' },
  replicado: { label: 'Resultado replicado', tone: 'ok', title: 'Patrón observado de forma repetida en mediciones independientes.' },
  estandarizado: { label: 'Medición estandarizada', tone: 'ok', title: 'Evaluación externa con instrumento autorizado y administración válida.' },
  insuficiente: { label: 'Evidencia insuficiente', tone: 'muted', title: 'No hay datos suficientes para afirmar nada.' },
};
export function Evidence({ level }: { level: EvidenceLevel }) {
  const e = EVIDENCE[level];
  return (
    <span title={e.title}>
      <Badge tone={e.tone}>{e.label}</Badge>
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-night-500 p-6 text-center">
      <div className="text-sm font-medium text-muted">{title}</div>
      {children && <div className="mt-2 text-xs text-faint">{children}</div>}
    </div>
  );
}

export function ProgressBar({ value, tone = 'cyan', label }: { value: number; tone?: 'cyan' | 'violet'; label?: string }) {
  const v = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-night-700" role="progressbar" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cx('h-full rounded-full transition-all', tone === 'cyan' ? 'bg-cyan' : 'bg-violet')} style={{ width: `${v * 100}%` }} />
    </div>
  );
}

export function Modal({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-night-950/80 p-4" onClick={onClose}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="panel w-full max-w-lg p-5 fade-in" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-xl border border-night-600 bg-night-850 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx('rounded-lg px-3 py-1.5 text-sm transition', value === o.value ? 'bg-night-600 text-cyan' : 'text-muted hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-[11px] text-faint">{hint}</span>}
    </label>
  );
}

export const inputCls = 'w-full rounded-lg border border-night-500 bg-night-850 px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-cyan focus:outline-none';

export function PageTitle({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

import { useEffect, useRef, useState, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { X, AlertCircle, CheckCircle2, Info, ChevronDown, Loader2 } from 'lucide-react';

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'; size?: 'sm' | 'md' | 'lg'; loading?: boolean }) {
  const base = 'inline-flex items-center justify-center gap-2 font-bold rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none';
  const sizes = { sm: 'px-3 py-2 text-xs', md: 'px-4 py-2.5 text-sm', lg: 'px-5 py-3.5 text-base' };
  const variants = {
    primary: 'bg-primary-500 text-white hover:bg-primary-600',
    secondary: 'bg-secondary-400 text-white hover:bg-secondary-300',
    ghost: 'bg-transparent text-ink-100 hover:bg-ink-500/60',
    danger: 'bg-error-500 text-white hover:bg-error-600',
    outline: 'border border-ink-400/60 text-ink-50 hover:border-primary-400 hover:text-primary-700 bg-ink-600',
  };
  return (
    <button className={clsx(base, sizes[size], variants[variant], className)} disabled={loading || rest.disabled} {...rest}>
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'live' | 'success' | 'error' | 'warning'; className?: string }) {
  const tones = {
    neutral: 'bg-ink-500 text-ink-200',
    live: 'bg-error-500 text-white',
    success: 'bg-success-500/15 text-success-500',
    error: 'bg-error-500/15 text-error-500',
    warning: 'bg-secondary-500/20 text-secondary-400',
  };
  return <span className={clsx('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide', tones[tone], className)}>{children}</span>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('w-6 h-6 animate-spin text-primary-500', className)} />;
}

export function LoadingBlock({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 gap-2" role="status" aria-label="Loading">
      <Spinner />
      {label && <p className="text-xs text-ink-300">{label}</p>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton', className)} aria-hidden />;
}

export function MatchCardSkeleton() {
  return (
    <div className="bg-ink-700 rounded-xl p-3 space-y-3">
      <Skeleton className="h-3 w-40" />
      <div className="flex items-center justify-between">
        <div className="space-y-1.5 flex-1">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3.5 w-28" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-16" />
          <Skeleton className="h-10 w-16" />
          <Skeleton className="h-10 w-16" />
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center animate-fade-in">
      {icon && <div className="w-12 h-12 rounded-full bg-ink-600 flex items-center justify-center text-ink-300 mb-3">{icon}</div>}
      <p className="text-sm font-bold text-ink-100">{title}</p>
      {body && <p className="text-xs text-ink-300 mt-1 max-w-xs">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-2 bg-error-500/15 border border-error-500/30 text-error-500 rounded-lg px-3 py-2.5 mb-4 text-sm animate-shake" role="alert">
      <AlertCircle className="w-4 h-4 shrink-0" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="text-xs font-bold underline underline-offset-2">
          Retry
        </button>
      )}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: Array<{ id: T; label: string; badge?: number }>; value: T; onChange: (id: T) => void; className?: string }) {
  return (
    <div className={clsx('flex bg-ink-600 border-b border-ink-500/40 overflow-x-auto no-scrollbar', className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={clsx(
            'relative flex-1 min-w-max px-4 py-3 text-sm font-semibold transition-colors whitespace-nowrap',
            value === t.id ? 'text-primary-600' : 'text-ink-300 hover:text-ink-100'
          )}
        >
          {t.label}
          {typeof t.badge === 'number' && t.badge > 0 && (
            <span className="ml-1.5 inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-error-500 text-white text-[10px] font-bold px-1">{t.badge}</span>
          )}
          {value === t.id && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary-400 rounded-t-full" />}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: Array<{ id: T; label: string }>; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex bg-ink-700 border border-ink-500 rounded-xl p-1 gap-1" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={clsx('flex-1 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all', value === o.id ? 'bg-primary-500 text-white shadow-card' : 'text-ink-200 hover:text-ink-50')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Accordion({ title, subtitle, right, defaultOpen = false, children, forceOpen }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode; defaultOpen?: boolean; children: ReactNode; forceOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen || !!forceOpen);
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);
  return (
    <div className="border-b border-ink-500/30 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3 active:bg-ink-500/40 transition-colors"
      >
        <div className="min-w-0 text-left">
          <div className="text-sm font-bold text-ink-50 truncate">{title}</div>
          {subtitle && <div className="text-[11px] text-ink-300">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {right}
          <ChevronDown className={clsx('w-4 h-4 text-ink-300 transition-transform', open && 'rotate-180')} />
        </div>
      </button>
      {open && <div className="animate-fade-in">{children}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, maxWidth = 'max-w-md' }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; maxWidth?: string }) {
  useFocusTrap(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-sheet flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/70 animate-fade-in" onClick={onClose} />
      <div className={clsx('relative bg-ink-700 rounded-2xl w-full shadow-float animate-scale-in', maxWidth)}>
        {title && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-ink-500/40">
            <h2 className="text-base font-bold text-ink-50">{title}</h2>
            <IconButton onClick={onClose} aria-label="Close dialog"><X className="w-5 h-5" /></IconButton>
          </div>
        )}
        <div className="p-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}

export function BottomSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useFocusTrap(open, onClose);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-sheet flex flex-col justify-end lg:hidden" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/70 animate-fade-in" onClick={onClose} />
      <div className="relative bg-ink-700 rounded-t-2xl max-h-[88vh] flex flex-col animate-sheet-up shadow-float">
        <div className="pt-2 pb-1 flex justify-center shrink-0" aria-hidden>
          <div className="w-10 h-1 bg-ink-400 rounded-full" />
        </div>
        {title && (
          <div className="flex items-center justify-between px-4 pb-2 border-b border-ink-500/30 shrink-0">
            <h2 className="text-base font-bold text-ink-50">{title}</h2>
            <IconButton onClick={onClose} aria-label="Close sheet"><X className="w-5 h-5" /></IconButton>
          </div>
        )}
        <div className="overflow-y-auto flex-1 overscroll-contain">{children}</div>
      </div>
    </div>,
    document.body
  );
}

function useFocusTrap(active: boolean, onClose: () => void): void {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const focusables = ref.current?.parentElement?.querySelectorAll<HTMLElement>('button, input, select, a[href], [tabindex]:not([tabindex="-1"])');
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [active, onClose]);
}

export function IconButton({ children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={clsx('p-2 -m-1 text-ink-200 hover:text-ink-50 transition-colors', className)} {...rest}>
      {children}
    </button>
  );
}

export function StatCard({ label, value, sub, tone = 'default', icon, onClick }: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'primary' | 'success' | 'error' | 'warning';
  icon?: ReactNode;
  onClick?: () => void;
}) {
  const valueTone =
    tone === 'success' ? 'text-success-500'
    : tone === 'error' ? 'text-error-500'
    : tone === 'warning' ? 'text-secondary-400'
    : tone === 'primary' ? 'text-primary-600'
    : 'text-ink-50';
  return (
    <div
      className={clsx('bg-ink-700 rounded-xl p-3 border border-ink-500/30', onClick && 'cursor-pointer hover:border-primary-500/50 active:scale-[0.98] transition-all')}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      <div className="flex items-center gap-1.5 text-[11px] text-ink-300 uppercase tracking-wide">
        {icon}{label}
      </div>
      <div className={clsx('text-lg font-extrabold mt-0.5 tnum', valueTone)}>{value}</div>
      {sub && <div className="text-[11px] text-ink-300 mt-0.5">{sub}</div>}
    </div>
  );
}

export function InfoNote({ children, kind = 'info' }: { children: ReactNode; kind?: 'info' | 'success' }) {
  return (
    <div className={clsx('flex gap-2 rounded-lg px-3 py-2.5 text-xs', kind === 'info' ? 'bg-primary-500/10 text-primary-700 border border-primary-500/25' : 'bg-success-500/10 text-success-500 border border-success-500/25')}>
      {kind === 'info' ? <Info className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
      <span>{children}</span>
    </div>
  );
}

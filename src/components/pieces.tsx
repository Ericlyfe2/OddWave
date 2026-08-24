import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { Skeleton, MatchCardSkeleton } from './ui';

export function SectionHeader({ title, subtitle, icon, action }: { title: string; subtitle?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 pt-5 pb-2">
      <div className="flex items-center gap-1.5 min-w-0">
        {icon}
        <h2 className="section-title truncate">{title}</h2>
        {subtitle && <span className="text-[11px] text-ink-300 shrink-0">· {subtitle}</span>}
      </div>
      {action}
    </div>
  );
}

export function PageTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 pt-4 pb-2">
      <div>
        <h1 className="text-lg font-extrabold text-ink-50">{title}</h1>
        {subtitle && <p className="text-[11px] text-ink-300 mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function SportTabs({ sports, selected, onSelect }: { sports: Array<{ id: string; name: string }>; selected: string | null; onSelect: (id: string | null) => void }) {
  return (
    <div className="scroll-x gap-2 px-3 py-2.5 bg-ink-700 border-y border-ink-500/30" role="tablist" aria-label="Sports filter">
      <button
        role="tab"
        aria-selected={selected === null}
        onClick={() => onSelect(null)}
        className={clsx('shrink-0 rounded-full px-3.5 py-2 text-xs font-bold transition-all snap-start', selected === null ? 'bg-primary-500 text-white' : 'bg-ink-500 text-ink-200')}
      >
        All
      </button>
      {sports.map((s) => (
        <button
          key={s.id}
          role="tab"
          aria-selected={selected === s.id}
          onClick={() => onSelect(s.id)}
          className={clsx('shrink-0 rounded-full px-3.5 py-2 text-xs font-bold transition-all snap-start', selected === s.id ? 'bg-primary-500 text-white' : 'bg-ink-500 text-ink-200')}
        >
          {s.name}
        </button>
      ))}
    </div>
  );
}

export function LiveMinuteBadge({ minute, period }: { minute?: number; period?: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-error-500 animate-pulse-live" />
      <span className="text-[10px] font-bold text-error-500 tnum">{minute}&apos;</span>
      {period && <span className="text-[9px] text-ink-300">{period}</span>}
    </span>
  );
}

export function ListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-2 px-3 pt-3">
      {Array.from({ length: count }).map((_, i) => (
        <MatchCardSkeleton key={i} />
      ))}
      <Skeleton className="h-8 w-full mt-2" />
    </div>
  );
}

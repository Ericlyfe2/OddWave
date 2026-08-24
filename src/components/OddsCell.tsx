import { memo, useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import type { Outcome } from '@/lib/types';
import { oddsFmt } from '@/lib/format';

interface OddsCellProps {
  outcome: Outcome;
  selected: boolean;
  suspended?: boolean;
  onSelect: () => void;
  compact?: boolean;
  ariaLabel?: string;
}

export const OddsCell = memo(function OddsCell({ outcome, selected, suspended, onSelect, compact, ariaLabel }: OddsCellProps) {
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const prevOdds = useRef(outcome.odds);

  useEffect(() => {
    if (outcome.odds !== prevOdds.current) {
      setFlash(outcome.odds > prevOdds.current ? 'down' : 'up');
      prevOdds.current = outcome.odds;
      const t = setTimeout(() => setFlash(null), 1200);
      return () => clearTimeout(t);
    }
  }, [outcome.odds]);

  const disabled = suspended || outcome.suspended;

  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      aria-label={ariaLabel ?? `${outcome.label} at ${oddsFmt(outcome.odds)}`}
      aria-pressed={selected}
      className={clsx(
        'relative flex flex-col items-center justify-center rounded-lg border transition-all select-none min-h-[44px] active:scale-[0.97]',
        compact ? 'px-1.5 py-1 text-xs' : 'px-1.5 py-2 sm:px-2',
        selected
          ? 'bg-primary-500 border-primary-400 text-white shadow-card'
          : disabled
            ? 'bg-ink-600 border-ink-500/50 cursor-not-allowed'
            : 'bg-ink-500/80 border-ink-400/30 hover:border-primary-500/60 hover:bg-ink-500',
        flash === 'up' && !selected && 'animate-flash-up',
        flash === 'down' && !selected && 'animate-flash-down'
      )}
    >
      <span className={clsx('text-[10px] leading-none mb-1 truncate max-w-full', selected ? 'text-white/80' : 'text-ink-300')}>{outcome.label}</span>
      {disabled ? (
        <span className="flex gap-[3px]" aria-label="Suspended">
          <span className="w-3 h-[3px] bg-ink-300 rounded" />
          <span className="w-3 h-[3px] bg-ink-300 rounded" />
          <span className="w-3 h-[3px] bg-ink-300 rounded" />
        </span>
      ) : (
        <span className={clsx('font-extrabold leading-none tnum', compact ? 'text-xs' : 'text-sm', selected ? 'text-white' : 'text-ink-50')}>
          {oddsFmt(outcome.odds)}
          {!selected && flash && (
            <span
              aria-hidden
              className={clsx(
                'absolute top-0.5 right-1 text-[8px]',
                flash === 'up' ? 'text-success-500' : 'text-error-500'
              )}
            >
              {flash === 'up' ? '▲' : '▼'}
            </span>
          )}
        </span>
      )}
    </button>
  );
});

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Gamepad2, Loader2, Trophy, Target, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useWallet } from '@/store/wallet';
import { Button, EmptyState, ErrorBox, InfoNote } from '@/components/ui';
import { PageTitle } from '@/components/pieces';
import { money } from '@/lib/format';

type Corner = 'L' | 'C' | 'R';

const CORNERS: Array<{ id: Corner; label: string }> = [
  { id: 'L', label: 'Left' },
  { id: 'C', label: 'Center' },
  { id: 'R', label: 'Right' },
];

export function GamesScreen() {
  const navigate = useNavigate();
  const profile = useAuth((s) => s.profile);
  const balance = useWallet((s) => (profile ? s.balanceOf(profile.id) : 0));
  const [stake, setStake] = useState('5');
  const [pick, setPick] = useState<Corner | null>(null);
  const [phase, setPhase] = useState<'idle' | 'shooting' | 'result'>('idle');
  const [keeper] = useState<Corner>('L');
  const [won] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history] = useState<Array<{ pick: Corner; keeper: Corner; won: boolean }>>([]);

  const stakeNum = Number(stake) || 0;
  const payout = useMemo(() => Math.round(stakeNum * 2.4 * 100) / 100, [stakeNum]);

  if (!profile) {
    return (
      <EmptyState
        icon={<Gamepad2 className="w-6 h-6" />}
        title="Sign in to play"
        body="Penalty Kings uses your real wallet balance. Sign in to take your shot."
        action={<Button onClick={() => navigate('/auth')}>Login / Register</Button>}
      />
    );
  }

  const shoot = async (corner: Corner) => {
    setError(null);
    if (!pick && corner !== null) setPick(corner);
    if (stakeNum < 1) return setError('Minimum stake is 1 GH₵');
    if (stakeNum > balance) return setError(`Insufficient balance (${money(balance)})`);

    // Phase 1b moved all wallet debits/credits server-side (bets.place /
    // bets.settle / bets.cashOut); this mini-game has no server-side stake
    // endpoint of its own yet, so real-money play is disabled here rather
    // than silently skipping the stake deduction (which would let anyone
    // win real payouts for a free stake) or corrupting the ledger with a
    // client-only Txn the server never saw. See task-14-report.md.
    setError('Penalty Kings is temporarily unavailable while wallet features move to the server.');
    return;
  };

  const reset = () => {
    setPhase('idle');
    setPick(null);
  };

  return (
    <div className="pb-4">
      <PageTitle title="Games" subtitle="Instant play · real wallet" />

      <div className="mx-3 rounded-2xl overflow-hidden border border-ink-500/40 bg-gradient-to-b from-primary-50 to-ink-600">
        <div className="px-4 pt-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-extrabold text-ink-50">Penalty Kings</h2>
            <p className="text-[11px] text-ink-200">Beat the keeper · pays 2.40×</p>
          </div>
          <Trophy className="w-6 h-6 text-secondary-400" />
        </div>

        {/* Goal */}
        <div className="px-4 py-5">
          <div className="relative mx-auto max-w-[300px] aspect-[3/1.6] rounded-t-xl border-[6px] border-b-0 border-white/70 bg-ink-900/80 overflow-hidden">
            <div className="absolute inset-0 grid grid-cols-3">
              {(['L', 'C', 'R'] as Corner[]).map((c) => (
                <div key={c} className={clsx('border-r border-dashed border-white/15 last:border-r-0 relative', phase === 'result' && keeper === c && 'bg-secondary-500/30')}>
                  {phase === 'result' && keeper === c && (
                    <span className="absolute inset-x-0 bottom-2 text-center text-lg" aria-hidden>🧤</span>
                  )}
                  {phase === 'result' && pick === c && won && (
                    <span className="absolute inset-x-0 top-3 text-center text-2xl animate-scale-in" aria-hidden>⚽</span>
                  )}
                </div>
              ))}
            </div>
            {phase === 'shooting' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Loader2 className="w-7 h-7 animate-spin text-secondary-400" />
              </div>
            )}
          </div>

          {phase === 'result' && (
            <div className={clsx('mt-3 text-center font-extrabold animate-scale-in', won ? 'text-success-500' : 'text-error-500')}>
              {won ? `GOAL! +${money(payout)} GH₵` : `Saved! The keeper guessed ${keeper}`}
            </div>
          )}

          {/* Controls */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            {CORNERS.map((c) => (
              <button
                key={c.id}
                disabled={phase === 'shooting'}
                onClick={() => {
                  setPick(c.id);
                  void shoot(c.id);
                }}
                className={clsx(
                  'rounded-xl py-3 text-sm font-extrabold border transition-all active:scale-95 disabled:opacity-60',
                  pick === c.id ? 'bg-primary-500 border-primary-400 text-white' : 'bg-ink-600 border-ink-400/40 text-ink-50 hover:border-primary-500/60'
                )}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 mt-3">
            <input
              type="number"
              inputMode="decimal"
              min={1}
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              aria-label="Game stake"
              className="flex-1 min-w-0 bg-ink-600 border border-ink-400/40 focus:border-primary-500 rounded-xl px-3 py-2.5 text-sm font-bold text-ink-50 outline-none tnum transition-colors"
            />
            <span className="shrink-0 text-xs text-ink-300 whitespace-nowrap">to win</span>
            <span className="shrink-0 text-sm font-extrabold text-secondary-400 tnum whitespace-nowrap">{money(payout)}</span>
          </div>

          {phase === 'result' && (
            <Button variant="outline" size="sm" className="w-full mt-3" onClick={reset}>
              Play Again
            </Button>
          )}
          {error && <div className="mt-3"><ErrorBox message={error} /></div>}
        </div>
      </div>

      <div className="px-4 mt-4 space-y-2">
        <InfoNote>
          Balance {money(balance)} GH₵ — every shot debits instantly and wins credit automatically. Provably random per shot.
        </InfoNote>
        <div className="rounded-xl border border-ink-500/40 bg-ink-600 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Target className="w-3.5 h-3.5 text-primary-600" />
            <span className="text-[11px] font-bold text-ink-100 uppercase tracking-wide">Recent Shots</span>
          </div>
          {history.length === 0 ? (
            <p className="text-[11px] text-ink-300">No shots yet — pick a corner above.</p>
          ) : (
            <div className="space-y-1.5">
              {history.map((h, i) => (
                <div key={i} className="flex items-center justify-between text-[11px]">
                  <span className="text-ink-200">You: <b>{h.pick}</b> · Keeper: <b>{h.keeper}</b></span>
                  <span className={clsx('font-bold inline-flex items-center gap-1', h.won ? 'text-success-500' : 'text-error-500')}>
                    {h.won ? <Trophy className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                    {h.won ? 'Won' : 'Saved'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

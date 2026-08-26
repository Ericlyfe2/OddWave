import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { Trash2, X, Ticket, Zap, AlertTriangle, CheckCircle2, Loader2, Copy } from 'lucide-react';
import type { SlipItem } from '@/lib/types';
import { useSlip, slipTotals, type SlipMode } from '@/store/slip';
import { useAuth } from '@/store/auth';
import { useBets } from '@/store/bets';
import { useWallet } from '@/store/wallet';
import { useUI } from '@/store/ui';
import { useMatches } from '@/store/matches';
import { money, oddsFmt } from '@/lib/format';
import { Button, Segmented, EmptyState, ErrorBox } from './ui';
import { generateBookingCode, loadBookingCode } from '@/lib/booking';
import { validateSlipSelections } from '@/lib/betsMath';
import { liveEngine } from '@/lib/liveEngine';

function SlipSelectionRow({ item }: { item: SlipItem }) {
  const remove = useSlip((s) => s.remove);
  const liveMatch = useMatches((s) => s.byId[item.matchId]);
  const current = liveMatch?.markets.find((mk) => mk.key === item.marketKey)?.outcomes.find((o) => o.code === item.outcomeCode);
  const oddsNow = current?.odds ?? item.odds;
  const suspended = !current || current.suspended || liveMatch?.status === 'finished' || liveMatch?.status === 'cancelled' || liveMatch?.status === 'postponed';
  const oddsChanged = oddsNow !== item.oddsSnapshot;

  return (
    <div className={clsx('px-3 py-2.5 border-b border-ink-500/30', suspended && 'opacity-70')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-primary-700">{item.outcomeLabel}</span>
            <span className="text-[10px] text-ink-300 truncate">{item.marketName}</span>
          </div>
          <div className="text-[11px] text-ink-200 truncate">{item.matchName}</div>
        </div>
        <div className="text-right shrink-0">
          <div className={clsx('text-sm font-extrabold tnum', oddsChanged ? 'text-secondary-400' : 'text-ink-50')}>{oddsFmt(oddsNow)}</div>
          <button onClick={() => remove(item.outcomeId)} aria-label={`Remove ${item.outcomeLabel} on ${item.matchName}`} className="mt-1 text-ink-400 hover:text-error-500 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {oddsChanged && (
        <div className="mt-1.5 flex items-center gap-1.5 bg-secondary-500/15 border border-secondary-500/30 rounded px-2 py-1">
          <AlertTriangle className="w-3 h-3 text-secondary-400 shrink-0" />
          <span className="text-[10px] text-secondary-300">Odds changed from {oddsFmt(item.oddsSnapshot)} to {oddsFmt(oddsNow)}</span>
        </div>
      )}
      {suspended && (
        <div className="mt-1.5 flex items-center gap-1.5 bg-error-500/15 rounded px-2 py-1">
          <AlertTriangle className="w-3 h-3 text-error-500 shrink-0" />
          <span className="text-[10px] text-error-500">Selection unavailable — remove to continue</span>
        </div>
      )}
    </div>
  );
}

export function SlipPanel({ onPlaced }: { onPlaced?: () => void }) {
  const items = useSlip((s) => s.items);
  const mode = useSlip((s) => s.mode);
  const stake = useSlip((s) => s.stake);
  const systemPicks = useSlip((s) => s.systemPicks);
  const setMode = useSlip((s) => s.setMode);
  const setStake = useSlip((s) => s.setStake);
  const setSystemPicks = useSlip((s) => s.setSystemPicks);
  const clearSlip = useSlip((s) => s.clear);
  const acceptOdds = useSlip((s) => s.acceptOdds);
  const profile = useAuth((s) => s.profile);
  const balance = useWalletBalance();
  const bonusBalance = useAuth((s) => s.profile?.bonusBalance ?? 0);
  const placeBet = useBets((s) => s.placeBet);
  const placing = useBets((s) => s.placing);
  const toast = useUI((s) => s.toast);
  const navigate = useNavigate();

  const [error, setError] = useState<string | null>(null);
  const [placedInfo, setPlacedInfo] = useState<{ ids: string[]; code: string; potential: number } | null>(null);
  const [useBonus, setUseBonus] = useState(false);
  const [bookingInput, setBookingInput] = useState('');
  const [copiedCode, setCopiedCode] = useState('');

  const totals = useMemo(() => slipTotals(items, mode, Number(stake) || 0, systemPicks), [items, mode, stake, systemPicks]);
  const liveOdds = useLiveOdds(items);
  // Prices that moved in the punter's favour are taken automatically; only a drop
  // needs an explicit acceptance before the bet can be placed.
  const improvedCount = items.filter((i) => (liveOdds[i.outcomeId] ?? i.odds) > i.odds).length;
  const drifted = useMemo(
    () => items.filter((i) => (liveOdds[i.outcomeId] ?? i.odds) < i.odds),
    [items, liveOdds]
  );
  const hasChanges = drifted.length > 0;

  useEffect(() => {
    if (improvedCount > 0) acceptOdds(liveOdds);
  }, [improvedCount, liveOdds, acceptOdds]);
  const stakeNum = Number(stake) || 0;

  const modes: Array<{ id: SlipMode; label: string }> = [
    { id: 'single', label: 'Single' },
    ...(items.length >= 2 ? [{ id: 'multi' as const, label: 'Multi' }] : []),
    ...(items.length >= 3 ? [{ id: 'system' as const, label: `System (${systemPicks}/${items.length})` }] : []),
  ];

  // If selections drop below what the current mode needs (removed down to 1
  // while on Multi, say), fall back to Single rather than let the UI keep
  // offering a mode that validateSlipSelections would immediately reject.
  // Builder is excluded from `modes` on purpose — it's entered from the match
  // page's own toggle, not this segmented control — so it needs its own
  // fallback rule instead of the "must appear in modes" check below, which
  // would otherwise snap every Bet Builder combo back to Multi the instant
  // it's turned on, before the punter has picked a single market. Only bail
  // out of Builder here for a state that's actually invalid (legs from more
  // than one match) — leaving it empty is fine, that's just "just turned on,
  // nothing picked yet".
  useEffect(() => {
    if (mode === 'builder') {
      const matchIds = new Set(items.map((i) => i.matchId));
      if (matchIds.size > 1) setMode('multi');
      return;
    }
    if (!modes.some((m) => m.id === mode)) setMode('single');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, mode]);

  if (placedInfo) {
    return (
      <div className="p-4 animate-scale-in">
        <div className="flex flex-col items-center py-6 text-center">
          <CheckCircle2 className="w-14 h-14 text-success-500 mb-3" />
          <h2 className="text-lg font-extrabold text-ink-50">Bet Placed!</h2>
          <p className="text-sm text-ink-200 mt-1">Stake {money(stakeNum * (mode === 'single' ? items.length : 1))} · Potential {money(placedInfo.potential)}</p>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(placedInfo.code).catch(() => undefined);
              setCopiedCode(placedInfo.code);
              setTimeout(() => setCopiedCode(''), 1500);
            }}
            className="mt-4 flex items-center gap-2 bg-ink-500 border border-ink-400/40 rounded-lg px-4 py-2 font-mono font-bold text-primary-700 tracking-widest"
            aria-label="Copy booking code"
          >
            {placedInfo.code}
            {copiedCode ? <CheckCircle2 className="w-4 h-4 text-success-500" /> : <Copy className="w-4 h-4" />}
          </button>
          <p className="text-[11px] text-ink-300 mt-2">Save this booking code</p>
          <Button
            className="mt-5 w-full"
            onClick={() => {
              setPlacedInfo(null);
              clearSlip();
              onPlaced?.();
            }}
          >
            Done
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => {
              setPlacedInfo(null);
              clearSlip();
              onPlaced?.();
              navigate('/bets');
            }}
          >
            View My Bets
          </Button>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <EmptyState
          icon={<Ticket className="w-6 h-6" />}
          title="Your betslip is empty"
          body="Tap any odds to add a selection. Your slip follows you across the app."
        />
        <div className="mt-auto border-t border-ink-500/40 p-3">
          <p className="text-[10px] text-ink-300 mb-2">Got a booking code? Load it here.</p>
          <div className="flex gap-2">
            <input
              placeholder="Booking code"
              aria-label="Load booking code"
              value={bookingInput}
              onChange={(e) => setBookingInput(e.target.value.toUpperCase())}
              className="flex-1 bg-ink-600 border border-ink-400/40 rounded-lg px-3 py-2 text-xs font-mono text-ink-50 placeholder-ink-300 outline-none focus:border-primary-500"
            />
            <Button variant="outline" size="sm" onClick={handleLoadCode}>Load</Button>
          </div>
        </div>
      </div>
    );
  }

  const handlePlace = async () => {
    setError(null);
    if (!profile) {
      toast('info', 'Sign in to place your bet');
      navigate('/auth');
      return;
    }
    const unavailable = items.filter((i) => {
      const m = useMatches.getState().byId[i.matchId];
      return !m || ['finished', 'cancelled', 'postponed'].includes(m.status);
    });
    if (unavailable.length > 0) {
      setError('Some selections are no longer available. Remove them first.');
      return;
    }
    // Instant feedback for structural problems (too few legs for the mode,
    // duplicates, same-event conflicts) rather than waiting on the round trip
    // to placeBet, which re-checks the same things server-side regardless.
    const structural = validateSlipSelections(items, mode);
    if (!structural.ok) {
      setError(structural.error ?? 'This slip can’t be placed as-is');
      return;
    }
    if (stakeNum <= 0) {
      setError('Enter a stake amount');
      return;
    }
    if (drifted.length > 0) {
      setError('Odds moved since you selected. Accept the new odds to continue.');
      return;
    }

    const legs = items.map((i) => {
      const match = liveEngine.get(i.matchId);
      const market = match?.markets.find((mk) => mk.key === i.marketKey);
      const outcome = market?.outcomes.find((o) => o.code === i.outcomeCode);
      return {
        matchId: i.matchId,
        matchName: i.matchName,
        leagueName: i.leagueName,
        marketKey: i.marketKey,
        marketName: i.marketName,
        outcomeCode: i.outcomeCode,
        outcomeLabel: i.outcomeLabel,
        odds: i.odds,
        kickoff: i.kickoff,
        status: 'open' as const,
        matchStatus: match?.status ?? 'cancelled',
        marketSuspended: market?.suspended ?? true,
        outcomeSuspended: outcome?.suspended ?? true,
      };
    });

    const result = await placeBet({
      type: mode,
      stakePerCombo: stakeNum,
      legs,
      systemPicks,
      useBonus: useBonus ? Math.min(bonusBalance, mode === 'single' ? stakeNum : totals.totalStake) : 0,
    });

    if (!result.ok) {
      setError(result.error ?? 'Could not place bet');
      return;
    }
    const potential = mode === 'single' ? Math.max(...legs.map((l) => l.odds)) * stakeNum : totals.potential;
    setPlacedInfo({ ids: result.betIds ?? [], code: useBets.getState().bets.find((b) => b.id === result.betIds?.[0])?.bookingCode ?? '', potential });
    toast('success', 'Bet placed successfully');
  };

  const handleGenerateCode = () => {
    const res = generateBookingCode(items);
    if (res) {
      navigator.clipboard?.writeText(res.code).catch(() => undefined);
      setCopiedCode(res.code);
      toast('success', `Booking code ${res.code} copied`);
      setTimeout(() => setCopiedCode(''), 2500);
    }
  };

  function handleLoadCode() {
    const res = loadBookingCode(bookingInput);
    if (!res.ok || !res.payload) {
      toast('error', res.error ?? 'Invalid booking code');
      return;
    }
    toast('success', 'Booking code loaded into slip');
    setBookingInput('');
    window.dispatchEvent(new CustomEvent('oddwave:load_booking', { detail: res.payload }));
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 pt-3">
        <Segmented options={modes} value={mode} onChange={(m) => { setMode(m); }} />
        <button onClick={clearSlip} className="ml-2 p-2 text-ink-300 hover:text-error-500 transition-colors" aria-label="Clear betslip">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto mt-2 overscroll-contain">
        {items.map((item) => (
          <SlipSelectionRow key={item.outcomeId} item={item} />
        ))}
        {mode === 'system' && (
          <div className="px-3 py-3 border-b border-ink-500/30">
            <label className="text-xs text-ink-200 block mb-2" htmlFor="sys-picks">Combinations per ticket</label>
            <input
              id="sys-picks"
              type="number"
              min={2}
              max={items.length - 1}
              value={systemPicks}
              onChange={(e) => setSystemPicks(Number(e.target.value))}
              className="w-full bg-ink-600 border border-ink-400/40 rounded-lg px-3 py-2 text-sm text-ink-50 tnum"
            />
            <p className="text-[10px] text-ink-300 mt-1">{totals.comboCount} combinations × {money(stakeNum)} per combo</p>
          </div>
        )}
        {hasChanges && (
          <div className="mx-3 my-2 flex items-center justify-between bg-secondary-500/15 border border-secondary-500/30 rounded-lg px-2.5 py-2">
            <span className="text-[11px] text-secondary-300">
              {drifted.length === 1 ? 'One selection was re-priced lower' : `${drifted.length} selections were re-priced lower`}
            </span>
            <button onClick={() => acceptOdds(liveOdds)} className="text-[11px] font-bold text-secondary-400 underline underline-offset-2">Accept new odds</button>
          </div>
        )}
      </div>

      <div className="border-t border-ink-500/40 p-3 space-y-3 bg-ink-600/50">
        <div className="grid grid-cols-4 gap-1.5">
          {[5, 10, 25, 50].map((q) => (
            <button key={q} onClick={() => setStake(String(q))} className="bg-ink-500 hover:bg-ink-400/60 rounded-lg py-1.5 text-xs font-bold text-ink-100 active:scale-95 transition-all">
              {q}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 bg-ink-600 border border-ink-400/40 focus-within:border-primary-500 rounded-xl px-3 py-2.5">
          <span className="text-xs text-ink-300 font-bold shrink-0">GH₵</span>
          <input
            type="number"
            inputMode="decimal"
            placeholder="Stake"
            aria-label="Stake amount"
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            className="flex-1 bg-transparent text-base font-extrabold text-ink-50 placeholder-ink-300 outline-none tnum"
          />
          {mode === 'multi' && items.length >= 5 && totals.bonusPct > 0 && (
            <span className="text-[10px] font-bold text-secondary-400 bg-secondary-500/15 rounded px-1.5 py-0.5 whitespace-nowrap">+{totals.bonusPct}% boost</span>
          )}
        </div>

        {bonusBalance > 0 && (
          <button onClick={() => setUseBonus(!useBonus)} className={clsx('flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition-colors', useBonus ? 'border-secondary-500/60 bg-secondary-500/15' : 'border-ink-400/40 bg-ink-600')}>
            <span className="text-xs text-ink-100"><Zap className="w-3.5 h-3.5 inline mr-1.5 text-secondary-400" />Use bonus balance ({money(bonusBalance)})</span>
            <span className={clsx('w-8 h-4.5 h-[18px] rounded-full relative transition-colors', useBonus ? 'bg-secondary-500' : 'bg-ink-400')}>
              <span className={clsx('absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full transition-all', useBonus ? 'left-[18px]' : 'left-0.5')} />
            </span>
          </button>
        )}

        {error && <ErrorBox message={error} />}

        <div className="flex items-end justify-between text-xs">
          <div className="space-y-0.5">
            <div className="text-ink-300">Total Stake <span className="font-bold text-ink-100 tnum">{money(totals.totalStake)}</span></div>
            {mode === 'single' && items.length > 1 ? (
              <div className="text-ink-300">Separate Bets <span className="font-bold text-ink-100 tnum">{items.length}</span></div>
            ) : (
              <div className="text-ink-300">Total Odds <span className="font-bold text-ink-100 tnum">{oddsFmt(totals.totalOdds)}</span></div>
            )}
          </div>
          <div className="text-right">
            <div className="text-[11px] text-ink-300 uppercase">Potential Win</div>
            <div className="text-lg font-extrabold text-primary-600 tnum">{money(totals.potential)}</div>
          </div>
        </div>

        <Button size="lg" className="w-full" loading={placing} onClick={handlePlace}>
          {placing ? 'Placing…' : `Place Bet${mode === 'single' && items.length > 1 ? ` (${items.length})` : ''}`}
        </Button>

        <div className="flex gap-2">
          <input
            placeholder="Booking code"
            aria-label="Load booking code"
            value={bookingInput}
            onChange={(e) => setBookingInput(e.target.value.toUpperCase())}
            className="flex-1 bg-ink-600 border border-ink-400/40 rounded-lg px-3 py-2 text-xs font-mono text-ink-50 placeholder-ink-300 outline-none focus:border-primary-500"
          />
          <Button variant="outline" size="sm" onClick={handleLoadCode}>Load</Button>
          <Button variant="outline" size="sm" onClick={handleGenerateCode}>Save</Button>
        </div>

        {!profile && <p className="text-center text-[10px] text-ink-300">You will be asked to sign in before placing</p>}
        {profile && balance < totals.totalStake && (
          <button onClick={() => navigate('/account/deposit')} className="w-full text-center text-[11px] font-bold text-secondary-400 underline underline-offset-2">
            Insufficient balance ({money(balance)}) — deposit now
          </button>
        )}
      </div>
    </div>
  );
}

function useWalletBalance(): number {
  const profile = useAuth((s) => s.profile);
  return useWallet((s) => (profile ? s.balanceOf(profile.id) : 0));
}

/** Current live price for every selection in the slip, keyed by outcome id. */
function useLiveOdds(items: SlipItem[]): Record<string, number> {
  const byId = useMatches((s) => s.byId);
  return useMemo(() => {
    const out: Record<string, number> = {};
    for (const i of items) {
      const outcome = byId[i.matchId]?.markets
        .find((mk) => mk.key === i.marketKey)
        ?.outcomes.find((o) => o.code === i.outcomeCode);
      if (outcome) out[i.outcomeId] = outcome.odds;
    }
    return out;
  }, [byId, items]);
}

export function BetslipSheet() {
  const open = useUI((s) => s.betslipOpen);
  const setOpen = useUI((s) => s.setBetslipOpen);
  const count = useSlip((s) => s.items.length);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-sheet flex flex-col justify-end lg:hidden" role="dialog" aria-modal="true" aria-label="Betslip">
      <div className="absolute inset-0 bg-black/70 animate-fade-in" onClick={() => setOpen(false)} />
      <div className="relative bg-ink-700 rounded-t-2xl max-h-[92vh] flex flex-col animate-sheet-up shadow-float">
        <div className="pt-2 pb-1 flex justify-center shrink-0" aria-hidden><div className="w-10 h-1 bg-ink-400 rounded-full" /></div>
        <div className="flex items-center justify-between px-4 pb-2 border-b border-ink-500/30 shrink-0">
          <h2 className="text-base font-bold text-ink-50">Betslip ({count})</h2>
          <button onClick={() => setOpen(false)} aria-label="Close betslip" className="p-1 text-ink-200"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto flex-1 overscroll-contain">
          <SlipPanel onPlaced={() => setOpen(false)} />
        </div>
      </div>
    </div>
  );
}

export function DesktopBetslip() {
  const count = useSlip((s) => s.items.length);
  const placing = useBets((s) => s.placing);
  return (
    <aside className="hidden lg:flex fixed right-0 top-14 bottom-0 w-[340px] bg-ink-700 border-l border-ink-500/40 z-header flex-col" aria-label="Betslip panel">
      <div className="flex items-center justify-between px-4 h-12 border-b border-ink-500/40 shrink-0">
        <h2 className="text-sm font-bold text-ink-50 flex items-center gap-2">
          <Ticket className="w-4 h-4 text-primary-600" />
          Betslip
          {count > 0 && <span className="bg-primary-500 text-white text-[10px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 font-extrabold">{count}</span>}
        </h2>
        {placing && <Loader2 className="w-4 h-4 animate-spin text-primary-600" />}
      </div>
      <div className="flex-1 overflow-hidden">
        <SlipPanel />
      </div>
    </aside>
  );
}

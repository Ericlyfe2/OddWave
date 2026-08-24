import { useWallet } from '@/store/wallet';
import { useAuth } from '@/store/auth';
import { useNotifs } from '@/store/notifs';
import { usePromotions } from '@/store/promotions';
import { round2 } from './format';

/**
 * Campaign content (copy, value, terms, active status) is fully admin-editable
 * via the promotions store — see src/store/promotions.ts. What stays
 * kind-based here is the *eligibility rule*: "welcome" bonuses only pay out on
 * a genuinely first bet, "freebet" requires a qualifying stake, etc. Those are
 * business mechanics, not campaign content, so a new "welcome"-kind promo an
 * admin creates automatically gets the same first-bet-only rule for free.
 */
export function claimPromotion(promoId: string): { ok: boolean; error?: string; message?: string } {
  const profile = useAuth.getState().profile;
  if (!profile) return { ok: false, error: 'Sign in to claim promotions' };
  const promo = usePromotions.getState().getById(promoId);
  if (!promo || !promo.active) return { ok: false, error: 'Promotion not found' };
  if (profile.claimedPromos.includes(promoId)) return { ok: false, error: 'You have already claimed this promotion' };

  const wallet = useWallet.getState();

  if (promo.kind === 'welcome') {
    const hasBets = Object.keys(useWallet.getState().txns[profile.id] || []).length > 0;
    if (hasBets) return { ok: false, error: 'Welcome offer is for your first bet' };
    wallet.credit(profile.id, 0, 'bonus', `WELCOME-${promo.value}`);
    useAuth.getState().updateProfile({ bonusBalance: round2(profile.bonusBalance + promo.value), claimedPromos: [...profile.claimedPromos, promoId] });
    useNotifs.getState().push({ userId: profile.id, kind: 'promo', title: 'Welcome boost claimed', body: `${promo.value} bonus stake added to your account` });
    return { ok: true, message: `${promo.value} bonus credited` };
  }

  if (promo.kind === 'freebet') {
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const qualifying = (wallet.userTxns(profile.id) || []).some(
      (t) => t.type === 'stake' && t.status === 'success' && Math.abs(t.amount) >= 50 && t.createdAt >= todayStart
    );
    if (!qualifying) return { ok: false, error: 'Place a 50+ multi stake with 3+ legs first' };
    wallet.credit(profile.id, 0, 'bonus', `FREEBET-${promo.id}`);
    useAuth.getState().updateProfile({ bonusBalance: round2(profile.bonusBalance + promo.value), claimedPromos: [...profile.claimedPromos, promoId] });
    useNotifs.getState().push({ userId: profile.id, kind: 'promo', title: 'Free bet claimed', body: `${promo.value} free bet added` });
    return { ok: true, message: `${promo.value} free bet credited` };
  }

  if (promo.kind === 'boost') {
    return { ok: true, message: 'Acca boost is applied automatically to eligible multis' };
  }

  if (promo.kind === 'cashback') {
    useAuth.getState().updateProfile({ claimedPromos: [...profile.claimedPromos, promoId] });
    return { ok: true, message: 'Cashback opted in — check back on Monday' };
  }

  return { ok: false, error: 'Promotion unavailable' };
}

import { useAuth } from '@/store/auth';
import { usePromotions } from '@/store/promotions';

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

  // welcome/freebet/cashback all persist bonusBalance and/or claimedPromos —
  // the backend's updateProfile deliberately does not accept either field
  // (see server/src/routers/auth.ts: a self-service endpoint that did would
  // let any signed-in user mint themselves an arbitrary bonus balance), and
  // there's no server-side promotions/claims table yet to persist a claim
  // against instead. Crediting the wallet locally anyway would show a
  // "claimed" state that silently reverts on the next profile refresh — an
  // honest "not yet" is better than a bonus that quietly disappears.
  if (promo.kind === 'welcome' || promo.kind === 'freebet' || promo.kind === 'cashback') {
    return { ok: false, error: 'Promotions are not available yet in this release — check back soon' };
  }

  if (promo.kind === 'boost') {
    return { ok: true, message: 'Acca boost is applied automatically to eligible multis' };
  }

  return { ok: false, error: 'Promotion unavailable' };
}

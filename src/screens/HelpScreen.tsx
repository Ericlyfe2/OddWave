import { useState } from 'react';
import { ChevronDown, MailQuestion, MessageCircle, Clock } from 'lucide-react';
import { PageTitle } from '@/components/pieces';
import { InfoNote } from '@/components/ui';
import { useDocumentMeta } from '@/lib/seo';

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'How do I place a bet?',
    a: 'Tap any odds cell to add it to your betslip. Open the slip, enter your stake and tap Place Bet. Your balance updates instantly.',
  },
  {
    q: 'What is a booking code?',
    a: 'A booking code saves your selections so you can share them or place the same bet later. Generate one from the betslip (Save) or load an existing one with Load.',
  },
  {
    q: 'How does Cash Out work?',
    a: 'Open bets show a live cashout value based on current match state and odds. Partial cashouts (25% / 50%) keep part of the stake running.',
  },
  {
    q: 'How long do withdrawals take?',
    a: 'Withdrawal requests are held as locked funds and reviewed by the payments team. In this demo an auto-approver runs after 2 minutes if no admin acts sooner.',
  },
  {
    q: 'Is this real money?',
    a: `No. OddWave demo mode simulates odds, scores and payments locally on your device. No real money is ever involved.`,
  },
  {
    q: 'What are system bets?',
    a: 'System bets split your selections into combinations. E.g. a 3/5 system creates 10 three-leg combos; you still win a payout even if one or two legs lose.',
  },
  {
    q: 'How do limits work?',
    a: 'Deposit and loss limits block actions once thresholds are reached — see Responsible Gaming. Self-exclusion disables betting entirely.',
  },
  {
    q: 'Why did my odds change in the slip?',
    a: 'Live prices move constantly. If odds drift after you select, the slip flags the change — accept it to proceed at the new price.',
  },
];

export function HelpScreen() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  useDocumentMeta('Help Centre', 'Answers to common OddWave questions — betting, cash out, withdrawals, and responsible gaming — plus how to reach support.');

  return (
    <div className="pb-4">
      <PageTitle title="Help Center" />
      <div className="mx-3 flex items-center gap-2 rounded-xl border border-success-500/30 bg-success-500/10 px-3 py-2.5">
        <Clock className="w-4 h-4 text-success-500 shrink-0" />
        <p className="text-[11px] text-ink-100">
          <span className="font-bold">Our promise:</span> support replies within 5 minutes, and withdrawals are processed within 2 minutes.
        </p>
      </div>
      <div className="px-3 space-y-2">
        {FAQS.map((f, i) => (
          <div key={i} className="rounded-xl border border-ink-500/40 bg-ink-600 overflow-hidden">
            <button
              onClick={() => setOpenIdx(openIdx === i ? null : i)}
              aria-expanded={openIdx === i}
              className="w-full flex items-center justify-between px-3 py-3 text-left"
            >
              <span className="text-sm font-bold text-ink-50 pr-2">{f.q}</span>
              <ChevronDown className={`w-4 h-4 text-ink-300 shrink-0 transition-transform ${openIdx === i ? 'rotate-180' : ''}`} />
            </button>
            {openIdx === i && <p className="px-3 pb-3 text-xs text-ink-200 leading-relaxed animate-fade-in">{f.a}</p>}
          </div>
        ))}

        <div className="rounded-xl border border-primary-500/40 bg-primary-500/10 p-3 mt-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <MailQuestion className="w-4 h-4 text-primary-600" />
            <span className="text-xs font-bold text-ink-100 uppercase tracking-wide">Contact Support</span>
          </div>
          <p className="text-[11px] text-ink-200">Demo environment — no live support channel is connected.</p>
          <button
            onClick={() => alert('Support chat would open here in production.')}
            className="flex items-center gap-1.5 bg-primary-500 text-white text-xs font-bold rounded-lg px-3 py-2 active:scale-95 transition-transform"
          >
            <MessageCircle className="w-3.5 h-3.5" /> Open Chat (demo)
          </button>
        </div>

        <InfoNote>18+ only. Play responsibly — set deposit and loss limits in Responsible Gaming.</InfoNote>
      </div>
    </div>
  );
}

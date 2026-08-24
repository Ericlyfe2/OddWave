import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  Home, Trophy, Radio, User, Search, Wallet, Menu, X, Plus,
  Star, CalendarDays, History, Ticket, Settings, LogOut, ShieldCheck,
  Megaphone, Bell, Gamepad2, LayoutDashboard, Zap, Globe2,
} from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useWallet } from '@/store/wallet';
import { useUI } from '@/store/ui';
import { useSlip } from '@/store/slip';
import { useNotifs } from '@/store/notifs';
import { slipTotals } from '@/store/slip';
import { money } from '@/lib/format';

export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <span className="flex items-center gap-1.5 min-w-0 select-none" aria-label="OddWave">
      <svg width={size} height={size} viewBox="0 0 128 128" aria-hidden className="shrink-0">
        <rect x="8" y="8" width="112" height="112" rx="26" fill="currentColor" opacity="0.16" />
        <path d="M20 82 C36 52 48 52 64 74 C80 96 92 96 108 66" fill="none" stroke="currentColor" strokeWidth="11" strokeLinecap="round" />
        <path d="M20 56 C36 26 48 26 64 48 C80 70 92 70 108 40" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" opacity="0.55" />
      </svg>
      <span className="font-extrabold tracking-tight truncate" style={{ fontSize: size * 0.62 }}>
        Odd<span className="opacity-80">Wave</span>
      </span>
    </span>
  );
}

const FOOTER_LINKS: Array<{ heading: string; links: Array<{ to: string; label: string }> }> = [
  {
    heading: 'Sports',
    links: [
      { to: '/sports', label: 'All Sports' },
      { to: '/live', label: 'Live Betting' },
      { to: '/countries', label: 'Countries' },
      { to: '/today', label: "Today's Matches" },
      { to: '/virtuals', label: 'Virtuals & Games' },
    ],
  },
  {
    heading: 'Account',
    links: [
      { to: '/promotions', label: 'Promotions' },
      { to: '/account/deposit', label: 'Deposit' },
      { to: '/bets', label: 'My Bets' },
      { to: '/favorites', label: 'Favorites' },
    ],
  },
  {
    heading: 'Support',
    links: [
      { to: '/help', label: 'Help Centre' },
      { to: '/responsible-gaming', label: 'Responsible Gaming' },
      { to: '/results', label: 'Results' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="hidden lg:block border-t border-ink-500/40 bg-ink-800/60 mt-8">
      <div className="max-w-[1100px] mx-auto px-6 py-8 grid grid-cols-4 gap-8">
        <div>
          <BrandMark size={26} />
          <p className="text-[11px] text-ink-300 mt-3 max-w-[220px]">
            Licensed sports betting and live wagering. Bet responsibly — 18+.
          </p>
          <p className="text-[11px] text-ink-400 mt-3">
            Withdrawals processed in under 2 minutes.
          </p>
        </div>
        {FOOTER_LINKS.map((group) => (
          <div key={group.heading}>
            <div className="text-[11px] font-bold uppercase tracking-wide text-ink-300 mb-2.5">{group.heading}</div>
            <ul className="space-y-2">
              {group.links.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="text-[12px] text-ink-200 hover:text-primary-600 transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-ink-500/30 px-6 py-3 text-[10px] text-ink-400">
        © {new Date().getFullYear()} OddWave. All rights reserved.
      </div>
    </footer>
  );
}

function useScrollDirection(): 'up' | 'down' {
  const [dir, setDir] = useState<'up' | 'down'>('up');
  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setDir(y > lastY && y > 80 ? 'down' : 'up');
      lastY = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return dir;
}

export function Header() {
  const navigate = useNavigate();
  const profile = useAuth((s) => s.profile);
  const balance = useWallet((s) => (profile ? s.balanceOf(profile.id) : 0));
  const locked = useWallet((s) => (profile ? s.lockedOf(profile.id) : 0));
  const unread = useNotifs((s) => (profile ? s.unreadFor(profile.id) : 0));
  const dir = useScrollDirection();

  return (
    <header
      className={clsx(
        'sticky top-0 z-header bg-primary-600 text-white shadow-card transition-transform duration-200',
        dir === 'down' && '-translate-y-full'
      )}
    >
      <div className="pt-safe" />
      <div className="max-w-[1440px] mx-auto flex items-center gap-1.5 sm:gap-3 px-3 h-14">
        <button
          className="lg:hidden shrink-0 p-2 -ml-2 text-white/90 hover:text-white transition-colors"
          onClick={() => useUI.getState().setSideNavOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <Link to="/" aria-label="OddWave home" className="min-w-0">
          <BrandMark />
        </Link>

        <nav className="hidden lg:flex items-center gap-1 ml-4" aria-label="Primary">
          <HeaderNavLink to="/sports">Sports</HeaderNavLink>
          <HeaderNavLink to="/live"><Radio className="w-3.5 h-3.5 mr-1 inline" />Live</HeaderNavLink>
          <HeaderNavLink to="/promotions"><Megaphone className="w-3.5 h-3.5 mr-1 inline" />Promos</HeaderNavLink>
          <HeaderNavLink to="/virtuals"><Gamepad2 className="w-3.5 h-3.5 mr-1 inline" />Virtuals</HeaderNavLink>
          <HeaderNavLink to="/results"><History className="w-3.5 h-3.5 mr-1 inline" />Results</HeaderNavLink>
        </nav>

        <div className="flex-1" />

        <button
          onClick={() => navigate('/search')}
          className="shrink-0 p-2 text-white/90 hover:text-white transition-colors"
          aria-label="Search"
        >
          <Search className="w-5 h-5" />
        </button>

        {profile ? (
          <>
            {unread > 0 && (
              <button
                onClick={() => navigate('/notifications')}
                className="relative shrink-0 p-2 text-white/90 hover:text-white transition-colors"
                aria-label={`${unread} unread notifications`}
              >
                <Bell className="w-5 h-5" />
                <span className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-secondary-500 text-ink-50 text-[9px] font-bold flex items-center justify-center">{unread}</span>
              </button>
            )}
            <Link
              to="/account/deposit"
              className="hidden sm:flex items-center gap-2 bg-white/15 border border-white/25 rounded-lg pl-2.5 pr-1 py-1 hover:bg-white/25 transition-colors"
            >
              <div className="text-right leading-none">
                <div className="text-[10px] text-white/75">{locked > 0 ? `${money(locked)} locked` : 'Balance'}</div>
                <div className="text-sm font-extrabold text-white tnum">{money(balance)}</div>
              </div>
              <span className="bg-white rounded-md px-2 py-1.5" aria-hidden><Plus className="w-3.5 h-3.5 text-primary-600" /></span>
            </Link>
            <Link to="/account" className="w-8 h-8 shrink-0 rounded-full bg-white/20 ring-1 ring-white/40 flex items-center justify-center text-white text-xs font-extrabold" aria-label="Account">
              {profile.fullName.slice(0, 2).toUpperCase()}
            </Link>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <Link to="/auth" className="text-xs font-bold text-white/90 px-3 py-2 hover:text-white transition-colors">Login</Link>
            <Link to="/auth?mode=signup" className="bg-white hover:bg-primary-50 text-primary-700 text-xs font-bold px-3.5 py-2 rounded-lg transition-colors">Join</Link>
          </div>
        )}
      </div>
    </header>
  );
}

function HeaderNavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx('px-3 py-2 rounded-lg text-sm font-semibold transition-colors', isActive ? 'bg-white/20 text-white' : 'text-white/80 hover:text-white hover:bg-white/10')
      }
    >
      {children}
    </NavLink>
  );
}

const BOTTOM_ITEMS = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/sports', label: 'Sports', icon: Trophy },
  { to: '/live', label: 'Live', icon: Radio },
  { to: '/bets', label: 'My Bets', icon: Ticket },
  { to: '/account', label: 'Account', icon: User },
] as const;

export function BottomNav() {
  const profile = useAuth((s) => s.profile);
  const betsCount = useSlip((s) => s.items.length);

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-nav bg-ink-600/97 backdrop-blur border-t border-ink-500 shadow-[0_-1px_3px_rgba(13,27,42,0.06)] pb-safe"
      aria-label="Bottom navigation"
    >
      <div className="grid grid-cols-5 h-16">
        {BOTTOM_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              clsx('flex flex-col items-center justify-center gap-0.5 relative transition-colors', isActive ? 'text-primary-600' : 'text-ink-300')
            }
          >
            {({ isActive }) => (
              <>
                {label === 'My Bets' && betsCount > 0 && (
                  <span className="absolute top-1.5 right-[22%] min-w-[16px] h-4 rounded-full bg-primary-500 text-white text-[10px] font-extrabold flex items-center justify-center px-1 animate-scale-in">
                    {betsCount}
                  </span>
                )}
                {label === 'Account' && !profile && (
                  <span className="absolute top-1.5 right-[30%] w-2 h-2 rounded-full bg-error-500" aria-label="Sign in required" />
                )}
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-[10px] font-bold">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

const SIDE_ITEMS = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/sports', label: 'Sports A-Z', icon: Trophy },
  { to: '/countries', label: 'Countries', icon: Globe2 },
  { to: '/live', label: 'Live Betting', icon: Radio },
  { to: '/today', label: 'Today', icon: CalendarDays },
  { to: '/favorites', label: 'Favorites', icon: Star },
  { to: '/bets', label: 'My Bets', icon: Ticket },
  { to: '/booking', label: 'Booking Code', icon: Zap },
  { to: '/promotions', label: 'Promotions', icon: Megaphone },
  { to: '/virtuals', label: 'Virtuals & Games', icon: Gamepad2 },
  { to: '/results', label: 'Results', icon: History },
  { to: '/notifications', label: 'Notifications', icon: Bell },
];

export function SideNavContent({ onNavigate }: { onNavigate?: () => void }) {
  const profile = useAuth((s) => s.profile);
  const balance = useWallet((s) => (profile ? s.balanceOf(profile.id) : 0));
  const signOut = useAuth((s) => s.signOut);
  const navigate = useNavigate();
  const admin = profile?.role === 'admin';

  return (
    <div className="flex flex-col h-full">
      {profile ? (
        <div className="p-4 border-b border-ink-500/40">
          <div className="flex items-center gap-3 mb-3">
            <span className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white text-sm font-extrabold">
              {profile.fullName.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-bold text-ink-50 truncate">{profile.fullName}</div>
              <div className="text-xs text-ink-300 tnum">{money(balance)} GH₵</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { navigate('/account/deposit'); onNavigate?.(); }} className="bg-primary-500 text-white text-xs font-bold py-2 rounded-lg">Deposit</button>
            <button onClick={() => { navigate('/account/withdraw'); onNavigate?.(); }} className="border border-ink-400/50 text-ink-100 text-xs font-bold py-2 rounded-lg">Withdraw</button>
          </div>
        </div>
      ) : (
        <div className="p-4 border-b border-ink-500/40 space-y-2">
          <button onClick={() => { navigate('/auth'); onNavigate?.(); }} className="w-full bg-primary-500 text-white text-sm font-bold py-2.5 rounded-xl">Login</button>
          <button onClick={() => { navigate('/auth?mode=signup'); onNavigate?.(); }} className="w-full border border-ink-400/50 text-ink-100 text-sm font-bold py-2.5 rounded-xl">Create Account</button>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto py-2" aria-label="Sidebar">
        {SIDE_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              clsx('flex items-center gap-3 px-4 py-2.5 text-sm font-semibold transition-colors', isActive ? 'bg-ink-600 text-primary-600 border-r-2 border-primary-400' : 'text-ink-200 hover:bg-ink-600/60 hover:text-ink-50')
            }
          >
            <Icon className="w-4.5 h-4.5 w-[18px]" />
            {label}
          </NavLink>
        ))}
        {admin && (
          <NavLink
            to="/admin"
            onClick={onNavigate}
            className={({ isActive }) =>
              clsx('flex items-center gap-3 px-4 py-2.5 text-sm font-semibold', isActive ? 'bg-ink-600 text-secondary-400 border-r-2 border-secondary-400' : 'text-secondary-300 hover:bg-ink-600/60')
            }
          >
            <LayoutDashboard className="w-[18px]" />
            Admin Console
          </NavLink>
        )}
      </nav>

      <div className="border-t border-ink-500/40 py-2">
        <SideLink icon={Settings} label="Settings & RG" onClick={() => { navigate('/settings'); onNavigate?.(); }} />
        <SideLink icon={ShieldCheck} label="Responsible Gaming" onClick={() => { navigate('/responsible-gaming'); onNavigate?.(); }} />
        {profile && (
          <SideLink
            icon={LogOut}
            label="Sign Out"
            danger
            onClick={async () => {
              await signOut();
              navigate('/');
              onNavigate?.();
            }}
          />
        )}
      </div>
    </div>
  );
}

function SideLink({ icon: Icon, label, onClick, danger }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick?: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={clsx('flex items-center gap-3 px-4 py-2.5 text-sm font-semibold w-full hover:bg-ink-600/60', danger ? 'text-error-500' : 'text-ink-200')}>
      <Icon className="w-[18px]" />
      {label}
    </button>
  );
}

export function MobileDrawer() {
  const open = useUI((s) => s.sideNavOpen);
  const setOpen = useUI((s) => s.setSideNavOpen);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-sheet flex" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="absolute inset-0 bg-black/70 animate-fade-in" onClick={() => setOpen(false)} />
      <div className="relative bg-ink-700 w-[290px] max-w-[85vw] h-full animate-slide-up shadow-float flex flex-col">
        <div className="flex items-center justify-between px-4 pt-safe-top pt-4 pb-2">
          <BrandMark size={24} />
          <button onClick={() => setOpen(false)} aria-label="Close menu" className="p-2 -mr-2 text-ink-200"><X className="w-5 h-5" /></button>
        </div>
        <SideNavContent onNavigate={() => setOpen(false)} />
      </div>
    </div>
  );
}

export function DesktopSidenav() {
  return (
    <aside className="hidden lg:block fixed left-0 top-14 bottom-0 w-60 bg-ink-700 border-r border-ink-500/40 z-header overflow-hidden">
      <SideNavContent />
    </aside>
  );
}

/** A slim signup nudge pinned above the bottom nav for signed-out visitors —
 *  hidden once there's a betslip selection so it never stacks on top of
 *  FloatingBetslipButton, which occupies the same spot and matters more. */
export function StickySignupBar() {
  const profile = useAuth((s) => s.profile);
  const hasSelections = useSlip((s) => s.items.length > 0);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (profile || hasSelections || pathname.startsWith('/auth')) return null;
  return (
    <button
      onClick={() => navigate('/auth?mode=signup')}
      className="lg:hidden fixed left-3 right-3 bottom-[72px] z-nav bg-secondary-500 text-ink-900 rounded-xl px-4 py-2.5 flex items-center justify-between shadow-float animate-slide-up active:scale-[0.99] transition-transform"
    >
      <span className="text-sm font-extrabold">Get your welcome bonus</span>
      <span className="text-xs font-bold underline underline-offset-2">Sign Up</span>
    </button>
  );
}

export function FloatingBetslipButton() {
  const count = useSlip((s) => s.items.length);
  const items = useSlip((s) => s.items);
  const stake = useSlip((s) => s.stake);
  const openSheet = useUI((s) => s.setBetslipOpen);

  if (count === 0) return null;
  const totals = slipTotals(items, count > 1 ? 'multi' : 'single', Number(stake) || 0, 3);
  return (
    <button
      onClick={() => openSheet(true)}
      className="lg:hidden fixed left-3 right-3 bottom-[72px] z-nav bg-primary-500 text-white rounded-xl px-4 py-2.5 flex items-center justify-between shadow-float animate-slide-up active:scale-[0.99] transition-transform"
      aria-label={`Open betslip, ${count} ${count === 1 ? 'selection' : 'selections'}`}
    >
      <span className="flex items-center gap-2 text-sm font-bold">
        <span className="bg-white text-primary-600 rounded-full min-w-[20px] h-5 px-1 flex items-center justify-center text-xs font-extrabold">{count}</span>
        Betslip
      </span>
      <span className="text-sm font-extrabold tnum">{money(totals.potential)}</span>
    </button>
  );
}

export function WalletChip() {
  const profile = useAuth((s) => s.profile);
  const balance = useWallet((s) => (profile ? s.balanceOf(profile.id) : 0));
  if (!profile) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-ink-50 bg-ink-600 rounded-lg px-2 py-1">
      <Wallet className="w-3.5 h-3.5 text-primary-600" />
      <span className="tnum">{money(balance)}</span>
    </span>
  );
}

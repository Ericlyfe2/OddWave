import { Component, lazy, Suspense, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import clsx from 'clsx';
import { Header, BottomNav, MobileDrawer, DesktopSidenav, Footer, StickySignupBar } from '@/components/layout';
import { BetslipSheet, DesktopBetslip } from '@/components/Betslip';
import { FloatingBetslipButton } from '@/components/layout';
import { useUI } from '@/store/ui';
import { useAuth } from '@/store/auth';
import { useSlip } from '@/store/slip';
import { LoadingBlock } from '@/components/ui';

const HomeScreen = lazy(() => import('@/screens/HomeScreen').then((m) => ({ default: m.HomeScreen })));
const SportsScreen = lazy(() => import('@/screens/SportsScreen').then((m) => ({ default: m.SportsScreen })));
const LeagueScreen = lazy(() => import('@/screens/SportsScreen').then((m) => ({ default: m.LeagueScreen })));
const CountriesScreen = lazy(() => import('@/screens/CountriesScreen').then((m) => ({ default: m.CountriesScreen })));
const LiveScreen = lazy(() => import('@/screens/LiveScreen').then((m) => ({ default: m.LiveScreen })));
const MatchScreen = lazy(() => import('@/screens/MatchScreen').then((m) => ({ default: m.MatchScreen })));
const SearchScreen = lazy(() => import('@/screens/SearchScreen').then((m) => ({ default: m.SearchScreen })));
const FavoritesScreen = lazy(() => import('@/screens/FavoritesResults').then((m) => ({ default: m.FavoritesScreen })));
const ResultsScreen = lazy(() => import('@/screens/FavoritesResults').then((m) => ({ default: m.ResultsScreen })));
const TodayScreen = lazy(() => import('@/screens/TodayBooking').then((m) => ({ default: m.TodayScreen })));
const BookingScreen = lazy(() => import('@/screens/TodayBooking').then((m) => ({ default: m.BookingScreen })));
const BetsScreen = lazy(() => import('@/screens/BetsScreen').then((m) => ({ default: m.BetsScreen })));
const AuthScreen = lazy(() => import('@/screens/AuthScreen').then((m) => ({ default: m.AuthScreen })));
const AccountScreen = lazy(() => import('@/screens/AccountScreens').then((m) => ({ default: m.AccountScreen })));
const DepositScreen = lazy(() => import('@/screens/AccountScreens').then((m) => ({ default: m.DepositScreen })));
const WithdrawScreen = lazy(() => import('@/screens/AccountScreens').then((m) => ({ default: m.WithdrawScreen })));
const AccountTransactionsScreen = lazy(() => import('@/screens/AccountScreens').then((m) => ({ default: m.AccountTransactionsScreen })));
const PromotionsScreen = lazy(() => import('@/screens/EngagementScreens').then((m) => ({ default: m.PromotionsScreen })));
const NotificationsScreen = lazy(() => import('@/screens/EngagementScreens').then((m) => ({ default: m.NotificationsScreen })));
const VirtualsScreen = lazy(() => import('@/screens/EngagementScreens').then((m) => ({ default: m.VirtualsScreen })));
const GamesScreen = lazy(() => import('@/screens/GamesScreen').then((m) => ({ default: m.GamesScreen })));
const SecurityScreen = lazy(() => import('@/screens/SecurityScreen').then((m) => ({ default: m.SecurityScreen })));
const SettingsScreen = lazy(() => import('@/screens/SettingsScreen').then((m) => ({ default: m.SettingsScreen })));
const ResponsibleGamingScreen = lazy(() => import('@/screens/ResponsibleGamingScreen').then((m) => ({ default: m.ResponsibleGamingScreen })));
const HelpScreen = lazy(() => import('@/screens/HelpScreen').then((m) => ({ default: m.HelpScreen })));
const ThankYouScreen = lazy(() => import('@/screens/ThankYouScreen').then((m) => ({ default: m.ThankYouScreen })));
const NotFoundScreen = lazy(() => import('@/screens/NotFoundScreen').then((m) => ({ default: m.NotFoundScreen })));
const AdminOverview = lazy(() => import('@/screens/AdminOverview').then((m) => ({ default: m.AdminOverview })));
const AdminOps = lazy(() => import('@/screens/AdminOps').then((m) => ({ default: m.AdminOps })));

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-6 pt-16 text-center">
          <h1 className="text-lg font-extrabold text-ink-50 mb-2">Something went wrong</h1>
          <p className="text-xs text-ink-300 mb-4">An unexpected error occurred while loading this page.</p>
          <button onClick={() => window.location.assign('/')} className="bg-primary-500 text-white text-sm font-bold rounded-xl px-5 py-2.5">
            Back to Home
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function ToastHost() {
  const toasts = useUI((s) => s.toasts);
  const dismissToast = useUI((s) => s.dismissToast);
  return (
    <div className="fixed inset-x-3 top-3 z-[70] space-y-2 pointer-events-none" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={clsx(
            'pointer-events-auto flex items-start gap-2 rounded-xl border px-3 py-2.5 shadow-lg animate-slide-up max-w-md mx-auto',
            t.kind === 'success' && 'bg-success-600 border-success-500 text-white',
            t.kind === 'error' && 'bg-error-600 border-error-500 text-white',
            t.kind === 'info' && 'bg-ink-800 border-ink-400/50 text-ink-50'
          )}
        >
          <span className="flex-1 text-xs font-semibold leading-relaxed">{t.message}</span>
          <button onClick={() => dismissToast(t.id)} aria-label="Dismiss" className="opacity-70 hover:opacity-100 shrink-0 mt-0.5">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const profile = useAuth((s) => s.profile);
  const location = useLocation();
  if (!profile) return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

/** Admin-only routes: authenticated *and* holding the admin role. */
function RequireAdmin({ children }: { children: ReactNode }) {
  const profile = useAuth((s) => s.profile);
  const location = useLocation();
  if (!profile) return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  if (profile.role !== 'admin') {
    return (
      <div className="p-6 pt-12 text-center">
        <h1 className="text-lg font-extrabold text-ink-50 mb-2">Admin access required</h1>
        <p className="text-xs text-ink-300">This area is restricted to control-room staff.</p>
      </div>
    );
  }
  return <>{children}</>;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  return <ScrollEffect pathname={pathname} />;
}

function ScrollEffect({ pathname }: { pathname: string }) {
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}

export function Shell({ children }: { children: ReactNode }) {
  // The floating betslip bar sits above the bottom nav, so content needs to
  // clear both of them while there are selections.
  const hasSelections = useSlip((s) => s.items.length > 0);
  return (
    <div className="min-h-screen bg-ink-700">
      <Header />
      <DesktopSidenav />
      <main className={clsx('lg:pl-60 lg:pr-[356px] flex flex-col min-h-screen', hasSelections ? 'pb-32' : 'pb-24 lg:pb-0')}>
        <div className="flex-1">{children}</div>
        <Footer />
      </main>
      <BottomNav />
      <MobileDrawer />
      <StickySignupBar />
      <FloatingBetslipButton />
      <DesktopBetslip />
      <BetslipSheet />
      <ToastHost />
    </div>
  );
}

function Fallback() {
  return <div className="py-10"><LoadingBlock label="Loading…" /></div>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ScrollToTop />
        <Shell>
          <Suspense fallback={<Fallback />}>
            <Routes>
              <Route path="/" element={<HomeScreen />} />
              <Route path="/sports" element={<SportsScreen />} />
              <Route path="/sport/:sportId" element={<SportsScreen />} />
              <Route path="/countries" element={<CountriesScreen />} />
              <Route path="/league/:leagueId" element={<LeagueScreen />} />
              <Route path="/live" element={<LiveScreen />} />
              <Route path="/today" element={<TodayScreen />} />
              <Route path="/match/:matchId" element={<MatchScreen />} />
              <Route path="/search" element={<SearchScreen />} />
              <Route path="/favorites" element={<FavoritesScreen />} />
              <Route path="/results" element={<ResultsScreen />} />
              <Route path="/booking" element={<BookingScreen />} />
              <Route path="/promotions" element={<PromotionsScreen />} />
              <Route path="/virtuals" element={<VirtualsScreen />} />
              <Route path="/games" element={<GamesScreen />} />
              <Route path="/responsible-gaming" element={<ResponsibleGamingScreen />} />
              <Route path="/help" element={<HelpScreen />} />
              <Route path="/auth" element={<AuthScreen />} />
              <Route path="/welcome" element={<RequireAuth><ThankYouScreen /></RequireAuth>} />
              <Route path="/bets" element={<RequireAuth><BetsScreen /></RequireAuth>} />
              <Route path="/notifications" element={<RequireAuth><NotificationsScreen /></RequireAuth>} />
              <Route path="/account" element={<RequireAuth><AccountScreen /></RequireAuth>} />
              <Route path="/account/deposit" element={<RequireAuth><DepositScreen /></RequireAuth>} />
              <Route path="/account/withdraw" element={<RequireAuth><WithdrawScreen /></RequireAuth>} />
              <Route path="/account/transactions" element={<RequireAuth><AccountTransactionsScreen /></RequireAuth>} />
              <Route path="/account/security" element={<RequireAuth><SecurityScreen /></RequireAuth>} />
              <Route path="/settings" element={<RequireAuth><SettingsScreen /></RequireAuth>} />
              <Route
                path="/admin"
                element={
                  <RequireAdmin>
                    <>
                      <AdminOverview />
                      <AdminOps />
                    </>
                  </RequireAdmin>
                }
              />
              <Route path="*" element={<NotFoundScreen />} />
            </Routes>
          </Suspense>
        </Shell>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

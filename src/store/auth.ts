import { create } from 'zustand';
import type { DeviceSession, Profile } from '@/lib/types';
import { trpcClient } from '@/lib/trpc';

interface AuthState {
  profile: Profile | null;
  ready: boolean;
  init: () => Promise<void>;
  signUp: (email: string, password: string, phone: string, fullName: string) => Promise<{ error?: string }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  spendBonus: (amount: number) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<{ ok: boolean; resetCode?: string; error?: string }>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<{ error?: string }>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ error?: string }>;
  listSessions: () => Promise<Array<DeviceSession & { current: boolean }>>;
  revokeSession: (sessionId: string) => Promise<{ signedOut: boolean }>;
  revokeOtherSessions: () => Promise<number>;
  requestVerification: (channel: 'email' | 'phone') => Promise<{ code: string }>;
  confirmVerification: (channel: 'email' | 'phone', code: string) => Promise<{ error?: string }>;
}

export const useAuth = create<AuthState>((set) => ({
  profile: null,
  ready: false,

  init: async () => {
    // A network failure here (backend unreachable, mid-deploy, cold start)
    // must not stop the app from rendering — the caller awaits this before
    // mounting React at all, so an unhandled rejection here means a blank
    // white page with no error boundary reachable to show anything.
    try {
      const profile = await trpcClient.auth.me.query();
      set({ profile, ready: true });
    } catch {
      set({ profile: null, ready: true });
    }
  },

  signUp: async (email, password, phone, fullName) => {
    const result = await trpcClient.auth.signUp.mutate({ email, password, phone, fullName });
    if ('error' in result) return { error: result.error };
    set({ profile: result.profile });
    return {};
  },

  signIn: async (email, password) => {
    const result = await trpcClient.auth.signIn.mutate({ email, password });
    if ('error' in result) return { error: result.error };
    set({ profile: result.profile });
    return {};
  },

  signOut: async () => {
    await trpcClient.auth.signOut.mutate();
    set({ profile: null });
  },

  updateProfile: async (patch) => {
    const profile = await trpcClient.auth.updateProfile.mutate(patch as never);
    set({ profile });
  },

  spendBonus: async (amount) => {
    const profile = await trpcClient.auth.spendBonus.mutate({ amount });
    set({ profile });
  },

  requestPasswordReset: (email) => trpcClient.auth.requestPasswordReset.mutate({ email }),

  resetPassword: (email, code, newPassword) => trpcClient.auth.resetPassword.mutate({ email, code, newPassword }),

  changePassword: (currentPassword, newPassword) => trpcClient.auth.changePassword.mutate({ currentPassword, newPassword }),

  listSessions: () => trpcClient.auth.listSessions.query(),

  revokeSession: async (sessionId) => {
    const result = await trpcClient.auth.revokeSession.mutate({ sessionId });
    if (result.signedOut) set({ profile: null });
    return result;
  },

  revokeOtherSessions: () => trpcClient.auth.revokeOtherSessions.mutate(),

  requestVerification: (channel) => trpcClient.auth.requestVerification.mutate({ channel }),

  confirmVerification: async (channel, code) => {
    const result = await trpcClient.auth.confirmVerification.mutate({ channel, code });
    if (!('error' in result)) {
      const profile = await trpcClient.auth.me.query();
      set({ profile });
    }
    return result;
  },
}));

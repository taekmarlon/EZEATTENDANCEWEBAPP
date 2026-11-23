import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  getInitialSession,
  loadUserAccessContext,
  signInWithRolePortal,
  signOutSession,
  signUpAccount,
  subscribeAuthState,
  updateOwnPassword,
} from '../services/supabaseAuth';
import { TeacherAssignment, UserProfile, UserRole } from '../types';

interface AuthContextType {
  profile: UserProfile | null;
  assignments: TeacherAssignment[];
  isConfigured: boolean;
  isLoadingAuth: boolean;
  isLoggingIn: boolean;
  authError: string | null;
  signIn: (email: string, password: string, portalRole: UserRole) => Promise<boolean>;
  signUp: (
    email: string,
    password: string,
    fullName: string
  ) => Promise<{ ok: boolean; needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  changeOwnPassword?: (currentPassword: string, newPassword: string) => Promise<void>;
  refreshAccessContext?: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(isSupabaseConfigured);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsLoadingAuth(false);
      return;
    }

    let cancelled = false;

    const hydrateSession = async (userId: string | null) => {
      if (!userId) {
        if (!cancelled) {
          setProfile(null);
          setAssignments([]);
          setIsLoadingAuth(false);
        }
        return;
      }
      try {
        const bundle = await loadUserAccessContext(userId);
        if (!cancelled) {
          setProfile(bundle.profile);
          setAssignments(bundle.assignments);
          setAuthError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setProfile(null);
          setAssignments([]);
          setAuthError(err instanceof Error ? err.message : 'Session expired.');
          await signOutSession().catch(() => {});
        }
      } finally {
        if (!cancelled) setIsLoadingAuth(false);
      }
    };

    getInitialSession().then((session) => {
      void hydrateSession(session?.user?.id ?? null);
    });

    const unsubscribe = subscribeAuthState((session) => {
      void hydrateSession(session?.user?.id ?? null);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(
    async (email: string, password: string, portalRole: UserRole): Promise<boolean> => {
      setIsLoggingIn(true);
      setAuthError(null);
      try {
        const bundle = await signInWithRolePortal(email, password, portalRole);
        setProfile(bundle.profile);
        setAssignments(bundle.assignments);
        return true;
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Sign-in failed.');
        return false;
      } finally {
        setIsLoggingIn(false);
      }
    },
    []
  );

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      fullName: string
    ): Promise<{ ok: boolean; needsEmailConfirmation: boolean }> => {
      setIsLoggingIn(true);
      setAuthError(null);
      try {
        const res = await signUpAccount(email, password, fullName);
        return { ok: true, needsEmailConfirmation: res.needsEmailConfirmation };
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Registration failed.');
        return { ok: false, needsEmailConfirmation: false };
      } finally {
        setIsLoggingIn(false);
      }
    },
    []
  );

  const signOut = useCallback(async () => {
    await signOutSession();
    setProfile(null);
    setAssignments([]);
    setAuthError(null);
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const changeOwnPassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await updateOwnPassword(currentPassword, newPassword);
  }, []);

  const refreshAccessContext = useCallback(async () => {
    if (!isSupabaseConfigured || !profile?.id) return;
    const bundle = await loadUserAccessContext(profile.id);
    setProfile(bundle.profile);
    setAssignments(bundle.assignments);
  }, [profile?.id]);

  const value = useMemo(
    () => ({
      profile,
      assignments,
      isConfigured: isSupabaseConfigured,
      isLoadingAuth,
      isLoggingIn,
      authError,
      signIn,
      signUp,
      signOut,
      changeOwnPassword,
      refreshAccessContext,
      clearAuthError,
    }),
    [
      profile,
      assignments,
      isLoadingAuth,
      isLoggingIn,
      authError,
      signIn,
      signUp,
      signOut,
      changeOwnPassword,
      refreshAccessContext,
      clearAuthError,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

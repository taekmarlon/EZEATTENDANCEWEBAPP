import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import * as supabaseAuth from '../services/supabaseAuth';

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {},
}));

vi.mock('../services/supabaseAuth', () => ({
  getInitialSession: vi.fn().mockResolvedValue(null),
  subscribeAuthState: vi.fn(() => () => {}),
  loadUserAccessContext: vi.fn(),
  signInWithRolePortal: vi.fn(),
  signUpAccount: vi.fn(),
  signOutSession: vi.fn().mockResolvedValue(undefined),
}));

function AuthHarness({ onReady }: { onReady: (ctx: ReturnType<typeof useAuth>) => void }) {
  const ctx = useAuth();
  onReady(ctx);
  return (
    <div>
      <span data-testid="role">{ctx.profile?.role || 'none'}</span>
      <span data-testid="error">{ctx.authError || ''}</span>
    </div>
  );
}

describe('AuthContext (Supabase 3-Role Portal)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabaseAuth.getInitialSession).mockResolvedValue(null);
    vi.mocked(supabaseAuth.subscribeAuthState).mockReturnValue(() => {});
  });

  it('signs in with role verification and signs out cleanly', async () => {
    vi.mocked(supabaseAuth.signInWithRolePortal).mockResolvedValue({
      profile: {
        id: 'u-1',
        email: 'director@school.edu',
        fullName: 'Director One',
        role: 'director',
        isActive: true,
      },
      assignments: [],
    });

    let ctx!: ReturnType<typeof useAuth>;
    render(
      <AuthProvider>
        <AuthHarness onReady={(c) => (ctx = c)} />
      </AuthProvider>
    );

    expect(screen.getByTestId('role').textContent).toBe('none');

    await act(async () => {
      const ok = await ctx.signIn('director@school.edu', 'pass1234', 'director');
      expect(ok).toBe(true);
    });
    expect(screen.getByTestId('role').textContent).toBe('director');

    await act(async () => {
      await ctx.signOut();
    });
    expect(screen.getByTestId('role').textContent).toBe('none');
  });

  it('captures role-mismatch errors cleanly', async () => {
    vi.mocked(supabaseAuth.signInWithRolePortal).mockRejectedValue(
      new Error('This account is assigned the Teacher role.')
    );

    let ctx!: ReturnType<typeof useAuth>;
    render(
      <AuthProvider>
        <AuthHarness onReady={(c) => (ctx = c)} />
      </AuthProvider>
    );

    await act(async () => {
      const ok = await ctx.signIn('teacher@school.edu', 'pass1234', 'admin');
      expect(ok).toBe(false);
    });
    expect(screen.getByTestId('error').textContent).toContain('Teacher role');

    act(() => ctx.clearAuthError());
    expect(screen.getByTestId('error').textContent).toBe('');
  });
});

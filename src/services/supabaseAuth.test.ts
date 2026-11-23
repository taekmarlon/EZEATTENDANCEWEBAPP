import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadUserAccessContext, signInWithRolePortal, updateOwnPassword } from './supabaseAuth';

const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();
const mockGetUser = vi.fn();
const mockUpdateUser = vi.fn();
const mockProfileSelect = vi.fn();
const mockAssignmentsSelect = vi.fn();
const mockRpc = vi.fn();

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: true,
  requireSupabase: () => ({
    auth: {
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
      getUser: (...args: unknown[]) => mockGetUser(...args),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
    },
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: () => mockProfileSelect(),
              maybeSingle: () => mockProfileSelect(),
            }),
          }),
        };
      }
      if (table === 'teacher_school_assignments') {
        return {
          select: () => ({
            eq: () => mockAssignmentsSelect(),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  }),
}));

describe('supabaseAuth 3-role portal login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignOut.mockResolvedValue({ error: null });
  });

  it('allows login when verified DB profile.role matches selected portal tab', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: 'u-1', email: 't@school.edu' }, session: {} },
      error: null,
    });
    mockProfileSelect.mockResolvedValue({
      data: {
        id: 'u-1',
        email: 't@school.edu',
        full_name: 'Ms. Cruz',
        role: 'teacher',
        is_active: true,
        avatar_url: null,
      },
      error: null,
    });
    mockAssignmentsSelect.mockResolvedValue({
      data: [{ id: 1, teacher_id: 'u-1', school_id: 'sch-1', specialization_id: 'sp-1' }],
      error: null,
    });

    const result = await signInWithRolePortal('t@school.edu', 'secret123', 'teacher');
    expect(result.profile.role).toBe('teacher');
    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0].specializationId).toBe('sp-1');
  });

  it('rejects and signs out when a Teacher tries to sign into Admin or Director portal', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: 'u-1', email: 't@school.edu' }, session: {} },
      error: null,
    });
    mockProfileSelect.mockResolvedValue({
      data: {
        id: 'u-1',
        email: 't@school.edu',
        full_name: 'Ms. Cruz',
        role: 'teacher',
        is_active: true,
      },
      error: null,
    });

    await expect(signInWithRolePortal('t@school.edu', 'secret123', 'admin')).rejects.toThrow(
      /assigned the Teacher role/i
    );
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('rejects and signs out deactivated accounts', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: 'u-2', email: 'old@school.edu' }, session: {} },
      error: null,
    });
    mockProfileSelect.mockResolvedValue({
      data: {
        id: 'u-2',
        email: 'old@school.edu',
        full_name: 'Former User',
        role: 'director',
        is_active: false,
      },
      error: null,
    });

    await expect(signInWithRolePortal('old@school.edu', 'secret123', 'director')).rejects.toThrow(
      /deactivated/i
    );
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('recovers a missing profile row via ensure_my_profile RPC', async () => {
    mockProfileSelect.mockResolvedValue({ data: null, error: null });
    mockRpc.mockResolvedValue({
      data: {
        id: 'admin-1',
        email: 'taekmarlon@gmail.com',
        full_name: 'Marlon',
        role: 'admin',
        is_active: true,
        avatar_url: null,
      },
      error: null,
    });

    const result = await loadUserAccessContext('admin-1');
    expect(mockRpc).toHaveBeenCalledWith('ensure_my_profile');
    expect(result.profile.role).toBe('admin');
    expect(result.profile.email).toBe('taekmarlon@gmail.com');
  });

  it('surfaces the underlying Supabase error message when querying profiles fails', async () => {
    mockProfileSelect.mockResolvedValue({
      data: null,
      error: { message: 'relation "public.profiles" does not exist' },
    });

    await expect(loadUserAccessContext('u-err')).rejects.toThrow(
      /relation "public\.profiles" does not exist/i
    );
  });

  it('includes SQL recovery guidance when profiles query hits permission denied', async () => {
    mockProfileSelect.mockResolvedValue({
      data: null,
      error: { message: 'permission denied for table profiles' },
    });

    await expect(loadUserAccessContext('u-denied')).rejects.toThrow(
      /permission denied for table profiles.*004_profile_recovery\.sql/i
    );
  });

  it('verifies current password before updating own password in Supabase Auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 't-1', email: 't@school.edu' } }, error: null });
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Invalid login credentials' },
    });

    await expect(updateOwnPassword('wrongpass', 'newpass123')).rejects.toThrow(
      /current password is incorrect/i
    );
    expect(mockUpdateUser).not.toHaveBeenCalled();

    mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: { id: 't-1', email: 't@school.edu' } },
      error: null,
    });
    mockUpdateUser.mockResolvedValueOnce({ data: { user: { id: 't-1' } }, error: null });

    await updateOwnPassword('oldpass123', 'newpass123');
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newpass123' });
  });
});

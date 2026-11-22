import { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, requireSupabase } from '../lib/supabase';
import { TeacherAssignment, UserProfile, UserRole } from '../types';

export interface AuthSessionBundle {
  profile: UserProfile;
  assignments: TeacherAssignment[];
}

function formatRoleLabel(role: UserRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

interface ProfileRow {
  id: string;
  email: string;
  full_name?: string | null;
  avatar_url?: string | null;
  role: UserRole;
  is_active: boolean;
}

function mapProfileRow(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name || row.email,
    avatarUrl: row.avatar_url || undefined,
    role: row.role,
    isActive: Boolean(row.is_active),
  };
}

export async function loadUserAccessContext(userId: string): Promise<AuthSessionBundle> {
  const client = requireSupabase();
  const { data: profileRow, error: profileErr } = await client
    .from('profiles')
    .select('id, email, full_name, avatar_url, role, is_active')
    .eq('id', userId)
    .maybeSingle();

  if (profileErr) {
    const hint = /permission denied/i.test(profileErr.message)
      ? '. Run supabase/migrations/004_profile_recovery.sql (SQL GRANTs & backfill) in Supabase SQL Editor.'
      : '';
    throw new Error(`Could not load user profile: ${profileErr.message}${hint}`);
  }

  let resolvedRow = profileRow as ProfileRow | null;
  if (!resolvedRow) {
    const { data: ensuredData, error: ensureErr } = await client.rpc('ensure_my_profile');
    const candidate = Array.isArray(ensuredData) ? ensuredData[0] : ensuredData;
    if (ensureErr || !candidate || !(candidate as Partial<ProfileRow>).id) {
      const detail = ensureErr?.message || 'missing public.profiles record';
      throw new Error(
        `Could not load user profile (${detail}). Apply supabase/migrations/004_profile_recovery.sql in Supabase SQL Editor and retry.`
      );
    }
    resolvedRow = candidate as ProfileRow;
  }

  const profile = mapProfileRow(resolvedRow);
  if (!profile.isActive) {
    throw new Error('Your account has been deactivated. Contact an administrator.');
  }

  let assignments: TeacherAssignment[] = [];
  if (profile.role === 'teacher') {
    const { data: assignRows, error: assignErr } = await client
      .from('teacher_school_assignments')
      .select('id, teacher_id, school_id, specialization_id')
      .eq('teacher_id', userId);

    if (assignErr) {
      throw new Error('Could not load assigned schools and specializations.');
    }
    assignments = (assignRows || []).map((a) => ({
      id: a.id,
      teacherId: a.teacher_id,
      schoolId: a.school_id,
      specializationId: a.specialization_id ?? null,
    }));
  }

  return { profile, assignments };
}

export async function signInWithRolePortal(
  email: string,
  password: string,
  selectedPortalRole: UserRole
): Promise<AuthSessionBundle> {
  const client = requireSupabase();
  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error || !data.user) {
    throw new Error(error?.message || 'Invalid email or password.');
  }

  try {
    const bundle = await loadUserAccessContext(data.user.id);
    if (bundle.profile.role !== selectedPortalRole) {
      await client.auth.signOut();
      throw new Error(
        `This account is assigned the ${formatRoleLabel(bundle.profile.role)} role. Please select the ${formatRoleLabel(bundle.profile.role)} login tab.`
      );
    }
    return bundle;
  } catch (err) {
    await client.auth.signOut().catch(() => {});
    throw err;
  }
}

export async function signUpAccount(
  email: string,
  password: string,
  fullName: string
): Promise<{ needsEmailConfirmation: boolean }> {
  const client = requireSupabase();
  const canRedirectToOrigin =
    typeof window !== 'undefined' &&
    /^https?:$/.test(window.location.protocol) &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1';

  const { data, error } = await client.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: { full_name: fullName.trim() },
      ...(canRedirectToOrigin ? { emailRedirectTo: window.location.origin } : {}),
    },
  });
  if (error) {
    throw new Error(error.message);
  }
  return { needsEmailConfirmation: !data.session };
}

export async function signOutSession(): Promise<void> {
  if (!isSupabaseConfigured) return;
  const client = requireSupabase();
  await client.auth.signOut();
}

export async function getInitialSession(): Promise<Session | null> {
  if (!isSupabaseConfigured) return null;
  const client = requireSupabase();
  const { data } = await client.auth.getSession();
  return data.session ?? null;
}

export function subscribeAuthState(
  callback: (session: Session | null) => void
): () => void {
  if (!isSupabaseConfigured) return () => {};
  const client = requireSupabase();
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return () => subscription.unsubscribe();
}

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFunctionsInvoke = vi.fn();
const mockEphemeralSignUp = vi.fn();
const mockProfileUpdate = vi.fn();
const mockAssignmentsDelete = vi.fn();
const mockAssignmentsInsert = vi.fn();
const mockAuditInsert = vi.fn();

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: true,
  requireSupabase: () => ({
    functions: {
      invoke: (...args: unknown[]) => mockFunctionsInvoke(...args),
    },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          update: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: () => mockProfileUpdate(),
              }),
            }),
          }),
        };
      }
      if (table === 'teacher_school_assignments') {
        return {
          delete: () => ({
            eq: () => mockAssignmentsDelete(),
          }),
          insert: (...args: unknown[]) => mockAssignmentsInsert(...args),
        };
      }
      if (table === 'audit_logs') {
        return {
          insert: (...args: unknown[]) => mockAuditInsert(...args),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  }),
  createEphemeralAuthClient: () => ({
    auth: {
      signUp: (...args: unknown[]) => mockEphemeralSignUp(...args),
    },
  }),
}));

import { assembleWorkspaceSchools, dbCreateManagedUser } from './supabaseDb';

describe('supabaseDb workspace assembler', () => {
  it('assembles relational Supabase rows into normalized School -> Specialization -> Student trees', () => {
    const assembled = assembleWorkspaceSchools({
      schools: [{ id: 'sch-1', name: 'Lincoln High', logo_url: 'https://cdn/logo.jpg' }],
      specializations: [
        {
          id: 'sp-1',
          school_id: 'sch-1',
          name: 'STEM',
          teacher_name: 'Ms. Cruz',
          teacher_photo_url: null,
        },
      ],
      criteria: [
        { id: 'c-1', school_id: 'sch-1', specialization_id: 'sp-1', name: 'Logic', sort_order: 0 },
      ],
      students: [
        {
          id: 'st-1',
          school_id: 'sch-1',
          specialization_id: 'sp-1',
          name: 'Maria Santos',
          roll_no: '001',
          grade_level: 'Grade 10',
          gender: 'Female',
          contact_no: '0917',
          teacher_name: 'Ms. Cruz',
          photo_url: 'https://cdn/stu.jpg',
          teacher_photo_url: null,
          custom_fields: { section: 'Einstein' },
        },
      ],
      attendance: [
        { student_id: 'st-1', attendance_date: '2026-11-22', status: 'Present' },
      ],
      evaluations: [
        { id: 'ev-1', student_id: 'st-1', eval_date: '2026-11-22' },
      ],
      scores: [
        { evaluation_id: 'ev-1', criterion_id: 'c-1', score: 5 },
      ],
    });

    expect(assembled).toHaveLength(1);
    expect(assembled[0].logo).toBe('https://cdn/logo.jpg');
    expect(assembled[0].specializations[0].rubricCriteria[0].name).toBe('Logic');
    const st = assembled[0].specializations[0].students[0];
    expect(st.attendance['2026-11-22']).toBe('Present');
    expect(st.evaluations[0].scores['c-1']).toBe(5);
    expect(st.customFields?.section).toBe('Einstein');
  });
});

describe('dbCreateManagedUser admin provisioning', () => {
  const adminActor = {
    id: 'admin-1',
    email: 'taekmarlon@gmail.com',
    fullName: 'Marlon Manalili',
    role: 'admin' as const,
    isActive: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockProfileUpdate.mockResolvedValue({ data: { id: 'teacher-new' }, error: null });
    mockAssignmentsDelete.mockResolvedValue({ error: null });
    mockAssignmentsInsert.mockResolvedValue({ error: null });
    mockAuditInsert.mockResolvedValue({ error: null });
  });

  it('falls back to non-persistent auth.signUp + admin RLS update when admin-users Edge Function is not deployed', async () => {
    mockFunctionsInvoke.mockResolvedValue({
      data: null,
      error: {
        name: 'FunctionsFetchError',
        message: 'Failed to send a request to the Edge Function',
      },
    });
    mockEphemeralSignUp.mockResolvedValue({
      data: {
        user: { id: 'teacher-new', email: 'rachellemanalili@gmail.com', identities: [{ id: 'id-1' }] },
        session: { access_token: 'tok' },
      },
      error: null,
    });

    const result = await dbCreateManagedUser(
      {
        email: 'rachellemanalili@gmail.com',
        password: 'password123',
        fullName: 'Rachelle Manalili',
        role: 'teacher',
        assignments: [{ schoolId: 'sch-1', specializationId: 'sp-1' }],
      },
      adminActor
    );

    expect(mockEphemeralSignUp).toHaveBeenCalledWith({
      email: 'rachellemanalili@gmail.com',
      password: 'password123',
      options: { data: { full_name: 'Rachelle Manalili' } },
    });
    expect(mockAssignmentsInsert).toHaveBeenCalledWith([
      {
        teacher_id: 'teacher-new',
        school_id: 'sch-1',
        specialization_id: 'sp-1',
        assigned_by: 'admin-1',
      },
    ]);
    expect(result).toEqual({ userId: 'teacher-new', needsEmailConfirmation: false });
  });

  it('does not invoke signUp fallback when a deployed Edge Function returns a real validation error', async () => {
    mockFunctionsInvoke.mockResolvedValue({
      data: null,
      error: {
        name: 'FunctionsHttpError',
        message: 'Edge Function returned a non-2xx status code',
        context: {
          status: 400,
          json: async () => ({ error: 'Email already registered' }),
        },
      },
    });

    await expect(
      dbCreateManagedUser({
        email: 'dup@school.edu',
        password: 'password123',
        fullName: 'Duplicate User',
        role: 'teacher',
        assignments: [],
      })
    ).rejects.toThrow(/Email already registered/i);
    expect(mockEphemeralSignUp).not.toHaveBeenCalled();
  });

  it('rejects empty identities array in fallback signUp so existing users are never overwritten', async () => {
    mockFunctionsInvoke.mockResolvedValue({
      data: null,
      error: {
        name: 'FunctionsFetchError',
        message: 'Failed to send a request to the Edge Function',
      },
    });
    mockEphemeralSignUp.mockResolvedValue({
      data: {
        user: { id: 'existing-1', email: 'existing@school.edu', identities: [] },
        session: null,
      },
      error: null,
    });

    await expect(
      dbCreateManagedUser({
        email: 'existing@school.edu',
        password: 'password123',
        fullName: 'Existing User',
        role: 'teacher',
        assignments: [],
      })
    ).rejects.toThrow(/already exists/i);
    expect(mockProfileUpdate).not.toHaveBeenCalled();
  });
});

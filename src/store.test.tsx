import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { StoreProvider, useStore } from './store';
import { ToastProvider } from './context/ToastContext';
import { DEFAULT_SYSTEM_SETTINGS } from './services/permissions';
import * as supabaseDb from './services/supabaseDb';
import { School } from './types';

let mockRole: 'admin' | 'teacher' = 'admin';
const adminProfile = {
  id: 'user-1',
  email: 'user@school.edu',
  fullName: 'User One',
  role: 'admin' as const,
  isActive: true,
};
const teacherProfile = { ...adminProfile, role: 'teacher' as const };
const emptyAssignments: never[] = [];
const teacherAssignments = [{ teacherId: 'user-1', schoolId: 's-1', specializationId: 'sp-1' }];

vi.mock('./context/AuthContext', () => ({
  useAuth: () => ({
    profile: mockRole === 'teacher' ? teacherProfile : adminProfile,
    assignments: mockRole === 'teacher' ? teacherAssignments : emptyAssignments,
  }),
}));

vi.mock('./services/supabaseDb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./services/supabaseDb')>();
  return {
    ...actual,
    fetchWorkspaceSnapshot: vi.fn(),
    dbCreateSchool: vi.fn().mockResolvedValue(undefined),
    dbUpdateSchool: vi.fn().mockResolvedValue(undefined),
    dbDeleteRubricCriterion: vi.fn().mockResolvedValue(undefined),
    dbCreateSpecialization: vi.fn().mockResolvedValue(undefined),
    dbUpdateSpecializationTeacher: vi.fn().mockResolvedValue(undefined),
    dbUpsertStudent: vi.fn().mockResolvedValue({}),
    dbSetAttendance: vi.fn().mockResolvedValue(undefined),
    dbDeleteEvaluation: vi.fn().mockResolvedValue(undefined),
  };
});

function makeSeedSchool(): School[] {
  return [
    {
      id: 's-1',
      name: 'Oakridge',
      logo: 'data:image/jpeg;base64,xyz',
      specializations: [
        {
          id: 'sp-1',
          name: 'Robotics',
          rubricCriteria: [
            { id: 'c1', name: 'Design' },
            { id: 'c2', name: 'Code' },
          ],
          students: [
            {
              id: 'st-1',
              name: 'Alex',
              rollNo: '101',
              gradeLevel: 'Grade 9',
              gender: 'Male',
              contactNo: '',
              teacherName: '',
              attendance: {},
              evaluations: [{ id: 'ev-1', date: '2026-11-20', scores: { c1: 5, c2: 3 } }],
            },
          ],
        },
        {
          id: 'sp-2',
          name: 'Music',
          rubricCriteria: [],
          students: [],
        },
      ],
    },
  ];
}

function StoreHarness({ onReady }: { onReady: (store: ReturnType<typeof useStore>) => void }) {
  const store = useStore();
  onReady(store);
  return <div data-testid="count">{store.schools.length}</div>;
}

describe('StoreProvider (Supabase)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRole = 'admin';
    vi.mocked(supabaseDb.fetchWorkspaceSnapshot).mockResolvedValue({
      schools: makeSeedSchool(),
      systemSettings: DEFAULT_SYSTEM_SETTINGS,
      presets: [],
      managedUsers: [],
      auditLogs: [],
    });
  });

  it('hydrates schools from Supabase and filters specializations strictly for Teachers', async () => {
    mockRole = 'teacher';
    let captured!: ReturnType<typeof useStore>;
    render(
      <ToastProvider>
        <StoreProvider>
          <StoreHarness onReady={(s) => (captured = s)} />
        </StoreProvider>
      </ToastProvider>
    );

    await waitFor(() => expect(captured.isHydrated).toBe(true));
    expect(screen.getByTestId('count').textContent).toBe('1');
    expect(captured.schools[0].specializations.map((s) => s.id)).toEqual(['sp-1']);
  });

  it('prunes orphaned criterion scores on deleteRubricCriterion and updates school/student records', async () => {
    let captured!: ReturnType<typeof useStore>;
    render(
      <ToastProvider>
        <StoreProvider>
          <StoreHarness onReady={(s) => (captured = s)} />
        </StoreProvider>
      </ToastProvider>
    );

    await waitFor(() => expect(captured.isHydrated).toBe(true));

    act(() => {
      captured.deleteRubricCriterion('s-1', 'sp-1', 'c1');
      captured.updateSchool('s-1', 'Oakridge Prep', 'data:image/jpeg;base64,newlogo');
      captured.addSpecialization('s-1', 'Arts', 'Ms. Diaz');
      captured.updateSpecializationTeacher('s-1', 'sp-1', 'Mr. Lin', 'data:image/jpeg;base64,t');
      captured.addStudent('s-1', 'sp-1', {
        name: 'Jamie',
        rollNo: '102',
        gradeLevel: 'Grade 10',
        gender: 'Female',
        contactNo: '',
        teacherName: '',
      });
      captured.updateAttendance('s-1', 'sp-1', 'st-1', '2026-11-22', 'Present');
      captured.deleteEvaluation('s-1', 'sp-1', 'st-1', 'ev-1');
    });

    expect(captured.schools[0].name).toBe('Oakridge Prep');
    expect(captured.schools[0].logo).toBe('data:image/jpeg;base64,newlogo');
    expect(captured.schools[0].specializations).toHaveLength(3);
    expect(captured.schools[0].specializations[0].students).toHaveLength(2);
    expect(captured.schools[0].specializations[0].students[0].attendance['2026-11-22']).toBe(
      'Present'
    );
    expect(captured.schools[0].specializations[0].students[0].evaluations).toHaveLength(0);
  });

  it('refreshes workspace after addSchool so database trigger-seeded specializations appear immediately', async () => {
    let captured!: ReturnType<typeof useStore>;
    const seededAfterCreate: School[] = [
      ...makeSeedSchool(),
      {
        id: 's-new',
        name: 'Westside Campus',
        specializations: [
          { id: 'auto-guitar', name: 'GUITAR', rubricCriteria: [], students: [] },
        ],
      },
    ];
    vi.mocked(supabaseDb.fetchWorkspaceSnapshot)
      .mockResolvedValueOnce({
        schools: makeSeedSchool(),
        systemSettings: DEFAULT_SYSTEM_SETTINGS,
        presets: [],
        managedUsers: [],
        auditLogs: [],
      })
      .mockResolvedValueOnce({
        schools: seededAfterCreate,
        systemSettings: DEFAULT_SYSTEM_SETTINGS,
        presets: [],
        managedUsers: [],
        auditLogs: [],
      });

    render(
      <ToastProvider>
        <StoreProvider>
          <StoreHarness onReady={(s) => (captured = s)} />
        </StoreProvider>
      </ToastProvider>
    );

    await waitFor(() => expect(captured.isHydrated).toBe(true));

    act(() => {
      captured.addSchool('Westside Campus');
    });

    await waitFor(() => expect(supabaseDb.dbCreateSchool).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(supabaseDb.fetchWorkspaceSnapshot).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        captured.schools.find((s) => s.name === 'Westside Campus')?.specializations.map((sp) => sp.name)
      ).toEqual(['GUITAR'])
    );
  });
});

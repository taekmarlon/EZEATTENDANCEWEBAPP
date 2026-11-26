import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PortraitAvatar } from './Avatar';
import RosterView from './RosterView';
import RubricsView from './RubricsView';
import Sidebar from './Sidebar';
import StudentFormModal from './StudentFormModal';
import StudentScorecardModal from './StudentScorecardModal';
import { ToastProvider } from '../context/ToastContext';
import { StoreProvider } from '../store';
import { DEFAULT_SYSTEM_SETTINGS } from '../services/permissions';
import * as supabaseDb from '../services/supabaseDb';
import { School, Specialization } from '../types';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    profile: {
      id: 'admin-1',
      email: 'admin@school.edu',
      fullName: 'Head Admin',
      role: 'admin',
      isActive: true,
    },
    assignments: [],
  }),
}));

vi.mock('../services/supabaseDb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/supabaseDb')>();
  return {
    ...actual,
    fetchWorkspaceSnapshot: vi.fn(),
  };
});

describe('UI bug fixes & school logo features', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabaseDb.fetchWorkspaceSnapshot).mockResolvedValue({
      schools: [],
      systemSettings: DEFAULT_SYSTEM_SETTINGS,
      presets: [],
      managedUsers: [],
      auditLogs: [],
    });
  });

  it('PortraitAvatar resets imgError when src changes to a valid image', () => {
    const { rerender } = render(<PortraitAvatar src="broken://img-1" name="Alice" />);
    const img = screen.getByRole('img', { name: /Alice/i });
    fireEvent.error(img);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByLabelText('Alice')).toBeInTheDocument();

    rerender(<PortraitAvatar src="data:image/png;base64,valid" name="Alice" />);
    expect(screen.getByRole('img', { name: /Alice/i })).toBeInTheDocument();
  });

  it('RosterView omits inline Assign Teacher button, exposes Import CSV, and updates banner on specialization change', () => {
    const specA: Specialization = {
      id: 'spec-a',
      name: 'Music',
      teacherName: 'Teacher A',
      students: [],
      rubricCriteria: [],
    };
    const specB: Specialization = {
      id: 'spec-b',
      name: 'Art',
      teacherName: 'Teacher B',
      students: [],
      rubricCriteria: [],
    };
    const school: School = {
      id: 'sch-1',
      name: 'Central High',
      specializations: [specA, specB],
    };

    const { rerender } = render(
      <ToastProvider>
        <StoreProvider>
          <RosterView school={school} spec={specA} />
        </StoreProvider>
      </ToastProvider>
    );

    expect(screen.queryByRole('button', { name: /Assign Teacher & Photo/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Edit Teacher/i })).toBeNull();
    expect(screen.getAllByRole('button', { name: /Import CSV/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Teacher A')).toBeInTheDocument();

    rerender(
      <ToastProvider>
        <StoreProvider>
          <RosterView school={school} spec={specB} />
        </StoreProvider>
      </ToastProvider>
    );

    expect(screen.getByText('Teacher B')).toBeInTheDocument();
  });

  it('RubricsView prevents saving an evaluation when no criterion scores are chosen', () => {
    const spec: Specialization = {
      id: 'spec-1',
      name: 'Science',
      rubricCriteria: [{ id: 'c1', name: 'Focus' }],
      students: [
        {
          id: 'st-1',
          name: 'Student One',
          rollNo: '001',
          gradeLevel: 'Grade 8',
          gender: 'Female',
          contactNo: '',
          teacherName: '',
          attendance: {},
          evaluations: [],
        },
      ],
    };
    const school: School = { id: 's1', name: 'Test School', specializations: [spec] };

    render(
      <ToastProvider>
        <StoreProvider>
          <RubricsView school={school} spec={spec} />
        </StoreProvider>
      </ToastProvider>
    );

    const saveBtn = screen.getByRole('button', { name: /Save Evaluation/i });
    expect(saveBtn).toBeDisabled();
  });

  it('StudentScorecardModal displays school logo and excludes deleted criteria from overallRubricAvg', () => {
    const spec: Specialization = {
      id: 'sp-1',
      name: 'Math',
      rubricCriteria: [{ id: 'c1', name: 'Problem Solving' }],
      students: [
        {
          id: 'st-1',
          name: 'Ben',
          rollNo: 'R-9',
          gradeLevel: 'Grade 7',
          gender: 'Male',
          contactNo: '',
          teacherName: 'Ms. Lee',
          attendance: {},
          evaluations: [
            {
              id: 'ev-1',
              date: '2026-11-20',
              scores: { c1: 5, 'deleted-crit': 1 },
            },
          ],
        },
      ],
    };
    const school: School = {
      id: 'sch-1',
      name: 'West Academy',
      logo: 'data:image/jpeg;base64,schoollogo123',
      specializations: [spec],
    };

    render(
      <ToastProvider>
        <StudentScorecardModal
          school={school}
          spec={spec}
          student={spec.students[0]}
          onClose={vi.fn()}
        />
      </ToastProvider>
    );

    expect(screen.getByRole('img', { name: /West Academy/i })).toBeInTheDocument();
    expect(screen.getAllByText('5.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('3.00')).toBeNull();
  });

  it('Sidebar renders school logo, allows editing school logo/name, and has submit button on Add Specialization', async () => {
    vi.mocked(supabaseDb.fetchWorkspaceSnapshot).mockResolvedValue({
      schools: [
        {
          id: 'sch-logo-1',
          name: 'Crest School',
          logo: 'data:image/jpeg;base64,crestlogo',
          specializations: [],
        },
      ],
      systemSettings: DEFAULT_SYSTEM_SETTINGS,
      presets: [],
      managedUsers: [],
      auditLogs: [],
    });

    render(
      <ToastProvider>
        <StoreProvider>
          <Sidebar
            activeSchoolId="sch-logo-1"
            setActiveSchoolId={vi.fn()}
            activeSpecId={null}
            setActiveSpecId={vi.fn()}
          />
        </StoreProvider>
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('img', { name: /Crest School/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add Specialization' }));
    expect(screen.getByRole('button', { name: 'Confirm add specialization' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Crest School' }));
    expect(screen.getByText('Edit School & Logo')).toBeInTheDocument();
  });

  it('StudentFormModal omits Teacher Picture/Name inputs and allows submitting without Roll/ID No.', () => {
    const onSave = vi.fn();
    render(
      <ToastProvider>
        <StoreProvider>
          <StudentFormModal
            isOpen
            mode="add"
            defaultTeacherName="Marlon Manalili"
            onSave={onSave}
            onClose={vi.fn()}
          />
        </StoreProvider>
      </ToastProvider>
    );

    expect(screen.queryByText(/^Teacher Name$/i)).toBeNull();
    expect(screen.queryByText(/Teacher Picture/i)).toBeNull();

    fireEvent.change(screen.getByPlaceholderText(/Maria Santos/i), {
      target: { value: 'Juan Dela Cruz' },
    });
    const addBtn = screen.getByRole('button', { name: /^Add Student$/i });
    expect(addBtn).toBeEnabled();
    fireEvent.click(addBtn);

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Juan Dela Cruz',
        rollNo: '',
        teacherName: 'Marlon Manalili',
      })
    );
  });

  it('RosterView renders Face Check-In button and Face ID badges for enrolled students, and StudentFormModal exposes Face Enrollment controls', () => {
    const d = new Date();
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;

    const enrolledSpec: Specialization = {
      id: 'spec-face',
      name: 'Piano',
      teacherName: 'Ms. Reyes',
      rubricCriteria: [],
      students: [
        {
          id: 'st-face-1',
          name: 'Ana Bautista',
          rollNo: '',
          gradeLevel: 'Grade 6',
          gender: 'Female',
          contactNo: '',
          teacherName: 'Ms. Reyes',
          photo: 'data:image/jpeg;base64,portrait',
          faceDescriptors: [new Array(192).fill(0.1)],
          attendance: { [todayStr]: 'Present' },
          attendanceMeta: { [todayStr]: { method: 'face_kiosk', confidence: 0.94 } },
          evaluations: [],
        },
      ],
    };
    const school: School = {
      id: 'sch-face',
      name: 'Music Academy',
      specializations: [enrolledSpec],
    };

    render(
      <ToastProvider>
        <StoreProvider>
          <RosterView school={school} spec={enrolledSpec} />
        </StoreProvider>
      </ToastProvider>
    );

    expect(screen.getByRole('button', { name: /Face Check-In/i })).toBeInTheDocument();
    expect(screen.getByText('Face ID')).toBeInTheDocument();
    expect(screen.getByText('Face Today')).toBeInTheDocument();

    render(
      <ToastProvider>
        <StoreProvider>
          <StudentFormModal
            isOpen
            mode="edit"
            initialStudent={enrolledSpec.students[0]}
            onSave={vi.fn()}
            onClose={vi.fn()}
          />
        </StoreProvider>
      </ToastProvider>
    );

    expect(screen.getByRole('button', { name: /Add Camera Angle \(1\/3\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clear Face Data/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Use Portrait Photo/i })).toBeInTheDocument();
  });
});

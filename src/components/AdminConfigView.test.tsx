import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AdminConfigView from './AdminConfigView';
import { ToastProvider } from '../context/ToastContext';
import { DEFAULT_SYSTEM_SETTINGS } from '../services/permissions';

const mockUpdateSystemSettings = vi.fn();
const mockUpdateUserAssignments = vi.fn();
const mockCreateManagedUserAccount = vi.fn();

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    profile: {
      id: 'admin-1',
      email: 'admin@school.edu',
      fullName: 'Head Admin',
      role: 'admin',
      isActive: true,
    },
  }),
}));

vi.mock('../store', () => ({
  useStore: () => ({
    schools: [
      {
        id: 'sch-1',
        name: 'Lincoln High',
        specializations: [
          { id: 'sp-1', name: 'STEM', students: [], rubricCriteria: [] },
          { id: 'sp-2', name: 'Arts', students: [], rubricCriteria: [] },
        ],
      },
      {
        id: 'sch-2',
        name: 'North Academy',
        specializations: [
          { id: 'sp-3', name: 'ICT', students: [], rubricCriteria: [] },
          { id: 'sp-4', name: 'ABM', students: [], rubricCriteria: [] },
        ],
      },
    ],
    systemSettings: DEFAULT_SYSTEM_SETTINGS,
    managedUsers: [
      {
        id: 't-1',
        email: 'teacher@school.edu',
        fullName: 'Ms. Cruz',
        role: 'teacher',
        isActive: true,
        assignments: [{ teacherId: 't-1', schoolId: 'sch-1', specializationId: 'sp-1' }],
      },
    ],
    auditLogs: [
      {
        id: 1,
        actorId: 'admin-1',
        actorEmail: 'admin@school.edu',
        actorRole: 'admin',
        action: 'UPDATE_SETTINGS',
        entityType: 'system_settings',
        entityId: '1',
        schoolId: null,
        metadata: {},
        createdAt: '2026-11-22T01:00:00.000Z',
      },
    ],
    updateSystemSettings: mockUpdateSystemSettings,
    updateManagedUserAccess: mockUpdateUserAssignments,
    createManagedUserAccount: mockCreateManagedUserAccount,
    importLegacyJsonToCloud: vi.fn(),
    refreshWorkspace: vi.fn(),
  }),
}));

describe('AdminConfigView', () => {
  it('allows Admins to inspect users, switch to System Customization, and save threshold/scale', () => {
    render(
      <ToastProvider>
        <AdminConfigView />
      </ToastProvider>
    );

    expect(screen.getByText('Ms. Cruz')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /System Customization/i }));

    const thresholdInput = screen.getByLabelText(/Attendance Pass Threshold/i);
    fireEvent.change(thresholdInput, { target: { value: '85' } });
    fireEvent.click(screen.getByRole('button', { name: /Save System Settings/i }));

    expect(mockUpdateSystemSettings).toHaveBeenCalledWith(
      expect.objectContaining({ attendanceThreshold: 85 })
    );

    fireEvent.click(screen.getByRole('button', { name: /Audit & Data/i }));
    expect(screen.getByText('UPDATE_SETTINGS')).toBeInTheDocument();
  });

  it('allows Admin to assign two or more schools and multiple specializations when creating a Teacher account', () => {
    mockCreateManagedUserAccount.mockResolvedValue({ needsEmailConfirmation: false });

    render(
      <ToastProvider>
        <AdminConfigView />
      </ToastProvider>
    );

    expect(screen.getByText(/Lincoln High: STEM/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Add User Account/i }));

    fireEvent.change(screen.getByPlaceholderText(/Mr\. Carlos Reyes/i), {
      target: { value: 'Rachelle Manalili' },
    });
    fireEvent.change(screen.getByPlaceholderText(/teacher@school\.edu/i), {
      target: { value: 'rachellemanalili@gmail.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'password123' },
    });

    fireEvent.click(screen.getByLabelText('Arts'));
    fireEvent.click(screen.getByLabelText('ICT'));
    fireEvent.click(screen.getByLabelText('ABM'));

    fireEvent.click(screen.getByRole('button', { name: /Create Account/i }));

    expect(mockCreateManagedUserAccount).toHaveBeenCalledWith({
      email: 'rachellemanalili@gmail.com',
      password: 'password123',
      fullName: 'Rachelle Manalili',
      role: 'teacher',
      assignments: [
        { schoolId: 'sch-1', specializationId: 'sp-2' },
        { schoolId: 'sch-2', specializationId: 'sp-3' },
        { schoolId: 'sch-2', specializationId: 'sp-4' },
      ],
    });
  });
});

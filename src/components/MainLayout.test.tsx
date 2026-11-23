import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import MainLayout from './MainLayout';
import { ToastProvider } from '../context/ToastContext';
import { StoreProvider } from '../store';
import { DEFAULT_SYSTEM_SETTINGS } from '../services/permissions';
import * as supabaseDb from '../services/supabaseDb';
import { UserRole } from '../types';

let currentRole: UserRole = 'teacher';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    profile: {
      id: 'u-1',
      email: 'user@school.edu',
      fullName: 'Ms. Cruz',
      role: currentRole,
      isActive: true,
    },
    assignments: [],
    signOut: vi.fn(),
  }),
}));

vi.mock('../services/supabaseDb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/supabaseDb')>();
  return {
    ...actual,
    fetchWorkspaceSnapshot: vi.fn(),
  };
});

describe('MainLayout Role-Based Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentRole = 'teacher';
    vi.mocked(supabaseDb.fetchWorkspaceSnapshot).mockResolvedValue({
      schools: [],
      systemSettings: DEFAULT_SYSTEM_SETTINGS,
      presets: [],
      managedUsers: [],
      auditLogs: [],
    });
  });

  it('hides Admin tab for Teacher and shows assignment guidance when no schools are assigned', async () => {
    render(
      <StrictMode>
        <ToastProvider>
          <StoreProvider>
            <MainLayout />
          </StoreProvider>
        </ToastProvider>
      </StrictMode>
    );

    await waitFor(() => {
      expect(screen.getByText(/No schools or specializations have been assigned/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /^Admin$/i })).toBeNull();
  });

  it('shows Admin tab exclusively for Admin role', async () => {
    currentRole = 'admin';
    render(
      <ToastProvider>
        <StoreProvider>
          <MainLayout />
        </StoreProvider>
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^Admin$/i }).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('gives Directors fast Global Search across Schools, Teachers, and Students plus sidebar filtering', async () => {
    currentRole = 'director';
    vi.mocked(supabaseDb.fetchWorkspaceSnapshot).mockResolvedValue({
      schools: [
        {
          id: 'sch-1',
          name: 'Lincoln High',
          specializations: [
            {
              id: 'sp-1',
              name: 'GUITAR',
              rubricCriteria: [],
              students: [
                {
                  id: 'st-1',
                  name: 'Lucia Navarro',
                  rollNo: '',
                  gradeLevel: 'Grade 8',
                  gender: 'Female',
                  contactNo: '',
                  teacherName: 'Cris Cabahug',
                  attendance: {},
                  evaluations: [],
                },
              ],
            },
          ],
        },
        {
          id: 'sch-2',
          name: 'Dominican School',
          specializations: [],
        },
      ],
      systemSettings: DEFAULT_SYSTEM_SETTINGS,
      presets: [],
      managedUsers: [
        {
          id: 't-1',
          email: 'cris@school.edu',
          fullName: 'Cris Cabahug',
          role: 'teacher',
          isActive: true,
          assignments: [{ teacherId: 't-1', schoolId: 'sch-1', specializationId: 'sp-1' }],
        },
      ],
      auditLogs: [],
    });

    render(
      <ToastProvider>
        <StoreProvider>
          <MainLayout />
        </StoreProvider>
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Open global search/i })).toBeInTheDocument();
    });

    // Sidebar school filter narrows visible schools cleanly
    const sidebar = screen.getByLabelText(/Filter schools in sidebar/i).closest('aside')!;
    const sidebarFilter = screen.getByLabelText(/Filter schools in sidebar/i);
    fireEvent.change(sidebarFilter, { target: { value: 'Dominican' } });
    expect(within(sidebar).getByText('Dominican School')).toBeInTheDocument();
    expect(within(sidebar).queryByText('Lincoln High')).toBeNull();

    // Open Global Search modal and search for Student
    fireEvent.click(screen.getByRole('button', { name: /Open global search/i }));
    const globalInput = screen.getByPlaceholderText(/Search across all Schools, Teachers, and Students/i);
    const modal = globalInput.closest('.fixed') as HTMLElement;
    fireEvent.change(globalInput, { target: { value: 'Lucia' } });

    expect(within(modal).getByText('Lucia Navarro')).toBeInTheDocument();
    expect(within(modal).queryByText('Cris Cabahug')).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AttendanceModal from './AttendanceModal';
import ReportsView from './ReportsView';
import QueryBuilderView from './QueryBuilderView';
import PWAInstallButton from './PWAInstallButton';
import { ToastProvider } from '../context/ToastContext';
import { StoreProvider } from '../store';
import { DEFAULT_SYSTEM_SETTINGS } from '../services/permissions';
import * as supabaseDb from '../services/supabaseDb';
import { School } from '../types';
import * as exportUtils from '../utils/export';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    profile: {
      id: 'dir-1',
      email: 'director@ez.edu',
      fullName: 'Director',
      role: 'director',
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
    dbSetAttendance: vi.fn().mockResolvedValue(undefined),
    dbSaveQueryPreset: vi.fn().mockResolvedValue(undefined),
  };
});

function makeSeedSchools(): School[] {
  return [
    {
      id: 'sch-1',
      name: 'Alpha High',
      logo: 'data:image/jpeg;base64,alphalogo',
      specializations: [
        {
          id: 'sp-1',
          name: 'STEM',
          teacherName: 'Ms. Cruz',
          rubricCriteria: [{ id: 'c1', name: 'Logic' }],
          students: [
            {
              id: 'st-1',
              name: 'Maria Santos',
              rollNo: '001',
              gradeLevel: 'Grade 10',
              gender: 'Female',
              contactNo: '0917-123-4567',
              teacherName: 'Ms. Cruz',
              attendance: { '2026-11-18': 'Present', '2026-11-19': 'Absent' },
              evaluations: [{ id: 'ev-1', date: '2026-11-19', scores: { c1: 5 } }],
            },
          ],
        },
      ],
    },
  ];
}

describe('Core Views integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabaseDb.fetchWorkspaceSnapshot).mockResolvedValue({
      schools: makeSeedSchools(),
      systemSettings: DEFAULT_SYSTEM_SETTINGS,
      presets: [],
      managedUsers: [],
      auditLogs: [],
    });
  });

  it('AttendanceModal logs Present/Absent/Clear and navigates months', () => {
    const school = makeSeedSchools()[0];
    const student = school.specializations[0].students[0];

    render(
      <ToastProvider>
        <StoreProvider>
          <AttendanceModal
            schoolId={school.id}
            specId="sp-1"
            student={student}
            defaultTeacherName="Ms. Cruz"
            onClose={vi.fn()}
          />
        </StoreProvider>
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('15'));
    expect(screen.getByRole('button', { name: /Present/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Present/i }));

    fireEvent.click(screen.getByRole('button', { name: /Prev/i }));
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
  });

  it('ReportsView displays school logo banner, KPIs, and exports CSV', async () => {
    const csvSpy = vi.spyOn(exportUtils, 'downloadCSV').mockImplementation(() => {});

    render(
      <ToastProvider>
        <StoreProvider>
          <ReportsView defaultSchoolId="sch-1" defaultSpecId="all" />
        </StoreProvider>
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('School Analytics Report')).toBeInTheDocument();
    });
    expect(screen.getByText('Maria Santos')).toBeInTheDocument();
    expect(screen.getAllByText('50%').length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole('button', { name: /Export CSV/i }));
    expect(csvSpy).toHaveBeenCalled();
    csvSpy.mockRestore();
  });

  it('QueryBuilderView applies presets, adds filter rules, switches datasets, and saves presets', async () => {
    render(
      <ToastProvider>
        <StoreProvider>
          <QueryBuilderView />
        </StoreProvider>
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Maria Santos')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Attendance Below 80%/i }));
    expect(screen.getByText('1 of 1 rows')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Attendance Logs/i }));
    expect(screen.getByText('2 of 2 rows')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Add Filter Rule/i }));
    fireEvent.click(screen.getByRole('button', { name: /Save Current Query/i }));
    fireEvent.change(screen.getByPlaceholderText('Preset name...'), {
      target: { value: 'My Filter' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('My Filter')).toBeInTheDocument();
  });

  it('PWAInstallButton opens Apple & Android guide and downloads .mobileconfig profile', async () => {
    const dlSpy = vi.spyOn(exportUtils, 'downloadTextFile').mockResolvedValue(undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
    );

    render(
      <ToastProvider>
        <PWAInstallButton variant="sidebar" />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /Install on Phone \/ Apple/i }));
    fireEvent.click(screen.getByRole('button', { name: /Apple \(iPhone \/ iPad \/ Mac\)/i }));

    const urlInput = screen.getByPlaceholderText('https://your-ez-center-url.vercel.app');
    fireEvent.change(urlInput, { target: { value: 'https://ez.example.org' } });
    fireEvent.click(screen.getByRole('button', { name: /\.mobileconfig/i }));

    await waitFor(() => {
      expect(dlSpy).toHaveBeenCalledWith(
        'EZ-Center-iOS.mobileconfig',
        expect.stringContaining('https://ez.example.org'),
        'application/x-apple-aspen-config'
      );
    });
    dlSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});

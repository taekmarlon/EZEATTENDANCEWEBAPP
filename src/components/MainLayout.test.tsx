import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
});

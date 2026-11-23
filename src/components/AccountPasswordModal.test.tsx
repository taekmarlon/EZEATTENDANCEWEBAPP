import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AccountPasswordModal from './AccountPasswordModal';
import { ToastProvider } from '../context/ToastContext';

const mockUpdateOwnProfile = vi.fn();
const mockChangeOwnPassword = vi.fn();

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    profile: {
      id: 'teacher-1',
      email: 'cris@school.edu',
      fullName: 'Cris Cabahug',
      role: 'teacher',
      isActive: true,
    },
    assignments: [{ teacherId: 'teacher-1', schoolId: 'sch-1', specializationId: 'sp-1' }],
    updateOwnProfile: (...args: unknown[]) => mockUpdateOwnProfile(...args),
    changeOwnPassword: (...args: unknown[]) => mockChangeOwnPassword(...args),
  }),
}));

describe('AccountPasswordModal (My Teacher Profile & Security)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateOwnProfile.mockResolvedValue(undefined);
    mockChangeOwnPassword.mockResolvedValue(undefined);
  });

  it('lets logged-in Teachers edit and save their own name/photo and view assigned classes', async () => {
    const onClose = vi.fn();
    render(
      <ToastProvider>
        <AccountPasswordModal
          isOpen
          initialTab="profile"
          schools={[
            {
              id: 'sch-1',
              name: 'Dominican School',
              specializations: [
                { id: 'sp-1', name: 'GUITAR', students: [], rubricCriteria: [] },
              ],
            },
          ]}
          onClose={onClose}
        />
      </ToastProvider>
    );

    expect(screen.getByText(/My Teacher Profile & Security/i)).toBeInTheDocument();
    expect(screen.getByText(/Dominican School: GUITAR/i)).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/Full Name/i);
    fireEvent.change(nameInput, { target: { value: 'Crisanto Cabahug' } });
    fireEvent.click(screen.getByRole('button', { name: /Save My Profile/i }));

    await waitFor(() => {
      expect(mockUpdateOwnProfile).toHaveBeenCalledWith('Crisanto Cabahug', undefined);
    });
    expect(onClose).toHaveBeenCalled();
  });
});

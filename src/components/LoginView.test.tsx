import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginView from './LoginView';
import { ToastProvider } from '../context/ToastContext';

const mockSignIn = vi.fn();

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    signIn: mockSignIn,
    signUp: vi.fn(),
    isLoggingIn: false,
    authError: null,
    clearAuthError: vi.fn(),
    isConfigured: true,
  }),
}));

describe('LoginView 3-role portal selector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Teacher, Director, and Admin portal tabs and passes selected role on submit', async () => {
    mockSignIn.mockResolvedValue(true);
    render(
      <ToastProvider>
        <LoginView />
      </ToastProvider>
    );

    expect(screen.queryByText(/First-time setup or self-register/i)).toBeNull();
    expect(screen.getByRole('button', { name: /^Teacher$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Director$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Admin$/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Director$/i }));
    fireEvent.change(screen.getByLabelText(/Email Address/i), {
      target: { value: 'director@school.edu' },
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Sign in as Director/i }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('director@school.edu', 'password123', 'director');
    });
  });

  it('displays an actionable error banner when Supabase redirects back with an expired confirmation link hash', () => {
    const originalHash = window.location.hash;
    window.location.hash =
      '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';
    try {
      render(
        <ToastProvider>
          <LoginView />
        </ToastProvider>
      );
      expect(screen.getByText(/Email link is invalid or has expired/i)).toBeInTheDocument();
    } finally {
      window.location.hash = originalHash;
    }
  });
});

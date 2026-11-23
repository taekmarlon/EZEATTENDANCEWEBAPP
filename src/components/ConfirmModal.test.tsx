import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ConfirmModal from './ConfirmModal';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    profile: {
      id: 'dir-1',
      email: 'director@school.edu',
      fullName: 'Director',
      role: 'director',
      isActive: true,
    },
  }),
}));

describe('ConfirmModal type-to-confirm DELETE guard', () => {
  it('keeps Delete button disabled for Admin/Director until exact DELETE is typed', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmModal
        isOpen
        title="Delete School"
        confirmText="Delete School"
        message={<p>Permanent deletion</p>}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    const deleteBtn = screen.getByRole('button', { name: /Delete School/i });
    expect(deleteBtn).toBeDisabled();

    const input = screen.getByLabelText(/Type DELETE to confirm/i);
    fireEvent.change(input, { target: { value: 'delete' } });
    expect(deleteBtn).toBeDisabled();

    fireEvent.change(input, { target: { value: 'DELETE' } });
    expect(deleteBtn).not.toBeDisabled();

    fireEvent.click(deleteBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

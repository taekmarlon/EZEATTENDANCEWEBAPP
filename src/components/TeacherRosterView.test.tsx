import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TeacherRosterView from './TeacherRosterView';
import { ToastProvider } from '../context/ToastContext';

const mockAssignSpecializationTeachers = vi.fn();

vi.mock('../store', () => ({
  useStore: () => ({
    schools: [
      {
        id: 'sch-1',
        name: 'Dominican Angeles',
        specializations: [
          {
            id: 'sp-1',
            name: 'Taekwondo',
            coTeachers: [{ id: 't-1', fullName: 'Rachelle Manalili' }],
            students: [],
            rubricCriteria: [],
          },
          {
            id: 'sp-2',
            name: 'Robotics',
            coTeachers: [
              { id: 't-1', fullName: 'Rachelle Manalili' },
              { id: 't-2', fullName: 'Carlos Reyes' },
            ],
            students: [],
            rubricCriteria: [],
          },
        ],
      },
    ],
    managedUsers: [
      {
        id: 't-1',
        email: 'rachelle@school.edu',
        fullName: 'Rachelle Manalili',
        role: 'teacher',
        isActive: true,
        assignments: [
          { teacherId: 't-1', schoolId: 'sch-1', specializationId: 'sp-1' },
          { teacherId: 't-1', schoolId: 'sch-1', specializationId: 'sp-2' },
        ],
      },
      {
        id: 't-2',
        email: 'carlos@school.edu',
        fullName: 'Carlos Reyes',
        role: 'teacher',
        isActive: true,
        assignments: [{ teacherId: 't-2', schoolId: 'sch-1', specializationId: 'sp-2' }],
      },
    ],
    permissions: {
      canAssignTeachersToSpecializations: true,
    },
    assignSpecializationTeachers: mockAssignSpecializationTeachers,
  }),
}));

describe('TeacherRosterView co-teaching & assignments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssignSpecializationTeachers.mockResolvedValue(undefined);
  });

  it('shows teacher roster with assigned/available specializations and lets Directors assign a 2nd co-teacher while capping at 2', async () => {
    render(
      <ToastProvider>
        <TeacherRosterView />
      </ToastProvider>
    );

    expect(screen.getAllByText('Rachelle Manalili').length).toBeGreaterThan(0);
    expect(screen.getByText('2/2 Co-Teaching Full')).toBeInTheDocument();

    const select = screen.getByLabelText(/Assign co-teacher to Robotics|Assign co-teacher to Taekwondo/i);
    fireEvent.change(select, { target: { value: 't-2' } });
    fireEvent.click(screen.getByRole('button', { name: /Assign to Taekwondo/i }));

    await waitFor(() => {
      expect(mockAssignSpecializationTeachers).toHaveBeenCalledWith('sch-1', 'sp-1', ['t-1', 't-2']);
    });
  });
});

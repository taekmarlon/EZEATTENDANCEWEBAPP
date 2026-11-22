import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SYSTEM_SETTINGS,
  filterSchoolsForUser,
  getRolePermissions,
} from './permissions';
import { School, TeacherAssignment } from '../types';

const sampleSchools: School[] = [
  {
    id: 'sch-1',
    name: 'North High',
    specializations: [
      { id: 'sp-1', name: 'STEM', students: [], rubricCriteria: [] },
      { id: 'sp-2', name: 'Arts', students: [], rubricCriteria: [] },
    ],
  },
  {
    id: 'sch-2',
    name: 'South Academy',
    specializations: [
      { id: 'sp-3', name: 'Music', students: [], rubricCriteria: [] },
      { id: 'sp-4', name: 'Robotics', students: [], rubricCriteria: [] },
    ],
  },
  {
    id: 'sch-3',
    name: 'West Institute',
    specializations: [
      { id: 'sp-5', name: 'Culminating', students: [], rubricCriteria: [] },
    ],
  },
];

describe('RBAC permissions & specialization scoping', () => {
  it('restricts Teacher strictly to assigned schools and assigned specializations', () => {
    const assignments: TeacherAssignment[] = [
      { teacherId: 'u-1', schoolId: 'sch-1', specializationId: 'sp-1' },
    ];

    const visible = filterSchoolsForUser(sampleSchools, 'teacher', assignments);
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe('sch-1');
    expect(visible[0].specializations.map((s) => s.id)).toEqual(['sp-1']);
  });

  it('supports assigning a Teacher to two or more schools and multiple specializations across them', () => {
    const assignments: TeacherAssignment[] = [
      { teacherId: 'u-1', schoolId: 'sch-1', specializationId: 'sp-1' },
      { teacherId: 'u-1', schoolId: 'sch-1', specializationId: 'sp-2' },
      { teacherId: 'u-1', schoolId: 'sch-2', specializationId: 'sp-3' },
    ];

    const visible = filterSchoolsForUser(sampleSchools, 'teacher', assignments);
    expect(visible.map((s) => s.id)).toEqual(['sch-1', 'sch-2']);
    expect(visible[0].specializations.map((sp) => sp.id)).toEqual(['sp-1', 'sp-2']);
    expect(visible[1].specializations.map((sp) => sp.id)).toEqual(['sp-3']);
  });

  it('allows school-wide specializations when specializationId is null', () => {
    const assignments: TeacherAssignment[] = [
      { teacherId: 'u-1', schoolId: 'sch-1', specializationId: null },
    ];

    const visible = filterSchoolsForUser(sampleSchools, 'teacher', assignments);
    expect(visible).toHaveLength(1);
    expect(visible[0].specializations.map((s) => s.id)).toEqual(['sp-1', 'sp-2']);
  });

  it('gives Director and Admin access to all schools and all specializations', () => {
    expect(filterSchoolsForUser(sampleSchools, 'director', [])).toHaveLength(3);
    expect(filterSchoolsForUser(sampleSchools, 'admin', [])).toHaveLength(3);
  });

  it('computes accurate capability flags for Teacher, Director, and Admin', () => {
    const teacherPerms = getRolePermissions('teacher', DEFAULT_SYSTEM_SETTINGS);
    expect(teacherPerms.canManageStudentsAndAttendance).toBe(true);
    expect(teacherPerms.canConfigureRubricsAndGrade).toBe(true);
    expect(teacherPerms.canManageSchools).toBe(false);
    expect(teacherPerms.canAccessAdminConsole).toBe(false);

    const directorEditable = getRolePermissions('director', {
      ...DEFAULT_SYSTEM_SETTINGS,
      directorCanEdit: true,
    });
    expect(directorEditable.canViewAllSchoolsAndReports).toBe(true);
    expect(directorEditable.canManageSchools).toBe(true);
    expect(directorEditable.canAccessAdminConsole).toBe(false);

    const directorReadOnly = getRolePermissions('director', {
      ...DEFAULT_SYSTEM_SETTINGS,
      directorCanEdit: false,
    });
    expect(directorReadOnly.canViewAllSchoolsAndReports).toBe(true);
    expect(directorReadOnly.canManageStudentsAndAttendance).toBe(false);
    expect(directorReadOnly.canManageSchools).toBe(false);

    const adminPerms = getRolePermissions('admin', directorReadOnly ? {
      ...DEFAULT_SYSTEM_SETTINGS,
      directorCanEdit: false,
    } : DEFAULT_SYSTEM_SETTINGS);
    expect(adminPerms.canAccessAdminConsole).toBe(true);
    expect(adminPerms.canManageUsersAndSettings).toBe(true);
    expect(adminPerms.canManageSchools).toBe(true);
  });
});

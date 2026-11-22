import { School, SystemSettings, TeacherAssignment, UserRole } from '../types';

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  portalName: 'EZ Center Portal',
  primaryColor: '#6d28d9',
  attendanceThreshold: 80,
  rubricMin: 1,
  rubricMax: 5,
  rubricLabels: {
    '1': 'Beginning',
    '2': 'Developing',
    '3': 'Proficient',
    '4': 'Advanced',
    '5': 'Exemplary',
  },
  customStudentFields: [],
  directorCanEdit: true,
};

export interface RolePermissions {
  canAccessAdminConsole: boolean;
  canManageUsersAndSettings: boolean;
  canManageSchools: boolean;
  canManageSpecializations: boolean;
  canEditSpecializationTeacher: boolean;
  canManageStudentsAndAttendance: boolean;
  canConfigureRubricsAndGrade: boolean;
  canViewAllSchoolsAndReports: boolean;
}

export function getRolePermissions(role: UserRole, settings: SystemSettings): RolePermissions {
  const isAdmin = role === 'admin';
  const isDirector = role === 'director';
  const isTeacher = role === 'teacher';
  const directorWrite = isDirector && settings.directorCanEdit;

  return {
    canAccessAdminConsole: isAdmin,
    canManageUsersAndSettings: isAdmin,
    canManageSchools: isAdmin || directorWrite,
    canManageSpecializations: isAdmin || directorWrite,
    canEditSpecializationTeacher: isAdmin || isTeacher || directorWrite,
    canManageStudentsAndAttendance: isAdmin || isTeacher || directorWrite,
    canConfigureRubricsAndGrade: isAdmin || isTeacher || directorWrite,
    canViewAllSchoolsAndReports: isAdmin || isDirector,
  };
}

/**
 * Defense-in-depth client filtering mirroring PostgreSQL RLS:
 * Teachers only see schools and specializations explicitly assigned to them.
 */
export function filterSchoolsForUser(
  schools: School[],
  role: UserRole,
  assignments: TeacherAssignment[]
): School[] {
  if (role === 'admin' || role === 'director') {
    return schools;
  }

  const bySchool = new Map<string, { schoolWide: boolean; specIds: Set<string> }>();
  for (const a of assignments) {
    const entry = bySchool.get(a.schoolId) || { schoolWide: false, specIds: new Set<string>() };
    if (a.specializationId === null) {
      entry.schoolWide = true;
    } else {
      entry.specIds.add(a.specializationId);
    }
    bySchool.set(a.schoolId, entry);
  }

  const out: School[] = [];
  for (const school of schools) {
    const access = bySchool.get(school.id);
    if (!access) continue;
    const allowedSpecs = access.schoolWide
      ? school.specializations
      : school.specializations.filter((sp) => access.specIds.has(sp.id));
    out.push({
      ...school,
      specializations: allowedSpecs,
    });
  }
  return out;
}

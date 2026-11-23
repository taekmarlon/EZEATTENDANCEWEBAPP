import {
  DirectorPermissions,
  School,
  SystemSettings,
  TeacherAssignment,
  UserRole,
} from '../types';

export const DEFAULT_DIRECTOR_PERMISSIONS: DirectorPermissions = {
  canCreateSchools: true,
  canEditSchools: true,
  canDeleteSchools: true,
  canCreateSpecializations: true,
  canEditSpecializations: true,
  canDeleteSpecializations: true,
  canAssignTeachers: true,
  canManageStudents: true,
  canDeleteStudents: true,
  canManageAttendanceAndRubrics: true,
  canConfigureRubrics: true,
  canDeleteEvaluationsOrCriteria: true,
  canExportReports: true,
};

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
  directorPermissions: DEFAULT_DIRECTOR_PERMISSIONS,
};

export function normalizeDirectorPermissions(settings: SystemSettings): DirectorPermissions {
  if (!settings.directorCanEdit) {
    return {
      canCreateSchools: false,
      canEditSchools: false,
      canDeleteSchools: false,
      canCreateSpecializations: false,
      canEditSpecializations: false,
      canDeleteSpecializations: false,
      canAssignTeachers: false,
      canManageStudents: false,
      canDeleteStudents: false,
      canManageAttendanceAndRubrics: false,
      canConfigureRubrics: false,
      canDeleteEvaluationsOrCriteria: false,
      canExportReports: settings.directorPermissions?.canExportReports ?? true,
    };
  }
  return {
    ...DEFAULT_DIRECTOR_PERMISSIONS,
    ...(settings.directorPermissions || {}),
  };
}

export interface RolePermissions {
  canAccessAdminConsole: boolean;
  canManageUsersAndSettings: boolean;
  canViewTeacherRoster: boolean;
  canAssignTeachersToSpecializations: boolean;
  canCreateSchools: boolean;
  canEditSchools: boolean;
  canDeleteSchools: boolean;
  canCreateSpecializations: boolean;
  canDeleteSpecializations: boolean;
  canManageSchools: boolean;
  canManageSpecializations: boolean;
  canEditSpecializationTeacher: boolean;
  canManageStudentsAndAttendance: boolean;
  canDeleteStudents: boolean;
  canLogAttendanceAndGrade: boolean;
  canConfigureRubricsAndGrade: boolean;
  canConfigureRubrics: boolean;
  canDeleteEvaluationsOrCriteria: boolean;
  canExportReports: boolean;
  canViewAllSchoolsAndReports: boolean;
}

export function getRolePermissions(role: UserRole, settings: SystemSettings): RolePermissions {
  const isAdmin = role === 'admin';
  const isDirector = role === 'director';
  const isTeacher = role === 'teacher';
  const dp = normalizeDirectorPermissions(settings);

  const canCreateSchools = isAdmin || (isDirector && dp.canCreateSchools);
  const canEditSchools = isAdmin || (isDirector && dp.canEditSchools);
  const canDeleteSchools = isAdmin || (isDirector && dp.canDeleteSchools);
  const canCreateSpecializations = isAdmin || (isDirector && dp.canCreateSpecializations);
  const canDeleteSpecializations = isAdmin || (isDirector && dp.canDeleteSpecializations);

  return {
    canAccessAdminConsole: isAdmin,
    canManageUsersAndSettings: isAdmin,
    canViewTeacherRoster: isAdmin || isDirector,
    canAssignTeachersToSpecializations: isAdmin || (isDirector && dp.canAssignTeachers),
    canCreateSchools,
    canEditSchools,
    canDeleteSchools,
    canCreateSpecializations,
    canDeleteSpecializations,
    canManageSchools: canCreateSchools || canEditSchools || canDeleteSchools,
    canManageSpecializations: canCreateSpecializations || canDeleteSpecializations,
    canEditSpecializationTeacher: isAdmin || isTeacher || (isDirector && dp.canEditSpecializations),
    canManageStudentsAndAttendance: isAdmin || isTeacher || (isDirector && dp.canManageStudents),
    canDeleteStudents: isAdmin || isTeacher || (isDirector && dp.canDeleteStudents),
    canLogAttendanceAndGrade:
      isAdmin || isTeacher || (isDirector && dp.canManageAttendanceAndRubrics),
    canConfigureRubricsAndGrade:
      isAdmin ||
      isTeacher ||
      (isDirector && (dp.canConfigureRubrics || dp.canManageAttendanceAndRubrics)),
    canConfigureRubrics: isAdmin || isTeacher || (isDirector && dp.canConfigureRubrics),
    canDeleteEvaluationsOrCriteria:
      isAdmin || isTeacher || (isDirector && dp.canDeleteEvaluationsOrCriteria),
    canExportReports: isAdmin || isTeacher || (isDirector && dp.canExportReports),
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
